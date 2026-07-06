# Feature: Bloquear creación de partido con partido abierto vencido

## 📋 Specification-Driven Development (SDD)

Impedir que un usuario cree un partido nuevo si ya tiene otro partido con status `open` cuya fecha de juego pasó hace más de 7 días (partido olvidado sin cerrar), forzándolo a cerrar el pendiente primero.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Los admins a veces crean un partido, lo juegan y nunca lo cierran. Ese partido queda `open` para siempre: ensucia el historial, mantiene reservas/depósitos sin liquidar, no procesa stats/XP y confunde a los jugadores que lo ven "abierto". Esta feature crea un incentivo de flujo: **no puedes crear tu próximo partido hasta cerrar el que quedó colgado**. Es una barrera de higiene de datos, no un límite de cantidad.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Un partido es **"vencido sin cerrar"** (stale) si `status === "open"` **y** su fecha/hora de juego (`startsAt`) es anterior a `ahora − 7 días`. | Banner rojo bloqueante en `/new-match`. |
| 2 | El bloqueo aplica **por creador** (`createdBy === uid`). Solo cuentan los partidos que el propio usuario creó, no en los que solo participa. | El banner enlaza al partido pendiente propio. |
| 3 | El bloqueo aplica a **todos los roles** que pueden crear partidos (super_admin, location_admin, etc.). Sin excepciones. | Igual para todos los admins. |
| 4 | Si el usuario tiene **varios** partidos stale, basta uno para bloquear; la UI muestra el más antiguo primero. | Se enlaza el más antiguo (peor caso). |
| 5 | Un partido `open` cuya fecha **aún no pasa** o pasó hace **≤ 7 días** **no** bloquea. La ventana de 7 días da margen para cerrar con calma. | Sin banner; creación normal. |
| 6 | Cerrar el partido pendiente (llevarlo a `status === "closed"`) **levanta el bloqueo inmediatamente**. | Banner desaparece al recargar / al volver a `/new-match`. |

### Constante de dominio
```typescript
export const STALE_OPEN_MATCH_DAYS = 7; // días tras la fecha de juego para considerar un open como "vencido"
```

---

## 2. ESCALABILIDAD

### Volumen esperado
- App de fútbol amateur, crecimiento gradual. Un admin activo crea del orden de **1–10 partidos/semana**.
- Partidos `open` simultáneos por creador: casi siempre **0–3**. La query de verificación devuelve un set diminuto.
- La verificación corre **una vez al abrir `/new-match`** y **una vez por submit** (guard servidor). No es un hot path.

### Índices Firestore requeridos
Query de verificación: partidos abiertos creados por el usuario.

```
Colección: matches
Filtros: createdBy == uid  AND  status == "open"   (sin orderBy)
```

- **No requiere índice compuesto.** Son dos filtros de **igualdad** sin `orderBy`; Firestore los sirve *index-free* mediante zig-zag merge de los índices de campo único (`createdBy`, `status`) que crea automáticamente. Definir un índice compuesto aquí es redundante y `firebase deploy --only firestore:indexes` lo rechaza con "this index is not necessary".
- El filtro de antigüedad (`startsAt < cutoff`) se hace **en memoria** sobre el set (0–3 docs).

### Paginación
No aplica. El set de partidos abiertos por creador es intrínsecamente pequeño; no hay lista larga que paginar.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Ninguna nueva.** La verificación es una **lectura de query** (no un `get` de doc conocido) seguida de una escritura (`addDoc`). Firestore **no permite queries dentro de `runTransaction()`**, por lo que este guard no puede ser transaccional. `createMatch()` hoy tampoco es transaccional (usa `addDoc`), así que es consistente.

### Race conditions identificadas
- **Escenario:** el usuario abre dos pestañas y hace submit casi simultáneo cuando aún no tiene partido stale → ambos pasan el guard y se crean dos partidos.
  - **Mitigación:** aceptable. El objetivo de la feature es forzar el cierre de partidos **viejos**, no limitar la cantidad de partidos recientes. Crear dos partidos frescos a la vez no viola ninguna regla de negocio.
