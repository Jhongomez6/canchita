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

### Causa raíz P0 — descubierta en la iteración 2 (2026-06-30): el cuelgue está en `AuthContext`, una capa ARRIBA del fetch de matches
La iteración 1 (puntos 1-3) blindó `getMyMatches`/`getAllMatches`, pero el usuario reportó que el skeleton **sigue** colgándose. El cuelgue real está antes del fetch de matches y afecta a **todas** las páginas (todas pasan por `AuthGuard` + `AuthContext`):

4. **`AuthContext` resuelve `loading` solo dentro del `onSnapshot` del perfil, y ese snapshot se suscribe DESPUÉS de un `await ensureUserProfile()` sin timeout** ([AuthContext.tsx:93-159](../lib/AuthContext.tsx#L93-L159)).
   - `ensureUserProfile` ([lib/users.ts:43-44](../lib/users.ts#L43-L44)) hace `getDoc`/`setDoc`/`updateDoc` crudos sin timeout. Si iOS suspendió el canal de Firestore, ese `await` **nunca resuelve** → el `onSnapshot` jamás se suscribe → `setLoading(false)`/`setInitialLoad(false)` jamás se llaman.
   - Aun resolviendo `ensureUserProfile`, `setLoading(false)` vive **solo** en el primer emit del `onSnapshot`; si ese primer emit no llega, mismo cuelgue.
   - **Cascada de 3 loaders encadenados a `loading`/`profile`**: el splash HTML inline (`app-splash`, se oculta cuando `initialLoad=false`) queda visible para siempre; [AuthGuard.tsx:85](../components/AuthGuard.tsx#L85) (`if (loading || (user && !profile))`) muestra el loader de puntitos eterno; [app/page.tsx:44](../app/page.tsx#L44) (`authLoading || matchesLoading`) muestra `HomeSkeleton` eterno.

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

### Cambios en `AuthContext` (iteración 1 → iteración 2)
- **Iteración 1 (decisión original)**: no tocar `AuthContext` para mantener el blast radius pequeño. **Esta decisión resultó insuficiente** — el cuelgue real estaba ahí (ver Causa raíz P0).
- **Iteración 2 (P0 — este cambio)**: hacer `AuthContext` robusto a las suspensiones de iOS con el mismo principio de la iteración 1 (timeout + degradación elegante). Tres cambios:
  1. **Desacoplar la suscripción del `await ensureUserProfile`.** Suscribir el `onSnapshot` del perfil **inmediatamente** al resolver `onAuthStateChanged`, y correr `ensureUserProfile` en **paralelo** (fire-and-forget con su propio `.catch`). El `onSnapshot` es la fuente de verdad del `profile`: para usuarios existentes entrega el doc sin depender de `ensureUserProfile`; para usuarios nuevos lo entrega en cuanto `ensureUserProfile` termina de crearlo. Así un cuelgue de `ensureUserProfile` ya **no** bloquea el `loading`.
  2. **Watchdog de loading.** Al autenticarse, arrancar un `setTimeout(PROFILE_LOAD_TIMEOUT_MS = 12 s)`. Si el perfil no llegó para entonces (canal de Firestore suspendido), forzar `setLoading(false)` + `setInitialLoad(false)` y marcar `profileError = true`. El primer emit con `exists()` o un error del snapshot **cancelan** el watchdog. Un emit con `!exists()` (usuario nuevo en creación) lo deja correr: si la creación se cuelga, el watchdog rescata igual.
  3. **Nuevo estado expuesto `profileError`** + manejo en `AuthGuard`: cuando `profileError && user && !profile`, mostrar pantalla de error con botón **"Reintentar"** (`window.location.reload()`) en vez del loader infinito. Default `false`; un emit exitoso lo limpia.
- **Observabilidad**: el watchdog dispara `logQueryTimeout({ source: "auth_profile", fromVisibility: false, hadCache: false })`; el error del snapshot dispara `logQueryError({ source: "auth_profile", ... })`. Reutiliza los eventos `query_timeout`/`query_error` ya existentes — si `query_timeout` con `source: "auth_profile"` cae a casi cero tras el deploy, el fix se confirma.
- **Blast radius**: el cambio toca únicamente el effect de `onAuthStateChanged` (orden de operaciones) y agrega un campo opcional al contexto. Los consumidores existentes de `useAuth()` que no leen `profileError` no se ven afectados.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Navegar Home → Sedes → Home no muestra skeleton si ya había datos cargados (mismo módulo JS vivo).
- [ ] En iOS PWA, bloquear pantalla > 1 min y volver, Home se refresca; si la red está caída el contenido cacheado sigue visible (no se queda en skeleton).
- [ ] Si `getMyMatches` no resuelve en 10 s, el hook resuelve a "error con caché" o "error sin caché"; nunca queda colgado.
- [ ] Una emisión del `onSnapshot` del perfil que no cambia `uid` ni el flag `isSuperAdmin` **no** dispara un refetch.
- [ ] Botón "Reintentar" visible cuando hay error y no hay caché.
- [ ] El evento `home_fetch_timeout` se registra cuando aplica.
- [ ] No hay regresión visual en el happy path (primera carga).

### Criterios P0 — robustez de `AuthContext` (iteración 2)
- [ ] Si `ensureUserProfile` se cuelga (getDoc que nunca resuelve), el `onSnapshot` del perfil **igual** se suscribe y `loading` resuelve cuando llega el perfil.
- [ ] Si el perfil no llega en 12 s, la app deja de mostrar el splash/loader global y muestra una pantalla de error con "Reintentar" (no se queda colgada para siempre en ninguna página).
- [ ] El happy path (perfil llega en < 1 s) no muestra la pantalla de error ni regresión visual.
- [ ] El watchdog se cancela correctamente al recibir el perfil y al cambiar de sesión (login/logout) — sin fugas de timers.
- [ ] El evento `query_timeout` con `source: "auth_profile"` se registra cuando el watchdog dispara.

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
| `lib/AuthContext.tsx` | **P0 (iteración 2)**. Suscribir el `onSnapshot` del perfil sin esperar a `ensureUserProfile` (paralelo); watchdog de 12 s que fuerza `loading=false` + `profileError=true`; exponer `profileError` en el contexto; logging `auth_profile`. |
| `components/AuthGuard.tsx` | **P0 (iteración 2)**. Cuando `profileError && user && !profile`, mostrar pantalla de error con "Reintentar" (`window.location.reload()`) en vez del loader infinito. |
| `lib/utils/withTimeout.ts` | **P1 (iteración 3)**. Nuevo. Primitivo `withTimeout(promise, ms)` extraído del inline del hook (DRY + limpia el timer al ganar la carrera). |
| `lib/locations.ts` | **P1 (iteración 3)**. Nuevo `getLocationsByIds(ids)` — lectura en lote (`in` de a 30) con timeout. Mata el N+1 de `/explore`. |
| `lib/hooks/createCachedQueryHook.ts`, `lib/hooks/useUserMatches.ts` | **P1**. Reusan `withTimeout` / `getLocationsByIds` (sin cambio de comportamiento). |
| `lib/wallet.ts`, `lib/bookings.ts`, `lib/venues.ts` | **P1**. `getWalletTransactions` / `getUserBookings` / `getActiveVenues` envuelven su `getDocs` en `withTimeout`. |
| `app/explore/page.tsx` | **P1**. `setLoading(false)` se desacopla del fetch de sedes (se resuelve con el primer snapshot); sedes en lote vía `getLocationsByIds`. |
| `app/worldcup/page.tsx` | **P1**. `getWorldCupConfig()` y el `Promise.all` de matches/predictions/bracket envueltos en `withTimeout` → `WorldCupSkeleton` ya no queda colgado. |

---

## 12. NOTAS DE FOLLOW-UP

### P2 — IMPLEMENTADO (iteración 4, 2026-06-30) — ver sección 14
Acotadas `getAllMatches()` y `getMyMatches()` para no leer colecciones sin techo, sin perder los partidos accionables. Pendiente sólo:
- Paginación real ("ver más") en `/history` para usuarios/admins que superen la ventana acotada.
- Investigar si conviene reemplazar `getDocs` por `onSnapshot` en Home para tener datos siempre frescos. Tiene costo y requiere SDD propio.

---

## 13. ITERACIÓN 3 — P1: blindar páginas con patrón viejo + N+1

**Problema**: tras P0, varias páginas seguían gateando su skeleton en un `getDocs` sin timeout (mismo modo de cuelgue, una por una). Además `/explore` tenía un **N+1** de lecturas de sedes.

**Estrategia** (mismo principio: timeout duro + degradación elegante; sin migrar todo al hook de un disparo, que no encaja con paginación ni con `onSnapshot`):
1. **`withTimeout(promise, ms=10s)`** — primitivo reutilizable. El timeout antes vivía inline en `createCachedQueryHook`; se extrae y se reusa en todos los fetchers. Limpia el timer al resolver.
2. **`getLocationsByIds(ids)`** — lectura de sedes en lote (`where(documentId(), "in", batch)` de a 30) con timeout. Reemplaza tanto el `fetchLocationsMap` privado de `useUserMatches` como el **N+1** de `/explore` (antes: un `getDoc` por sede).
3. **Timeout en los fetchers paginados/directos**: `getWalletTransactions`, `getUserBookings`, `getActiveVenues` envuelven su `getDocs` en `withTimeout` → todos sus callers (incluido "Ver más") quedan protegidos.
4. **`/explore` (onSnapshot)**: se desacopla `setLoading(false)` del fetch de sedes. El skeleton se resuelve con el **primer snapshot** de partidos; las sedes son mejora progresiva y, si su fetch falla/cuelga, no dejan el skeleton colgado. (El stream de `onSnapshot` reconecta solo al volver a `visible` — sigue fuera de alcance forzar su timeout.)
5. **`/worldcup`**: `getWorldCupConfig()` y el `Promise.all` de matches/predictions/bracket se envuelven en `withTimeout`. Su `catch`→`handleError` + `finally`→`setLoading(false)` ya existían, así que un timeout degrada a toast + página vacía en vez de `WorldCupSkeleton` infinito.

**Criterios de aceptación P1**
- [ ] Si `getWalletTransactions`/`getUserBookings`/`getActiveVenues` no resuelven en 10 s, la página sale del skeleton (toast de error, no cuelgue).
- [ ] `/explore` muestra los partidos apenas llega el primer snapshot, aunque el fetch de sedes tarde o falle.
- [ ] `/explore` hace **una** query de sedes por lote (≤30) en vez de un `getDoc` por partido.
- [ ] `/worldcup` nunca queda colgado en `WorldCupSkeleton` si una de sus lecturas se cuelga.
- [ ] `useUserMatches` mantiene el mismo comportamiento (la caché y el timeout del hook siguen iguales).

**Fuera de alcance de P1**: P2 (limit/paginación en `getAllMatches`/`getMyMatches`); forzar timeout sobre streams `onSnapshot` (reconectan solos).

---

## 14. ITERACIÓN 4 — Velocidad: paralelizar `/worldcup` + acotar queries de partidos (P2)

### 14.1 `/worldcup` — un round-trip en vez de dos
**Antes**: `await getWorldCupConfig()` y, recién al volver, `Promise.all([matches, predictions, bracket])` → dos viajes a la red en serie antes de pintar.
**Después**: las 4 lecturas en un solo `Promise.all` (envuelto en `withTimeout`); el gate de acceso (`hasWorldCupAccess`) se evalúa con `cfg` ya disponible. Corta ~a la mitad la latencia de datos en la primera carga.
**Por qué es rules-safe** (`firestore.rules`): `config/worldcup` y `worldcupMatches` son legibles por cualquier autenticado; `worldcupPredictions`/`worldcupBracketPredictions` consultados son los del **propio** user (siempre legibles). Un usuario sin acceso lee unos ~64 docs de más antes de ser redirigido (caso de borde raro, sin fuga de datos).

### 14.2 P2 — `getAllMatches` / `getMyMatches` acotadas (escala/costo)
**Problema**: ambas leían colecciones sin `limit`. `getAllMatches` (Home del super admin) leía **toda** la colección `matches` → crece sin techo a nivel plataforma.

**`getAllMatches()`** → dos queries en paralelo + merge/dedupe:
- `where status == open` → **todos** los abiertos (accionables, acotados por naturaleza: se cierran). Garantiza que el "próximo partido" del admin nunca caiga fuera del límite.
- `orderBy createdAt desc, limit(150)` → historial reciente.

**`getMyMatches()`** → `limit(100)` en cada una de sus dos subqueries (`playerUids array-contains` y `createdBy ==`). Los abiertos son recientes por naturaleza, así que siempre entran; el corte solo afecta historial viejo.

**Sin índices nuevos**: `where status==open` y `orderBy createdAt + limit` usan índices de campo único (automáticos); los compuestos existentes (`playerUids+createdAt`, `createdBy+createdAt`) siguen sirviendo con `limit`.

**Trade-off documentado**: usuarios/admins con más partidos que la ventana no ven el historial más viejo en `/history` (pendiente: paginación "ver más"). Riesgo de perder un abierto: nulo en `getAllMatches` (query dedicada de abiertos); despreciable en `getMyMatches` (un abierto tan viejo que queden 100 partidos más nuevos del mismo user es patológico).

**Criterios de aceptación iteración 4**
- [ ] `/worldcup` dispara las 4 lecturas en paralelo (un round-trip).
- [ ] Super admin: Home muestra todos los partidos abiertos + los 150 más recientes; no lee la colección entera.
- [ ] Jugador: Home/History acotan a ~100 por subquery sin perder el próximo partido abierto.
- [ ] No se requieren índices Firestore nuevos.

---

## 15. ITERACIÓN 5 — Paginación de `/history` + caché de `/worldcup`

### 15.1 `/history` — paginación por cursor ("ver más antiguos")
La iteración 4 acotó el historial a ~100/150; faltaba dejar ver el resto. `/history` deja de usar `useUserMatches` (que es de un solo disparo, compartido con Home) y pasa a **paginación por cursor propia** (mismo patrón que `/wallet` y `/bookings`: estado inline, `startAfter(lastDoc)`).

**Fetcher**: `getClosedMatchesPage(uid, isSuperAdmin, pageSize=20, cursor?)` en `lib/matches.ts`:
- **Una sola query** ordenada por `createdAt desc` (índices ya existentes: `playerUids+createdAt` para jugador, single-field para super admin), filtrando `status==closed` en cliente. `reachedEnd` se calcula sobre los docs CRUDOS (< pageSize ⇒ no hay más).
- Jugador → `where playerUids array-contains uid` (= "partidos jugados", coherente con el header). Super admin → sin filtro de usuario (todos los cerrados).
- Sin índices nuevos.

**Página**: estado inline (`matches`, `lastDoc`, `hasMore`, `loadingMore`), botón "Ver más antiguos", sedes por página vía `getLocationsByIds` mergeadas, orden de display por fecha/hora desc.

**Trade-off**: para un location/team admin, los partidos que **creó pero no jugó** ya no aparecen en `/history` (sí en Home y en `/match/[id]`). Es semánticamente correcto ("partidos jugados") y habilita paginación con una sola query. `/history` ya no comparte la caché en memoria de Home (hace su propio fetch de la primera página).

### 15.2 `/worldcup` — caché en memoria con updates optimistas
Reabrir/volver a `/worldcup` refetcheaba las 4 queries (~64 docs de partidos + predicciones + bracket) cada vez. Nuevo hook `lib/hooks/useWorldCupData.ts`:
- **Caché de módulo** por `uid` (`{config, matches, predictions, bracket, fetchedAt}`); revisitas dentro de la ventana **no** refetchean (sin skeleton, instantáneo).
- **Refresh en background** si stale (>60 s) al montar y por `visibilitychange`/`pageshow` — mantiene resultados/marcadores razonablemente frescos durante el torneo sin bloquear la UI.
- **Updates optimistas a la caché**: `setPrediction`/`setBracket` escriben en estado local **y** en la caché de módulo. Resuelve el riesgo señalado: sin esto, una predicción recién guardada (que se aplica en estado local) "desaparecería" al revisitar con caché stale.
- Mismo patrón de robustez que `createCachedQueryHook`: reconciliación de estado en render al cambiar `uid` (sin `setState` en effect), token de generación (`reqId`) contra respuestas tardías, `withTimeout` en el fetch.
- La página deriva `config/matches/predictions/bracket` del hook; el gate de acceso (`hasWorldCupAccess`) y `logWorldCupPollOpened` corren en un effect cuando llega la config; estados de error (sin datos) con "Reintentar".

**Criterios de aceptación iteración 5**
- [ ] `/history` carga la primera página y "Ver más antiguos" trae las siguientes hasta agotar.
- [ ] El historial de un jugador muestra los partidos que jugó, ordenados por fecha desc.
- [ ] Revisitar `/worldcup` dentro de 60 s no muestra skeleton ni refetchea.
- [ ] Una predicción/bracket recién guardada sigue visible al volver a `/worldcup` (caché actualizada).
- [ ] Sin índices Firestore nuevos.

**Pendiente (no en alcance)**: P2 sigue cerrado; queda solo la idea de mover Home a `onSnapshot` (SDD propio).

---

## 16. ITERACIÓN 6 — `/venues/admin/[id]`: skeleton colgado + calendario lento

Misma familia de problemas en la vista de admin de sede. Ref. funcional: `docs/BOOKING_SYSTEM_SDD.md`.

### 16.1 "No carga la información" — skeleton infinito
`loadData` hacía `Promise.all([getVenue, getVenueCourts, getVenueCombos, getVenueFullSchedule])` (todos `getDocs` sin timeout) y el skeleton se mostraba mientras `loading || !venue`. Dos cuelgues:
1. Si un `getDocs` se colgaba (iOS) → skeleton infinito.
2. **Bug**: ante un error atrapado, `finally` ponía `loading=false` pero `venue` quedaba `null` → `loading || !venue` → el skeleton **seguía igual** para siempre, solo con un toast.

**Fix** (`app/venues/admin/[id]/page.tsx`): `withTimeout` sobre el `Promise.all` + nuevo estado `loadError`; si `loadError && !venue` se muestra pantalla de error con "Reintentar" (`loadData`) en vez del skeleton.

### 16.2 "Lentitud" — calendario mensual con ~30 queries
`AdminBookingCalendar` disparaba **una query `getBookingsForDate` por cada día del mes** (~28-31 round-trips en paralelo) solo para marcar los días con reservas.

**Fix**: nuevo `getBookingsInDateRange(venueId, startDate, endDate)` en `lib/bookings.ts` — **una sola** query de rango (`where venueId== + date>=first + date<=last`, sin filtro de status para usar el prefijo `(venueId, date)` del índice existente). El componente agrupa por día en cliente filtrando `SLOT_BLOCKING_BOOKING_STATUSES` (mismo criterio de dots que antes). Pasa de ~30 round-trips a **1**. Sin índices nuevos.

**Criterios de aceptación iteración 6**
- [ ] Si los fetchers de la sede no resuelven en 10 s, la página sale del skeleton (estado de error con Reintentar, no cuelgue).
- [ ] Un error de carga (permiso/red) ya no deja el skeleton colgado para siempre.
- [ ] El calendario mensual hace una sola query de rango para marcar los días con reservas.
- [ ] Los dots del calendario marcan los mismos días que antes (criterio de status idéntico).
- [ ] Sin índices Firestore nuevos.
