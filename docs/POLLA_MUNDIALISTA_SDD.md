# Feature: Polla Mundialista FIFA 2026

## 📋 Specification-Driven Development (SDD)

Sistema temporal de predicciones del Mundial 2026: cada usuario predice resultados de partidos y acumula puntos según aciertos. Activo únicamente durante el torneo (11 jun – 19 jul 2026).

**Scope v1:** Solo **fase de grupos** (72 partidos). Los playoffs quedan fuera de v1 (ver §13).

**Estrategia de datos (Opción B):** Los partidos se cargan en Firestore una sola vez desde el JSON público de [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) vía script. Los resultados los carga el admin manualmente desde una página protegida dentro de la app. No hay APIs externas en runtime.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Aumentar engagement durante el Mundial 2026 con una polla de predicciones integrada en Canchita. Los usuarios predecen resultados antes de cada partido y compiten en un leaderboard global. Feature temporal con feature flag global para activar/desactivar sin deploy.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | El candado de predicción es **automático por tiempo**: se cierra cuando `now >= kickoff`. El admin NO controla esto | Input se bloquea solo al llegar la hora del partido |
| 2 | Puntaje **exacto** = 3 pts; resultado correcto (G/E/P) = 1 pt; sin acierto = 0 | Badge de puntos por partido |
| 3 | Un usuario puede crear/modificar su predicción libremente hasta `kickoff` | Botón "Editar" activo hasta la hora del partido |
| 4 | Los puntos se calculan automáticamente cuando el **admin carga el resultado** (status → `FINISHED`) | Sin delay — el admin carga cuando quiere |
| 5 | El leaderboard es global para todos los usuarios con al menos 1 predicción | Tabla con posición, nombre, puntos, aciertos |
| 6 | La feature está controlada por un flag **global** en Firestore (`/config/worldcup` → `pollEnabled`) | Menú oculto si flag = false |
| 7 | Los partidos son **datos estáticos** sembrados desde worldcup.json — no hay sync con APIs externas | N/A |
| 8 | **Una vez cerrado el partido** (`now >= kickoff`), las predicciones de todos los usuarios son **públicas** | Lista "qué predijeron los demás" por partido |
| 9 | Antes del cierre, la predicción propia es privada (nadie ve la tuya hasta que arranca el partido) | Solo ves tu predicción hasta `kickoff` |

### Fase cubierta (v1)
- **Grupo (GROUP\_STAGE)** — 72 partidos (48 equipos en 12 grupos de 4). Predecir marcador exacto.
- Playoffs: **fuera de scope v1**, ver §13.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Usuarios estimados: ~200 (base actual de Canchita)
- Predicciones totales: 200 usuarios × 72 partidos = ~14 400 documentos Firestore
- Reads del leaderboard y de "predicciones de otros": picos cuando arranca cada partido y cuando el admin carga resultados

### Colecciones Firestore

| Colección | Tamaño estimado | Estrategia |
|-----------|----------------|------------|
| `/worldcupMatches/{matchId}` | 72 docs | Seed único desde worldcup.json vía script |
| `/worldcupPredictions/{userId}_{matchId}` | ~9 600 docs | ID compuesto para garantía de unicidad |
| `/worldcupLeaderboard/{userId}` | ~200 docs | Recalculado por CF trigger cuando match → FINISHED |
| `/config/worldcup` | 1 doc | Config global (creado por el seed) |

### Índices Firestore requeridos
```
worldcupMatches: status ASC + kickoffMs ASC
worldcupPredictions: userId ASC + matchId ASC
worldcupPredictions: matchId ASC (para batch recálculo + ver predicciones de otros)
worldcupLeaderboard: points DESC + exactHits DESC
```

### Paginación
- Leaderboard: top 200, paginado (limit 50)
- Partidos: ≤ 12 partidos/día en grupos → sin paginación necesaria
- Predicciones de otros: ~200 por partido → limit 100 + "ver más"

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren cuidado
- **Guardar predicción**: No necesita transaction (cada usuario escribe solo su doc). El candado por tiempo se valida en Firestore rules con `request.time`
- **Cargar resultado (admin)**: CF callable lee + escribe el match validando que no esté ya `FINISHED` (idempotencia)
- **Recalcular leaderboard**: CF trigger usa `runTransaction()` por usuario para evitar doble-conteo

