# Feature: Fix iOS PWA — Home se queda colgado en el skeleton al volver de otra pestaña

## 📋 Specification-Driven Development (SDD)

Al navegar a otra sección (ej. "Sedes") y volver a Home en la PWA de iOS, a veces el skeleton se queda mostrándose para siempre o tarda muchísimo en resolver. Hay que arreglar la condición de carga para que sea robusta a las suspensiones de iOS.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Eliminar el estado "skeleton infinito" en Home cuando el usuario vuelve a la app desde otra ruta o desde background en iOS PWA. Hoy la pantalla puede quedar atascada mostrando `HomeSkeleton` indefinidamente, obligando al usuario a cerrar y reabrir la app.

### Causa raíz (diagnóstico)
1. **`getDocs` sin timeout** ([lib/matches.ts:144-147](../lib/matches.ts#L144-L147), [lib/matches.ts:171](../lib/matches.ts#L171)). Cuando iOS suspende la PWA y se pierde el evento `visibilitychange → visible` al volver, el canal interno de Firestore queda pausado; el `getDocs` que inicia el effect de Home nunca resuelve ni rechaza.
2. **Effect re-disparado con `setLoadingMatches(true)` incondicional** ([app/page.tsx:69](../app/page.tsx#L69), [app/page.tsx:120](../app/page.tsx#L120)). El effect depende de `profile`, que viene del `onSnapshot` de [AuthContext.tsx:122](../lib/AuthContext.tsx#L122). Cada emisión del snapshot produce una **nueva referencia** del objeto (aunque los datos sean iguales), re-corre el effect, y vuelve a marcar `loadingMatches = true` aunque ya tengamos datos en memoria — borrando la UI por una recarga que puede colgarse.
3. **Sin recuperación al volver del background.** No hay listener de `visibilitychange`/`pageshow` que fuerce una recarga cuando el documento vuelve a ser visible.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | El skeleton de Home solo se muestra mientras no hay datos cacheados en memoria (primera carga real). | Vuelta desde otra ruta no parpadea skeleton si ya cargamos antes. |
| 2 | Cualquier fetch de matches en Home tiene timeout duro (10 s). Pasado el timeout, se considera fallo y la UI muestra contenido cacheado (si existe) o un estado de error con CTA de reintentar. | No hay skeleton infinito. |
| 3 | Al volver a `visible` (de background o de otra ruta), si pasaron > 30 s desde el último fetch exitoso, refrescamos en background sin bloquear la UI. | Datos frescos sin parpadeo. |
| 4 | Re-emisiones del `profile` que no cambian campos relevantes para Home **no** re-disparan el fetch. | Estable contra el ruido de `onSnapshot`. |

### Alcance (actualizado 2026-06-30)
La implementación se generalizó: en vez de un hook único para Home se construyó un **primitivo reutilizable** `createCachedQueryHook` (timeout + caché en memoria + token de generación + refresh por visibility) y un hook de dominio `useUserMatches` compartido por **Home e History** (fetchean exactamente lo mismo: `getMyMatches`/`getAllMatches` + locations → comparten caché). El mismo primitivo se aplica al resto de páginas basadas en `getDocs`.

### Fuera de alcance
- Páginas que usan `onSnapshot` (ej. `/explore`, `/match/[id]`, `/join/[id]`): la suscripción se reconecta sola y el patrón timeout/Promise.race no aplica a un stream. Se trackeará aparte si siguen mostrando staleness en iOS.
- Cambiar el modelo de datos o moverse a `onSnapshot` en lugar de `getDocs` para matches (cambio mayor, otro SDD).

---

## 2. ESCALABILIDAD

### Volumen esperado
- Sin cambios respecto al estado actual. Mismas queries, misma carga.
- El refresh en background al volver de visible añade ~1 fetch extra por sesión-vuelta. Despreciable.

### Índices Firestore requeridos
- Ninguno nuevo. Se reutilizan los existentes para `playerUids array-contains` + `createdAt desc` y `createdBy == uid` + `createdAt desc`.

### Paginación
- Sin cambios. Home sigue trayendo el set completo del usuario.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- Ninguna. Esta feature es solo lectura + estado local.

### Race conditions identificadas
- **Escenario**: dos `fetchMatches` en vuelo simultáneos (uno por navegación, otro por refresh en visible) → la respuesta tardía sobreescribe la rápida con datos viejos.
  - **Mitigación**: token de generación (`fetchIdRef.current++`) — solo el último fetch lanzado puede setear estado.
- **Escenario**: el componente se desmonta antes de que resuelva el fetch.
  - **Mitigación**: chequear `cancelled` flag dentro del `.then`/`.finally` antes de llamar `setState`.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Sin cambios. Sigue siendo `AuthGuard` el que protege Home, y `getMyMatches(uid)` filtra por el `uid` autenticado.

### Firestore Rules requeridas
- Ninguna modificación.

### Validaciones de input
- N/A. No hay input nuevo del usuario.

### Datos sensibles
- N/A.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `fetchMatches` lanza | Red caída, permisos, error de Firestore | Si hay datos cacheados → seguir mostrándolos + toast silencioso de "no se pudo refrescar". Si no hay → estado de error con botón "Reintentar". |
| `fetchMatches` tarda > 10 s | iOS suspendió Firestore, red lenta | Mismo fallback que error: usar caché si existe, mostrar reintentar si no. |
| `profile` viene en `null` pero `user` existe | Race con `AuthContext` | Mostrar skeleton hasta que `profile` resuelva (ya cubierto por `authLoading`). |

### Retry strategy
- No reintento automático en bucle (evitar tormenta sobre Firestore). 
- Sí refresco automático al volver a `visible` si `Date.now() - lastFetchAt > 30_000`.
- Botón "Reintentar" manual en estado de error.

### Degradación elegante
- Si el refresh falla pero hay caché en memoria, la UI sigue funcionando con los datos previos. El usuario nota la app responsiva en vez de un skeleton muerto.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Usuario abre la app → ve skeleton → carga matches → ve Home con su próximo partido. (Sin cambios respecto a hoy.)

### Flujo nuevo — navegación de ida y vuelta
1. Usuario está en Home con datos cargados → tap en "Sedes" → la navegación cliente unmounta Home.
2. Usuario vuelve a Home → el estado local de Home se reinicializa (es un client component sin caché de React), pero **no muestra skeleton si ya tenemos datos cacheados a nivel módulo**. (Ver sección 9 — caché en memoria de matches por uid).
3. Si pasaron > 30 s desde la última carga, refrescamos en background y reemplazamos los datos cuando llegan.

### Flujo nuevo — vuelta del background iOS
1. Usuario tiene Home abierto, bloquea pantalla / cambia de app por > N segundos.
2. iOS suspende la PWA; al volver, dispara `pageshow` y/o `visibilitychange → visible`.
3. Si pasaron > 30 s, refrescamos. Si el fetch tarda > 10 s, fallback al caché y toast silencioso.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando (primera vez, sin caché) | `HomeSkeleton` |
| Cargando (refresh con caché) | UI con datos cacheados, sin spinner global (puede mostrarse un indicador sutil opcional, no obligatorio en v1) |
| Vacío (sin matches) | Empty state actual (sin cambios) |
| Error sin caché | Mensaje + botón "Reintentar" |
| Error con caché | Datos cacheados visibles; toast `error` solo si el refresh fue iniciado por una acción del usuario (no por visibility) |
| Éxito | Home normal |

### Consideraciones mobile-first
- El refresh en visible no debe causar layout shift ni perder scroll position. Mantener los datos viejos hasta tener los nuevos.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- Ninguno. El skeleton ya existe (`HomeSkeleton`).

### Animaciones (Framer Motion)
- Ninguna nueva.

### Responsive
- Sin cambios.

---

## 8. ANALYTICS

Eventos genéricos (sirven para cualquier página que use el primitivo, con `source` para segmentar):

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `query_timeout` | Un fetch del hook pasa de `timeoutMs` (10 s) | `source: string`, `from_visibility`, `had_cache` |
| `query_error` | Un fetch del hook rechaza | `source: string`, `from_visibility`, `had_cache`, `error_code: string` |

Estos eventos sirven para validar que el fix funciona y para detectar regresiones en producción. Si los `query_timeout` con `source: "user_matches"` caen a casi cero después del deploy, la hipótesis se confirma.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
- Sin cambios en Firestore.

### Capa de dominio (`lib/domain/`)
- Sin cambios.

### Capa de API (`lib/`)
- **Nuevo primitivo**: `lib/hooks/createCachedQueryHook.ts` — factory genérica `createCachedQueryHook<Params, T>(fetcher, keyOf, { source, timeoutMs, staleMs })` que devuelve un hook `(params) => { data, loading, refreshing, error, retry }`. Encapsula: caché en memoria a nivel módulo por `key`, `Promise.race` con timeout duro, token de generación contra respuestas tardías, refresh automático en `visibilitychange`/`pageshow` si el caché está stale, y logging de timeout/error. `loading` solo es `true` cuando NO hay caché; con caché, los refrescos usan `refreshing`.
- **Nuevo hook de dominio**: `lib/hooks/useUserMatches.ts` — `createCachedQueryHook` configurado para `{ uid, isSuperAdmin }` → `{ matches, locationsMap }`. `key = "${uid}:${admin|player}"`. Compartido por Home e History (misma caché, un solo fetch al navegar entre ambas dentro de la ventana de stale).
- **Caché en memoria** (módulo-level, no global state):
  ```typescript
  // Cache vive en el módulo del hook. Se invalida al cambiar uid o al logout.
  const cache = new Map<string, { matches: Match[]; locationsMap: Record<string, Location>; fetchedAt: number }>();
  ```
  Esto sobrevive a la navegación cliente (mismo runtime JS), pero se pierde al cerrar la PWA.

### Componentes UI (`app/`)
- [app/page.tsx](../app/page.tsx) — reemplazar el `useEffect` de fetch + el estado local `matches/locationsMap/loadingMatches` por `const { matches, locationsMap, loading, error, retry } = useHomeMatches()`.
- Manejo del estado de error con caché: ya existe `closedMatches`/`activeMatches`, solo añadir un banner/toast cuando `error && matches.length > 0`.

### Interfaz del hook
```typescript
function useHomeMatches(): {
  matches: Match[];
  locationsMap: Record<string, Location>;
  loading: boolean;     // true solo si NO hay caché Y estamos fetcheando
  refreshing: boolean;  // true si hay caché Y estamos fetcheando en background
  error: Error | null;
  retry: () => void;
};
```

### Detalles de implementación clave
- **Timeout**: `Promise.race([fetch, new Promise((_, rej) => setTimeout(() => rej(new TimeoutError()), 10_000))])`.
- **Token de generación**: `const fetchId = ++fetchIdRef.current; await fetch; if (fetchId !== fetchIdRef.current) return;` antes de cada `setState`.
- **Visibility refresh**: 
  ```typescript
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const last = cache.get(uid)?.fetchedAt ?? 0;
      if (Date.now() - last > 30_000) fetch({ background: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [uid]);
  ```
- **Estabilidad contra re-emisiones de `profile`**: el hook solo depende de `user.uid` y un boolean derivado `isSuperAdmin(profile)`. Cambios cosméticos de `profile` (foto, stats) **no** disparan refetch.

### Cambios en `AuthContext` (opcional, mínimos)
- No es estrictamente necesario tocar `AuthContext` si el hook se aísla bien de la identidad del objeto `profile`. **Decisión**: no tocar `AuthContext` en este PR para mantener el blast radius pequeño.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Navegar Home → Sedes → Home no muestra skeleton si ya había datos cargados (mismo módulo JS vivo).
- [ ] En iOS PWA, bloquear pantalla > 1 min y volver, Home se refresca; si la red está caída el contenido cacheado sigue visible (no se queda en skeleton).
- [ ] Si `getMyMatches` no resuelve en 10 s, el hook resuelve a "error con caché" o "error sin caché"; nunca queda colgado.
- [ ] Una emisión del `onSnapshot` del perfil que no cambia `uid` ni el flag `isSuperAdmin` **no** dispara un refetch.
- [ ] Botón "Reintentar" visible cuando hay error y no hay caché.
- [ ] El evento `home_fetch_timeout` se registra cuando aplica.
- [ ] No hay regresión visual en el happy path (primera carga).

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/hooks/createCachedQueryHook.ts` | **Nuevo**. Primitivo genérico: caché en memoria, timeout (`Promise.race`), token de generación y refresh por visibility. |
| `lib/hooks/useUserMatches.ts` | **Nuevo**. Hook de dominio sobre el primitivo, compartido por Home e History. |
| `app/page.tsx` | Reemplazar el `useEffect` de fetch + estado local por `useUserMatches`. Añadir UI de error con/sin caché y botón reintentar. |
| `app/history/page.tsx` | Idem: usar `useUserMatches` (deriva los `closed`). |
| `lib/analytics.ts` | Añadir `logQueryTimeout({ source, fromVisibility, hadCache })` y `logQueryError({ source, fromVisibility, hadCache, errorCode })`. |
| `lib/domain/errors.ts` | Añadir `TimeoutError`. |

---

## 12. NOTAS DE FOLLOW-UP (fuera de alcance de este PR)

- Aplicar el mismo patrón (`useXxx` con caché en memoria + timeout + visibility refresh) a otras páginas que sufren del mismo problema en iOS PWA: `/explore`, `/venues`, `/history`, `/bookings`, `/profile`, `/wallet`. La firma del hook (`useHomeMatches`) puede generalizarse a un util `createCachedQueryHook(fetcher, options)` cuando confirmemos que el patrón es estable.
- Investigar si conviene reemplazar `getDocs` por `onSnapshot` en Home para tener datos siempre frescos. Tiene costo y requiere SDD propio.