- **Escenario:** el usuario cierra el partido stale en otra pestaña justo mientras `/new-match` calcula el bloqueo → el banner podría quedar mostrándose desactualizado.
  - **Mitigación:** el guard de servidor en `createMatch()` re-verifica con datos frescos al submit; si ya no hay stale, la creación procede. La UI se corrige al recargar.

---

## 4. SEGURIDAD

### Autenticación y autorización
- La verificación lee solo partidos **del propio usuario** (`where("createdBy", "==", uid)`). No expone datos de terceros.
- El bloqueo es una regla de **flujo/higiene**, no de seguridad: no protege un recurso sensible.

### Firestore Rules requeridas
**No se requieren reglas nuevas.** Firestore Security Rules **no pueden ejecutar queries** (solo `get` de documentos conocidos por ID), por lo que la restricción "no tienes partidos open vencidos" **no es expresable en rules** — se valida en la capa de aplicación (`createMatch()`).

Las reglas actuales de creación de `matches` se mantienen sin cambios:
```
// firestore.rules (sin cambios) — línea ~128
allow create: if isSignedIn()
  && request.resource.data.createdBy == request.auth.uid;
```

> Limitación documentada: un cliente malicioso que llame a Firestore directamente (saltándose `createMatch()`) podría evadir el guard. El riesgo es nulo en la práctica: crear tus propios partidos de más no daña a nadie ni a otros usuarios. No se justifica una Cloud Function de validación para esto.

### Validaciones de input
- No hay input nuevo del usuario. El guard deriva su decisión de datos ya persistidos (`status`, `startsAt`, `createdBy`).
- El cutoff se calcula server-side con `Date.now()` en `createMatch()`, no se confía en una fecha enviada por el cliente.

### Datos sensibles
- Ninguno nuevo expuesto. La query es sobre partidos propios del usuario autenticado.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Query de verificación falla (offline/timeout) al **cargar** `/new-match` | Sin conexión, Firestore caído | **Fail-open**: no se muestra banner y se permite crear. Mejor molestar menos que bloquear por un fallo de red. El guard de submit hará el último intento. |
| Query de verificación falla al **hacer submit** (`createMatch`) | Igual que arriba | **Fail-open**: si la verificación lanza, se registra en consola y se procede con la creación (no bloquear al usuario por un fallo de infraestructura). |
| Existe partido stale y el usuario intenta submit igual (banner ignorado / race) | Guard de servidor detecta el stale | `throw new StaleOpenMatchError()` → `handleError()` muestra toast en español con detalle copiable. |
| El partido stale enlazado ya no existe (borrado) | Doc eliminado entre carga y click | El link lleva a la página del partido, que muestra su propio empty/not-found state. |

### Retry strategy
- La verificación usa `withTimeout` (patrón existente del proyecto). Sin retry automático: es una lectura barata; si falla, fail-open.

### Degradación elegante
- Si la verificación no puede completarse, la feature se **desactiva silenciosamente** (no bloquea). El peor caso es que un partido colgado no se detecte esa vez — se detectará en el siguiente intento con conexión.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path — sin partido stale)
1. Usuario admin toca "Nuevo Partido" → navega a `/new-match`.
2. Al montar, el hook `useStaleOpenMatch(uid)` corre la verificación en background.
3. No hay partido stale → el formulario se muestra normal y habilitado.
4. Usuario llena y crea → `createMatch()` re-verifica (pasa) → partido creado → toast éxito → redirect a `/`.

### Flujo bloqueado (con partido stale)
1. Usuario navega a `/new-match`.
2. La verificación encuentra un partido `open` con fecha > 7 días.
3. Se muestra un **banner rojo bloqueante** arriba del formulario:
   > **Tienes un partido sin cerrar**
   > "[Cancha] · [fecha del partido]" terminó hace N días y sigue abierto. Ciérralo antes de crear uno nuevo.
   > **[Ir a cerrar el partido →]**
4. El formulario queda **deshabilitado** (opacado, botón "Crear Partido" inactivo) o se oculta bajo el banner.
5. Usuario toca el CTA → navega a la página del partido pendiente → lo cierra.
6. Vuelve a `/new-match` → verificación pasa → formulario habilitado.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando verificación | Formulario visible pero botón "Crear Partido" deshabilitado con spinner corto (evita crear antes de saber si está bloqueado). |
| Sin stale (OK) | Formulario normal habilitado. |
| Con stale (bloqueado) | Banner rojo + CTA al partido + formulario deshabilitado. |
| Error de verificación | Fail-open: formulario normal (sin banner). |
| Submit bloqueado por guard servidor | Toast de error (`StaleOpenMatchError`). |