### Race conditions identificadas

| Escenario | Mitigación |
|-----------|-----------|
| Usuario intenta predecir justo al llegar `kickoff` | Firestore rule valida `request.time < match.kickoff` — rechazo atómico server-side |
| Admin hace doble clic en "Confirmar resultado" | CF callable idempotente: si el match ya es FINISHED con el mismo marcador, retorna OK sin reescribir |
| Admin corrige un resultado ya cargado | CF permite reescribir si el match es FINISHED; el trigger recalcula puntos de nuevo |
| Dos ejecuciones del trigger sobre el mismo usuario | `runTransaction()` en update de leaderboard por usuario |

---

## 4. SEGURIDAD

### Autenticación y autorización
- Solo usuarios autenticados pueden crear/editar predicciones propias, y solo **antes** de `kickoff`
- Las predicciones ajenas son legibles **solo después** de `kickoff` del partido correspondiente
- Solo `super_admin` puede cargar resultados (vía CF callable que valida el rol)
- El leaderboard es de solo lectura para todos los autenticados
- `/worldcupMatches` es de solo lectura para usuarios (escritura solo vía Admin SDK en CF)
- La página `/worldcup/admin` valida `isSuperAdmin()` en cliente Y en CF callable

### Firestore Rules requeridas
```javascript
// Partidos — solo lectura; escritura solo Admin SDK (CF)
match /worldcupMatches/{matchId} {
  allow read: if request.auth != null;
  allow write: if false;
}

// Predicciones
match /worldcupPredictions/{predId} {
  // Lectura: la propia siempre; las ajenas solo si el partido ya arrancó
  allow read: if request.auth != null && (
    resource.data.userId == request.auth.uid ||
    get(/databases/$(database)/documents/worldcupMatches/$(resource.data.matchId)).data.kickoffMs <= request.time.toMillis()
  );

  // Crear/editar: solo la propia, solo antes del kickoff, con goles válidos
  allow create, update: if request.auth != null &&
    request.resource.data.userId == request.auth.uid &&
    predId == request.auth.uid + "_" + request.resource.data.matchId &&
    request.resource.data.homeGoals is int &&
    request.resource.data.awayGoals is int &&
    request.resource.data.homeGoals >= 0 && request.resource.data.homeGoals <= 20 &&
    request.resource.data.awayGoals >= 0 && request.resource.data.awayGoals <= 20 &&
    get(/databases/$(database)/documents/worldcupMatches/$(request.resource.data.matchId)).data.kickoffMs > request.time.toMillis();

  allow delete: if false;
}

// Leaderboard — solo lectura; escritura solo Admin SDK (CF)
match /worldcupLeaderboard/{userId} {
  allow read: if request.auth != null;
  allow write: if false;
}

// Config global — solo lectura
match /config/worldcup {
  allow read: if request.auth != null;
  allow write: if false;
}
```

> **Nota de costo**: las reglas de lectura/escritura de predicciones hacen un `get()` del match. A escala de Canchita (~200 usuarios) el costo es despreciable. El campo `kickoffMs` se almacena como **número (epoch ms UTC)** para comparar directamente con `request.time.toMillis()` y mantener el dominio puro (sin tipo `Timestamp` de Firebase).

### Validaciones de input
- `homeGoals` y `awayGoals`: enteros ≥ 0 y ≤ 20
- Predicción solo aceptada si `request.time < match.kickoff` (validado en rules)
- Resultado del admin solo aceptado si el caller es super_admin (validado en CF)

### Datos sensibles
- Sin API keys en el cliente — worldcup.json es público
- El leaderboard y la vista de predicciones ajenas exponen solo `displayName` y `photoURLThumb` (no email ni uid crudo en UI)

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Admin olvidó cargar el resultado | Operacional | Badge "Resultado pendiente" en amarillo tras 3h del kickoff |
| CF de recálculo falla | Error inesperado | Leaderboard muestra timestamp "última actualización"; admin puede recargar el resultado para retriggear |
| Seed incompleto | worldcup.json sin todos los fixtures | Empty state "Partidos próximamente" en días sin datos |
| Admin carga resultado incorrecto | Error humano | Admin corrige el resultado → CF recalcula el leaderboard |

### Retry strategy
- CF callable `updateWorldCupMatchResult`: un retry automático; luego error al admin con toast
- Save de predicción desde cliente: un retry automático, luego `toast.error`

### Degradación elegante
- Si `pollEnabled = false`: menú no aparece, rutas redirigen a home
- Si no hay partidos: empty state "Partidos próximamente"
- Si el leaderboard está vacío: empty state "Sé el primero en predecir"
- Resultado pendiente: badge amarillo "Resultado pendiente"

---

## 6. UX — FLUJOS DE USUARIO

### Flujo jugador (happy path)
1. Abre app → ve icono "Mundial" en nav (si `pollEnabled = true`)
2. Ve lista de partidos del día con hora y cuenta regresiva al kickoff
3. Toca un partido `SCHEDULED` → ingresa predicción (ej. 2–1) con botones `+/-`
4. Toca "Guardar" → toast de éxito + card muestra su predicción
5. Al llegar `kickoff` → la predicción se bloquea y se revelan las predicciones de todos
6. Cuando el admin carga el resultado → badge de puntos (0/1/3) en la card
7. Toca "Tabla" → leaderboard con su posición resaltada

### Flujo admin (cargar resultado)
1. Admin entra a `/worldcup/admin` (link visible solo para super_admin)
2. Ve partidos ya jugados sin resultado, ordenados por fecha
3. Toca un partido → ingresa goles local/visitante
4. Toca "Confirmar resultado" → CF callable actualiza el match → trigger recalcula leaderboard
5. Toast de éxito + el partido pasa a FINISHED

> El admin **no** marca "en juego": el cierre de predicciones es automático por hora.

### Estados de UI por partido (vista jugador)

| Estado | Condición | Qué muestra |
|--------|-----------|-------------|
| Abierto, sin predicción | `now < kickoff`, sin pred | Input habilitado, CTA "Predecir" |
| Abierto, con predicción | `now < kickoff`, con pred | Predicción guardada, botón "Editar" |
| Cerrado, en juego | `now >= kickoff`, status SCHEDULED | "En juego" 🟢, predicciones de todos visibles, sin resultado |
| Finalizado | status FINISHED | Marcador real + badge de puntos (0/1/3) + predicciones de todos |
| Sin predicción al cerrar | `now >= kickoff`, sin pred | Badge "Sin predicción" en gris |
| Resultado pendiente | `now >= kickoff + 3h`, status SCHEDULED | Badge "Resultado pendiente" en amarillo |

### Consideraciones mobile-first
- Botones `+/-` de goles: mínimo 44×44px touch target
- Font-size en inputs: `text-base` (≥16px) para evitar zoom en iOS
- Bottom nav padding: `pb-24 md:pb-0`
- Hora del partido mostrada en timezone Colombia (consistente con el resto de la app)
- Leaderboard con banner sticky "Tu posición: #N"

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `WorldCupMatchCard` | `components/worldcup/` | Card de partido: equipos, hora, estado, predicción propia |
| `PredictionInput` | `components/worldcup/` | Inputs `+/-` para goles de cada equipo |
| `OthersPredictionsList` | `components/worldcup/` | Lista de predicciones ajenas (visible tras kickoff) |
| `WorldCupLeaderboard` | `components/worldcup/` | Tabla: avatar, nombre, puntos, exactos |
| `MyPositionBanner` | `components/worldcup/` | Banner sticky "Estás en el puesto #N con X pts" |
| `MatchResultBadge` | `components/worldcup/` | Badge de puntos (0/1/3) en verde/amarillo/gris |
| `WorldCupDayFilter` | `components/worldcup/` | Selector de día / "Hoy" |
| `AdminMatchResultForm` | `components/worldcup/` | Form del admin para cargar resultado |

### Páginas

| Página | Ruta | Acceso |
|--------|------|--------|
| Lista de partidos | `/worldcup` | Todos los autenticados |
| Leaderboard | `/worldcup/leaderboard` | Todos los autenticados |
| Admin resultados | `/worldcup/admin` | Solo super_admin |