### Consideraciones mobile-first
- Banner full-width con `pb`/`mb` adecuados; el contenido de página mantiene `pb-24 md:pb-0`.
- CTA con touch target ≥ 44px.
- El banner va **arriba del fold**, antes de la primera card del formulario, para que sea lo primero que se ve.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- `StaleMatchBanner` → banner de aviso bloqueante.
  - Props: `{ match: Match; daysStale: number }`.
  - Muestra nombre de cancha (`match.locationSnapshot.name`), fecha del partido, días vencidos y CTA a la página del partido.
  - Icono `AlertTriangle` (lucide-react) en contenedor rojo redondeado, consistente con el patrón de "Acceso Denegado" ya existente en la página.

### Hook nuevo
- `useStaleOpenMatch(uid: string | undefined)` → `{ staleMatch: Match | null; loading: boolean }`.
  - Corre la verificación una vez al montar. Fail-open ante error.

### Animaciones (Framer Motion)
- `AnimatePresence` para la entrada del `StaleMatchBanner`: `initial={{ opacity: 0, y: -8 }}`, `animate={{ opacity: 1, y: 0 }}`, duración ~0.25s, ease estándar.
- El formulario deshabilitado usa transición de `opacity` (Tailwind `transition-opacity`) al pasar de habilitado → bloqueado.

### Responsive
- Mobile: banner apilado (texto arriba, CTA botón full-width abajo).
- Desktop (md+): banner con texto a la izquierda y CTA a la derecha (`md:flex-row md:items-center md:justify-between`).

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `match_create_blocked` | Se muestra el banner bloqueante en `/new-match` (una vez por carga con bloqueo) | `match_id` (el partido stale), `days_stale` |

- Prioridad **P4 (Platform)** — señal de higiene/fricción del flujo de admin.
- Se dispara desde el hook al detectar el stale, no en cada render.
- Sigue la convención `snake_case` y usa `logEvent` lazy vía `initAnalytics()` (patrón existente en `lib/analytics.ts`).

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
Sin cambios de esquema. Usa campos existentes de `Match`: `status`, `startsAt`, `createdBy`, `locationSnapshot`.

### Capa de dominio (`lib/domain/match.ts`)
Funciones puras nuevas (sin Firebase, sin React):
```typescript
export const STALE_OPEN_MATCH_DAYS = 7;

/** Epoch ms de la fecha/hora de juego del partido (usa startsAt; fallback a date+time). */
export function getMatchStartMs(match: Pick<Match, "startsAt" | "date" | "time">): number;

/** true si el partido está open y su juego pasó hace más de STALE_OPEN_MATCH_DAYS. */
export function isStaleOpenMatch(
  match: Pick<Match, "status" | "startsAt" | "date" | "time">,
  now: Date
): boolean;

/** Devuelve el partido stale MÁS ANTIGUO de la lista, o null. Pura, testeable. */
export function findStaleOpenMatch(matches: Match[], now: Date): Match | null;

/** Días completos transcurridos desde la fecha de juego (para el copy del banner). */
export function daysSinceMatch(match: Pick<Match, "startsAt" | "date" | "time">, now: Date): number;
```

### Capa de API (`lib/matches.ts`)
```typescript
/** Query: partidos open del creador → filtra en memoria los stale → devuelve el más antiguo. */
export async function getStaleOpenMatchForCreator(uid: string): Promise<Match | null>;
```
- Query: `where("createdBy", "==", uid)`, `where("status", "==", "open")`. Envuelta en `withTimeout`.
- Filtra con `findStaleOpenMatch(...)` de dominio.
- **Guard en `createMatch()`**: antes del `addDoc`, llamar `getStaleOpenMatchForCreator(match.createdBy)`; si devuelve un partido, `throw new StaleOpenMatchError(...)`. Envuelto en try/catch fail-open ante errores de infraestructura (no ante `StaleOpenMatchError`).