> La predicción y la vista de predicciones ajenas se hacen desde la card (sheet expandible), sin página de detalle separada.

### Animaciones (Framer Motion)
- `AnimatePresence` en el badge de puntos cuando aparece el resultado
- Spring animation en el número de goles al usar `+/-`
- Slide-up sheet para predecir / ver predicciones de otros
- Reveal animation de las predicciones ajenas al cruzar el kickoff
- Layout animation en el leaderboard cuando cambia el orden

### Responsive
- Mobile: columna única, cards verticales
- Desktop (md+): grid 2 columnas para partidos, leaderboard como panel lateral

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `worldcup_poll_opened` | Usuario entra a /worldcup | — |
| `worldcup_prediction_saved` | Predicción guardada | `match_id`, `home_goals`, `away_goals` |
| `worldcup_prediction_edited` | Predicción modificada | `match_id` |
| `worldcup_others_viewed` | Usuario abre predicciones de otros | `match_id` |
| `worldcup_leaderboard_viewed` | Usuario entra a /worldcup/leaderboard | `user_position` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/worldcup.ts

// v1: sin IN_PLAY (el cierre es por tiempo, no por estado).
export type WCMatchStatus = "SCHEDULED" | "FINISHED" | "POSTPONED";

// v1 solo GROUP_STAGE. El enum queda extensible para playoffs (§13).
export type WCPhase = "GROUP_STAGE";

export interface WCTeam {
  name: string;   // "Argentina"
  code: string;   // "ARG" — para bandera
}

export interface WCMatch {
  id: string;          // match number como string: "1" … "72"
  utcDate: string;     // ISO 8601 para display: "2026-06-11T20:00:00Z"
  kickoffMs: number;   // epoch ms UTC — fuente de verdad del candado (rules + queries)
  status: WCMatchStatus;
  phase: WCPhase;
  group: string;       // "Group A" … "Group L"
  homeTeam: WCTeam;
  awayTeam: WCTeam;
  score: {
    home: number | null;   // null hasta que el admin carga el resultado
    away: number | null;
  };
  adminUpdatedAt?: string; // ISO — cuándo el admin cargó el resultado
}

export interface WCPrediction {
  id: string;          // "{userId}_{matchId}"
  userId: string;
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  points?: number;     // undefined = no calculado aún; 0 | 1 | 3 = calculado
  // snapshot para mostrar predicciones ajenas sin join a /users
  displayName: string;
  photoURLThumb?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WCLeaderboardEntry {
  userId: string;
  displayName: string;
  photoURLThumb?: string;
  points: number;       // total acumulado
  exactHits: number;    // predicciones exactas (3 pts)
  resultHits: number;   // resultado correcto (1 pt)
  predictions: number;  // total de predicciones hechas
  updatedAt: string;
}

export interface WCConfig {
  pollEnabled: boolean;
}

// Candado de predicción — fuente de verdad en el cliente para habilitar/deshabilitar UI.
// El server lo reafirma en Firestore rules con request.time.
export function isPredictionLocked(match: WCMatch, now: number = Date.now()): boolean {
  return now >= match.kickoffMs || match.status === "FINISHED";
}

// Función pura de scoring
export function scoreForPrediction(
  prediction: Pick<WCPrediction, "homeGoals" | "awayGoals">,
  result: { home: number; away: number }
): 0 | 1 | 3 {
  if (prediction.homeGoals === result.home && prediction.awayGoals === result.away) {
    return 3;
  }
  const predWinner =
    prediction.homeGoals > prediction.awayGoals ? "H" :
    prediction.homeGoals < prediction.awayGoals ? "A" : "D";
  const realWinner =
    result.home > result.away ? "H" :
    result.home < result.away ? "A" : "D";
  return predWinner === realWinner ? 1 : 0;
}
```

### Capa de API (`lib/worldcup.ts`)

```typescript
// Partidos
getWorldCupMatches(): Promise<WCMatch[]>
getWorldCupMatchesForDate(dateISO: string): Promise<WCMatch[]>  // día en TZ Colombia
getTodayMatches(): Promise<WCMatch[]>

// Predicciones del usuario
getUserPredictions(userId: string): Promise<WCPrediction[]>
savePrediction(userId: string, matchId: string, home: number, away: number): Promise<void>

// Predicciones ajenas (solo funciona tras kickoff por las rules)
getMatchPredictions(matchId: string): Promise<WCPrediction[]>

// Leaderboard
getLeaderboard(limit?: number): Promise<WCLeaderboardEntry[]>
getUserLeaderboardEntry(userId: string): Promise<WCLeaderboardEntry | null>

// Config
getWorldCupConfig(): Promise<WCConfig>
```

### Cloud Functions (`functions/src/worldcup.ts`)

```typescript
// CF callable — solo super_admin
exports.updateWorldCupMatchResult = onCall(async (req) => {
  // 1. Verificar que el caller es super_admin (leer perfil con Admin SDK)
  // 2. Validar inputs: matchId, home >= 0, away >= 0
  // 3. Verificar que el match existe
  // 4. Idempotencia: si ya es FINISHED con el mismo marcador → return OK
  // 5. Actualizar el doc: score, status = FINISHED, adminUpdatedAt
});

// Trigger — cuando match pasa a FINISHED, recalcula puntos de todas las predicciones
exports.onWorldCupMatchFinished = onDocumentUpdated(
  "worldcupMatches/{matchId}",
  async (event) => {
    const before = event.data.before.data() as WCMatch;
    const after = event.data.after.data() as WCMatch;
    // Recalcular si: pasó a FINISHED, o si ya era FINISHED y cambió el marcador (corrección)
    const becameFinished = before.status !== "FINISHED" && after.status === "FINISHED";
    const scoreChanged = after.status === "FINISHED" &&
      (before.score.home !== after.score.home || before.score.away !== after.score.away);
    if (!becameFinished && !scoreChanged) return;

    // 1. Query predicciones del match (where matchId == X)
    // 2. Para cada una: points = scoreForPrediction(pred, after.score)
    // 3. Batch update de los points
    // 4. runTransaction por usuario para sumar al leaderboard
    //    (recalcular desde cero el agregado del usuario evita drift en correcciones)
  }
);
```

> **Corrección de resultados**: el trigger recalcula el agregado del usuario **desde cero** (suma de points de todas sus predicciones FINISHED), no incrementa. Así una corrección no duplica ni deja puntos viejos.

### Script de seed (`scripts/seedWorldCupMatches.js`)

```typescript
// Uso: node scripts/seedWorldCupMatches.js
// Corre UNA vez (reejecutable: sobreescribe). Hace dos cosas:
//   1. Carga los 72 partidos de grupos en /worldcupMatches/{n}
//   2. Crea /config/worldcup con { pollEnabled: false }  ← apagado por defecto
//
// Fuente: https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
```

El script:
1. Descarga worldcup.json con `fetch`
2. Filtra solo partidos de fase de grupos (los 48)
3. Transforma cada uno a `WCMatch` (status `SCHEDULED`, `kickoffMs` como epoch ms parseado de la fecha+hora del JSON, `score` en null)
4. Batch write en `/worldcupMatches/{matchNum}`
5. Crea `/config/worldcup` con `pollEnabled: false` si no existe (no pisa si ya existe)
6. Loggea cuántos partidos cargó

### Página admin (`app/worldcup/admin/page.tsx`)
- Ruta protegida: redirige a `/` si el usuario no es `super_admin`
- Lista partidos cuyo `kickoff` ya pasó y aún no tienen resultado
- Permite cargar/corregir el marcador
- Llama a la CF callable `updateWorldCupMatchResult`
- Toast de éxito / error por operación

### Feature flag global
```
Firestore: /config/worldcup
{ pollEnabled: true | false }   // super_admin lo cambia desde Firestore Console
```

### Lectura del flag en el cliente
- Hook/función que lee `/config/worldcup`; si `pollEnabled = false`, el item de nav no se renderiza y las rutas `/worldcup*` redirigen a `/`

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] El menú "Mundial" solo aparece cuando `pollEnabled = true`
- [ ] Un usuario puede predecir solo mientras `now < kickoff`; al llegar la hora el input se bloquea solo
- [ ] Firestore rules rechazan crear/editar predicción si `request.time >= match.kickoff`
- [ ] Las predicciones ajenas NO son legibles antes del kickoff y SÍ después
- [ ] Los goles se ingresan con botones `+/-`, mínimo 0, máximo 20
- [ ] Al cargar el admin el resultado, los puntos se calculan automáticamente para todos
- [ ] Una corrección de resultado recalcula el leaderboard sin duplicar puntos
- [ ] El leaderboard refleja los cambios en menos de 60s tras cargar resultado
- [ ] La página `/worldcup/admin` no es accesible para no super_admin (cliente Y CF)
- [ ] El seed carga 72 partidos y crea `/config/worldcup` con `pollEnabled: false`
- [ ] Inputs de predicción tienen font-size `text-base` (≥16px)
- [ ] Todo el texto visible está en español
- [ ] **Sin notificaciones** en v1 (fuera de scope, ver §13)

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/worldcup.ts` | Nuevo — tipos, `isPredictionLocked()`, `scoreForPrediction()` |
| `lib/worldcup.ts` | Nuevo — capa Firestore (matches, predicciones propias/ajenas, leaderboard, config) |
| `functions/src/worldcup.ts` | Nuevo — CF callable `updateWorldCupMatchResult` + trigger `onWorldCupMatchFinished` |
| `scripts/seedWorldCupMatches.js` | Nuevo — seed de 72 partidos + config |
| `app/worldcup/page.tsx` | Nuevo — lista de partidos por día |
| `app/worldcup/leaderboard/page.tsx` | Nuevo — leaderboard global |
| `app/worldcup/admin/page.tsx` | Nuevo — carga de resultados (solo super_admin) |
| `components/worldcup/WorldCupMatchCard.tsx` | Nuevo |
| `components/worldcup/PredictionInput.tsx` | Nuevo |
| `components/worldcup/OthersPredictionsList.tsx` | Nuevo |
| `components/worldcup/WorldCupLeaderboard.tsx` | Nuevo |
| `components/worldcup/MyPositionBanner.tsx` | Nuevo |
| `components/worldcup/MatchResultBadge.tsx` | Nuevo |
| `components/worldcup/WorldCupDayFilter.tsx` | Nuevo |
| `components/worldcup/AdminMatchResultForm.tsx` | Nuevo |
| `components/skeletons/WorldCupSkeleton.tsx` | Nuevo |
| `firestore.rules` | Reglas para `worldcupMatches`, `worldcupPredictions`, `worldcupLeaderboard`, `config/worldcup` |
| Componente de bottom nav | Agregar item "Mundial" condicionado a `pollEnabled` |

---

## 12. PLAN DE IMPLEMENTACIÓN (4 sesiones)

| Sesión | Scope |
|--------|-------|
| 1 — Dominio + seed | `lib/domain/worldcup.ts`, `scripts/seedWorldCupMatches.js`, Firestore rules, seed en Firestore (flag apagado) |
| 2 — Backend CF + admin page | `functions/src/worldcup.ts` (callable + trigger), `app/worldcup/admin/page.tsx`, `AdminMatchResultForm` |
| 3 — UI jugador | `lib/worldcup.ts`, `app/worldcup/page.tsx`, `WorldCupMatchCard`, `PredictionInput`, `OthersPredictionsList`, `MatchResultBadge`, nav item |
| 4 — Leaderboard + pulido | `app/worldcup/leaderboard/page.tsx`, `WorldCupLeaderboard`, `MyPositionBanner`, animaciones, analytics |

---

## 13. EXTENSIÓN: PREDICCIÓN DE CAMPEÓN Y SUBCAMPEÓN (BONUS)

Predicción a largo plazo, independiente de los partidos: el usuario elige **campeón** y **subcampeón** del torneo desde el inicio. Otorga puntos bonus que se suman al leaderboard.

### Reglas
| # | Regla |
|---|-------|
| 1 | Se elige **campeón** y **subcampeón** de la lista de 48 selecciones |
| 2 | Editable libremente hasta el **deadline**: inicio del 2º día del Mundial (`bracketDeadlineMs` = kickoff del primer partido del día 2). Después se bloquea |
| 3 | Bonus por **posición exacta**: campeón correcto = **10 pts**, subcampeón correcto = **5 pts**. Sin parciales |
| 4 | Campeón y subcampeón deben ser equipos **distintos** |
| 5 | Los puntos bonus se suman al total del leaderboard cuando el admin carga el resultado real (campeón/subcampeón) al terminar el torneo |
| 6 | Las elecciones ajenas se revelan tras el deadline (igual que las predicciones de partidos) |

### Modelo de datos
```typescript
// Predicción de bracket del usuario
export interface WCBracketPrediction {
  userId: string;
  champion: string;      // nombre del equipo
  runnerUp: string;      // nombre del equipo
  championPoints?: number;   // 0 | 10 — calculado al resolver
  runnerUpPoints?: number;   // 0 | 5  — calculado al resolver
  displayName: string;
  photoURLThumb?: string;
  createdAt: string;
  updatedAt: string;
}

// Ampliación de WCConfig
export interface WCConfig {
  pollEnabled: boolean;
  bracketDeadlineMs?: number;  // epoch ms — cierre de elección de campeón/subcampeón
  champion?: string;           // resultado real (lo carga el admin)
  runnerUp?: string;
}

// Ampliación de WCLeaderboardEntry
//   bracketPoints, championHit, runnerUpHit (informativos)
//   points = matchPoints + bracketPoints (total, para el orden)
```

### Scoring (puro)
```typescript
scoreBracket(pred, result) => {
  championPoints: pred.champion === result.champion ? 10 : 0,
  runnerUpPoints: pred.runnerUp === result.runnerUp ? 5 : 0,
}
```

### Colección y rules
- `/worldcupBracketPredictions/{userId}` — id = uid.
- Crear/editar: solo el propio, solo si `request.time < config.bracketDeadlineMs`, con champion≠runnerUp, ambos strings no vacíos.
- Leer: el propio siempre; ajenos solo tras el deadline.

### Backend
- `recalcUserLeaderboard()` (functions) ahora suma también el bracket: lee la predicción de bracket del usuario + `champion`/`runnerUp` de `/config/worldcup`, calcula bonus, y `points = matchPoints + bracketPoints`.
- Nueva CF callable `setWorldCupChampions(champion, runnerUp)` — solo super_admin: escribe el resultado en `/config/worldcup` y recalcula el leaderboard de todos los usuarios con predicción de bracket.

### Frontend
- `BracketPredictor` — card destacada en `/worldcup` con dos selectores (campeón/subcampeón) de las 48 selecciones. Estados: sin elegir / elegido (editable) / cerrado / resuelto (con bonus).
- Sección en `/worldcup/admin` para cargar campeón/subcampeón reales al final del torneo.
- El leaderboard muestra el desglose de bonus.

### Seed
- El seed calcula `bracketDeadlineMs` (primer kickoff del día 2 calendario) y lo escribe en `/config/worldcup` con merge (sin pisar `pollEnabled`).

### Premio y reglas visibles
- **Premio**: el 1º del leaderboard al final del Mundial gana `WC_PRIZE_FREE_MATCHES` (= 5) **partidos gratis** (no paga su cuota). Constante en `lib/domain/worldcup.ts`.
- `WorldCupRules` — bottom sheet accesible desde el botón "Reglas" en `/worldcup`: explica el puntaje por partido (3/1/0), el bonus de campeón/subcampeón y el premio. El leaderboard muestra una nota corta del premio.
- El admin puede **borrar** el campeón/subcampeón (botón "Borrar campeón" + CF `clearWorldCupChampions`), por si lo cargó por error.

---

## 14. FUERA DE SCOPE v1 / POR DEFINIR

| Tema | Estado | Nota |
|------|--------|------|
| **Playoffs (octavos → final)** | Por definir | Requiere resolver: scoring de partidos con prórroga/penales, y siembra de bracket con equipos TBD ("1A vs 2B") hasta que terminan los grupos |
| **Notificaciones push** | Descartado v1 | No se envían recordatorios ni avisos de resultados |
| **Teardown post-torneo** | Por definir | Intención: **apagar el flag** (`pollEnabled = false`) el 20 de julio. Pendiente decidir si se conservan las colecciones como "hall of fame" del ganador o se archivan |