### Capa de errores (`lib/domain/errors.ts`)
```typescript
export class StaleOpenMatchError extends BusinessError {
  constructor() {
    super("Tienes un partido sin cerrar de hace más de una semana. Ciérralo antes de crear uno nuevo.");
    this.name = "StaleOpenMatchError";
  }
}
```

### Componentes UI (`app/`)
- `app/new-match/page.tsx`: consumir `useStaleOpenMatch`, renderizar `StaleMatchBanner`, deshabilitar formulario/botón, y capturar `StaleOpenMatchError` en el catch del submit (ya usa `handleError`).
- `components/StaleMatchBanner.tsx`: nuevo.
- `lib/hooks/useStaleOpenMatch.ts`: nuevo (o colocado junto a otros hooks del proyecto).

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Con un partido `open` cuya fecha pasó hace **8 días**, `/new-match` muestra el banner rojo y deshabilita el formulario.
- [ ] Con un partido `open` cuya fecha pasó hace **3 días**, el formulario funciona normal (sin banner).
- [ ] Con un partido `open` **futuro**, el formulario funciona normal (sin banner).
- [ ] Un partido stale de **otro** usuario (no `createdBy` propio) **no** bloquea.
- [ ] Cerrar el partido stale y volver a `/new-match` habilita la creación.
- [ ] Si el usuario ignora el banner y fuerza el submit, `createMatch()` lanza `StaleOpenMatchError` y se muestra toast en español.
- [ ] Si la verificación falla por red (offline), la creación **no** se bloquea (fail-open).
- [ ] El evento `match_create_blocked` se registra una vez con `match_id` y `days_stale` al mostrarse el banner.
- [ ] La query de verificación corre sin pedir índice (dos igualdades, servida index-free).
- [ ] Funciones de dominio (`isStaleOpenMatch`, `findStaleOpenMatch`, `daysSinceMatch`) con tests unitarios.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/match.ts` | + `STALE_OPEN_MATCH_DAYS`, `getMatchStartMs`, `isStaleOpenMatch`, `findStaleOpenMatch`, `daysSinceMatch` |
| `lib/domain/errors.ts` | + `StaleOpenMatchError` |
| `lib/matches.ts` | + `getStaleOpenMatchForCreator`; guard fail-open en `createMatch()` |
| `lib/hooks/useStaleOpenMatch.ts` | Nuevo hook de verificación (fail-open) |
| `components/StaleMatchBanner.tsx` | Nuevo componente de banner bloqueante |
| `app/new-match/page.tsx` | Consumir hook, render banner, deshabilitar form, capturar error en submit |
| `lib/analytics.ts` | + `logMatchCreateBlocked(matchId, daysStale)` |
| `firestore.indexes.json` | Sin cambios (query de 2 igualdades servida index-free) |
| `firestore.rules` | Sin cambios (restricción no expresable en rules — documentado) |

---

## ⚠️ Decisiones de Diseño Clave

1. **Staleness = fecha de juego vencida > 7 días (no fecha de creación).** Un partido `open` cuyo `startsAt` pasó hace más de 7 días bloquea; un `open` futuro o recién jugado no. Esto ataca el problema real (partidos jugados y olvidados sin cerrar), no partidos programados con anticipación. *(Confirmado por el usuario.)*

2. **Validación solo en capa de aplicación, no en Firestore Rules.** Las rules no pueden hacer queries, así que "no tienes open vencidos" se valida en `createMatch()`. Un cliente que llame a Firestore directo podría evadirlo, pero el riesgo es nulo (solo se crea partidos de más a sí mismo). No se justifica una Cloud Function.

3. **Fail-open ante errores de infraestructura.** Si la verificación falla (offline/timeout), **se permite crear**. Preferimos no bloquear a un admin por un fallo de red; el partido colgado se detectará en el próximo intento con conexión.

4. **No transaccional (por diseño).** El guard es una lectura de query + escritura; Firestore no permite queries en transacciones y crear dos partidos frescos en una race no viola ninguna regla. Aceptamos ese caso límite benigno.

5. **Bloqueo por creador, todos los roles, sin excepción de super_admin.** Cualquiera que haya dejado un partido propio colgado > 7 días queda bloqueado hasta cerrarlo. *(Confirmado por el usuario.)*
