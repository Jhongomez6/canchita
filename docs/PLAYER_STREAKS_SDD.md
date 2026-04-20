# Feature: Rachas de Jugador (Player Streaks)

## 📋 Specification-Driven Development (SDD)

Sistema de rachas que mide constancia y compromiso de los jugadores. Incluye cálculo en tiempo real al cerrar partidos, scripts de backfill para datos históricos, y visualización en la Home y el Perfil.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Motivar a los jugadores a ser constantes y puntuales mediante métricas de racha visibles en su perfil y en la Home.

### 1.1 Tipos de Racha

| Campo en `users/{uid}` | Definición | Se rompe cuando |
|------------------------|-----------|-----------------|
| `commitmentStreak` | Partidos consecutivos con asistencia puntual (`present`) | Cualquier `late` o `no_show` lo resetea a 0 |
| `weeklyStreak` | Semanas calendario (lun-dom) consecutivas con ≥1 partido jugado | Al pasar **dos semanas calendario consecutivas** sin partido jugado |
| `unbeatenStreak` | Partidos consecutivos sin perder (G+E) | Primera derrota |
| `winStreak` | Partidos ganados consecutivos | Cualquier no-victoria (E o P) |
| `mvpStreak` | Partidos consecutivos con premio MVP | Primer partido sin MVP |

> **Ventana de gracia de una semana:** Si el último partido jugado fue en la semana actual o en la semana inmediatamente anterior, la racha sigue vigente. Recién se rompe cuando transcurre una semana completa sin partido después de la última jugada. Esto evita que la racha "parpadee" a 0 cada lunes temprano antes de que el jugador tenga oportunidad de jugar esa semana.
>
> **Ejemplo:** Hoy es martes semana N. Último partido fue domingo semana N-1 (racha = 5). Resultado: `weeklyStreak = 5` (aún vigente). Si llega el lunes de semana N+1 sin jugar en N → la racha se rompe y pasa a 0.

### 1.2 Reglas de Negocio

| # | Regla | Detalle |
|---|-------|---------|
| 1 | `commitmentStreak` se actualiza al cerrar partido | `lib/playerStats.ts → updatePlayerStats()` |
| 2 | Re-cierre no modifica streak | `previousResult` presente = skip (intención ambigua) |
| 3 | No-shows pendientes también resetean | Jugadores sin equipo marcados manualmente como `no_show` |
| 4 | `weeklyStreak` usa semana calendario lunes-domingo | Funciones `getMonday()` con hora local (no UTC midnight) |
| 5 | Los scripts de backfill calculan desde el historial completo | Útil para poblaciones iniciales o correcciones |
| 6 | Solo jugadores con `uid` reciben racha | Invitados (`guestToPlayer`) ignorados |
| 7 | `weeklyStreak` **se auto-actualiza al cerrar partido** | Dentro de `updatePlayerStats()`, en la misma escritura batch — igual que `commitmentStreak` |
| 8 | `no_show` no cuenta como "semana jugada" | La semana solo suma si el jugador tuvo asistencia `present` o `late` |
| 9 | Se persiste `lastPlayedWeek` en el usuario | String `YYYY-MM-DD` del lunes de la última semana con partido jugado — input para actualizar la racha sin re-escanear historial |
| 10 | La lectura del valor mostrado aplica la ventana de gracia | `getDisplayedWeeklyStreak(user, today)`: si `lastPlayedWeek ≥ lunes anterior` → devuelve `weeklyStreak`, si no → 0 |

### 1.3 Campos del Modelo de Usuario

```typescript
// lib/domain/user.ts → UserProfile
interface UserProfile {
  commitmentStreak?: number;   // Partidos consecutivos puntual (no late, no no_show)
  weeklyStreak?: number;       // Semanas consecutivas con ≥1 partido
  lastPlayedWeek?: string;     // Lunes (YYYY-MM-DD) de la última semana con partido jugado
  unbeatenStreak?: number;     // Partidos consecutivos sin perder
  winStreak?: number;          // Partidos ganados consecutivos
  mvpStreak?: number;          // MVPs consecutivos
}
```

---

## 2. ARQUITECTURA

### Capa Dominio (`lib/domain/user.ts`)

Funciones puras, sin Firebase:

| Función | Input | Output |
|---------|-------|--------|
| `getMonday(date)` | `Date` | `string` `YYYY-MM-DD` del lunes (hora local) |
| `calcWeeklyStreak(matches, today?)` | `Array<{ date: string }>`, `Date` opcional | `number` — recorrido desde lunes actual con ventana de gracia |
| `nextWeeklyStreak(prev, matchDate, today)` | `{ weeklyStreak, lastPlayedWeek }`, `string`, `Date` | `{ weeklyStreak, lastPlayedWeek }` — incremental |
| `getDisplayedWeeklyStreak(user, today)` | `UserProfile`, `Date` | `number` — aplica ventana de gracia al leer |
| `calcUnbeatableStreak(matches)` | `Array<{ won?, draw?, lost? }>` | `number` |
| `calcWinStreak(matches)` | `Array<{ won? }>` | `number` |
| `calcMvpStreak(matches)` | `Array<{ mvp? }>` | `number` |

**Bug a corregir en `calcWeeklyStreak`:** la implementación actual ([lib/domain/user.ts:122](../lib/domain/user.ts#L122)) construye `new Date(match.date)` sin el sufijo `T12:00:00` y genera la clave con `toISOString().split('T')[0]`. Esto produce desplazamientos de día en zonas horarias UTC-. Debe migrarse a la misma convención local que ya usan los scripts (`new Date(dateStr + "T12:00:00")` + `getMonday()` por componentes locales).

**Semántica de `nextWeeklyStreak(prev, matchDate, today)`:**
- `monday = getMonday(matchDate)`
- Si `prev.lastPlayedWeek === monday` → no cambia (partido dentro de una semana ya contabilizada).
- Si `prev.lastPlayedWeek === monday - 7d` → `weeklyStreak + 1`, `lastPlayedWeek = monday`.
- Si `prev.lastPlayedWeek < monday - 7d` o está vacío → `weeklyStreak = 1`, `lastPlayedWeek = monday`.
- Notar que el cálculo es independiente de `today`: lo único que importa es la relación entre `matchDate` y `lastPlayedWeek`.

**Semántica de `getDisplayedWeeklyStreak(user, today)`:**
- Si `lastPlayedWeek ≥ getMonday(today) − 7d` → devuelve `user.weeklyStreak`.
- Si no → devuelve 0 (la ventana de gracia expiró).

> `commitmentStreak` no tiene función de dominio separada — se gestiona directamente en `playerStats.ts` con `increment(1)` / reset a 0 al momento del cierre.

**Bug crítico resuelto — timezone UTC:** Las funciones de dominio que parsean `match.date` (formato `"YYYY-MM-DD"`) deben agregar `T12:00:00` antes de construir el `Date`, de lo contrario `new Date("2026-03-31")` se interpreta como medianoche UTC y `getDay()` devuelve el día anterior en zonas UTC-. Los scripts de backfill usan esta convención. La función `getMonday()` genera la clave usando `getFullYear/getMonth/getDate` locales (no `toISOString().split('T')[0]`).

### Capa API (`lib/playerStats.ts`)

Dentro de `updatePlayerStats()`, después de actualizar stats de victorias/derrotas:

```typescript
const topLevelUpdate: Record<string, unknown> = { stats: statsUpdate };
if (!previousResult) {
  if (isNoShow || attendance === "late") {
    topLevelUpdate.commitmentStreak = 0;
  } else {
    topLevelUpdate.commitmentStreak = increment(1);
  }
}
batch.set(userRef, topLevelUpdate, { merge: true });
```

Los no-shows pendientes (jugadores sin equipo) también resetean:
```typescript
batch.set(userRef, { stats: { noShows: increment(1) }, commitmentStreak: 0 }, { merge: true });
```

**Integración de `weeklyStreak` (nueva):**

A diferencia de `commitmentStreak` (que solo necesita `increment(1)` o `reset a 0`), `weeklyStreak` depende del valor previo en combinación con la fecha del partido. Por eso debe leerse el usuario antes del batch.

Flujo dentro de `updatePlayerStats()` para cada jugador `uid` no-guest y que no sea `no_show`:

```typescript
// Pre-lectura por jugador (fuera del batch)
const userSnap = await getDoc(userRef);
const prev = {
  weeklyStreak: userSnap.data()?.weeklyStreak ?? 0,
  lastPlayedWeek: userSnap.data()?.lastPlayedWeek ?? undefined,
};
const next = nextWeeklyStreak(prev, match.date, new Date());

if (!previousResult) {
  topLevelUpdate.weeklyStreak = next.weeklyStreak;
  topLevelUpdate.lastPlayedWeek = next.lastPlayedWeek;
}
batch.set(userRef, topLevelUpdate, { merge: true });
```

Reglas:
- `no_show` **no** dispara la actualización de `weeklyStreak` (la semana no cuenta).
- `present` y `late` sí cuentan como semana jugada (`late` ya penaliza `commitmentStreak`, no es necesario doble castigo).
- Re-cierre (`previousResult` presente) no modifica `weeklyStreak` ni `lastPlayedWeek`, igual que con commitment.
- Las lecturas previas se hacen en paralelo (`Promise.all`) antes del batch, para no serializar.

### Scripts de Backfill (`scripts/`)

| Script | Flag | Descripción |
|--------|------|-------------|
| `calculateStreak.js` | `<userId>` / `--all` | Recalcula `commitmentStreak` desde historial completo |
| `calculateWeeklyStreak.js` | `<userId>` / `--all` | Recalcula `weeklyStreak` desde historial completo |

**Lógica de eficiencia en modo `--all`:**
1. Una sola query de todos los matches cerrados
2. Se construye un mapa `uid → [matches]` iterando `match.players`
3. Se procesa cada usuario en lotes de 10 (Promise.all) para no saturar Firestore
4. Una sola escritura por usuario al final

---

## 3. VISUALIZACIÓN

### En la Home (`components/home/QuickStats.tsx`)

- Solo visible para jugadores **no-admin** con **≥3 partidos jugados** (`stats.played`)
- Muestra `weeklyStreak` y `commitmentStreak` con llama animada (Framer Motion) si valor > 0
- Tooltip en hover explicando qué es cada racha
- Click navega a `/profile#statistics`

### En el Perfil (`components/home/IdentityHeader.tsx`)

- `commitmentStreak` se muestra como campo en el `IdentityHeader` del perfil (visible en el header verde)

### En `StatsCard.tsx` (Perfil)

- COM score visualizado con ícono `Heart` de lucide-react
- Color dinámico: verde (≥80), ámbar (≥50), rojo (<50)

---

## 4. CRITERIOS DE ACEPTACIÓN

### ✅ Criterio 1: commitmentStreak se incrementa al llegar puntual
**Given** un partido cerrado donde el jugador tiene attendance `present`
**When** se procesan stats
**Then** `commitmentStreak` se incrementa en 1

### ✅ Criterio 2: commitmentStreak se resetea con late/no_show
**Given** un jugador con `commitmentStreak: 5`
**When** cierra un partido con `attendance: "late"`
**Then** `commitmentStreak` queda en 0

### ✅ Criterio 3: Re-cierre no altera streak
**Given** un partido que se reabre y se cierra nuevamente
**When** `previousResult` está presente
**Then** `commitmentStreak` no se modifica

### ✅ Criterio 4: weeklyStreak cuenta semanas consecutivas correctas
**Given** un usuario que jugó las últimas 7 semanas sin falta
**When** se calcula `weeklyStreak`
**Then** retorna 7

### ✅ Criterio 5: Script --all procesa todos los usuarios
**Given** la base de datos con 50 usuarios con partidos
**When** se ejecuta `node scripts/calculateWeeklyStreak.js --all`
**Then** los 50 usuarios tienen su `weeklyStreak` y `lastPlayedWeek` actualizados

### ✅ Criterio 6: Auto-actualización al cerrar partido
**Given** un usuario con `weeklyStreak = 5` y `lastPlayedWeek = lunes de la semana anterior`
**When** se cierra un partido en la semana actual con su asistencia `present`
**Then** `weeklyStreak = 6` y `lastPlayedWeek = lunes de esta semana` sin necesidad de ejecutar el script

### ✅ Criterio 7: Ventana de gracia de una semana
**Given** un usuario con `weeklyStreak = 3` y `lastPlayedWeek = lunes semana N-1`
**When** hoy es martes de semana N y aún no jugó
**Then** `getDisplayedWeeklyStreak` devuelve 3 (no 0)

### ✅ Criterio 8: Ruptura por dos semanas sin jugar
**Given** un usuario con `weeklyStreak = 3` y `lastPlayedWeek = semana N-2`
**When** hoy está en la semana N
**Then** `getDisplayedWeeklyStreak` devuelve 0 (la ventana expiró)

### ✅ Criterio 9: No-show no suma semana
**Given** un usuario sin partidos en la semana actual
**When** se cierra un partido donde su asistencia fue `no_show`
**Then** `weeklyStreak` y `lastPlayedWeek` no se modifican

### ✅ Criterio 10: Fix timezone en calcWeeklyStreak (dominio)
**Given** un match con `date = "2026-03-31"` y un usuario en zona UTC-3
**When** se invoca `calcWeeklyStreak([{ date: "2026-03-31" }])`
**Then** la semana se asigna al lunes correcto en hora local (no shift a día anterior)

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | Tipos de streak en UserProfile + funciones de cálculo puras |
| API | `lib/playerStats.ts` | Actualización de commitmentStreak en tiempo real al cerrar partido |
| UI | `components/home/QuickStats.tsx` | Visualización de weeklyStreak + commitmentStreak en Home (usa `getDisplayedWeeklyStreak`) |
| UI | `components/home/IdentityHeader.tsx` | Muestra COM score con heart icon en header |
| UI | `components/StatsCard.tsx` | Heart icon con color dinámico en perfil |
| Scripts | `scripts/calculateStreak.js` | Backfill de commitmentStreak (usuario o --all) |
| Scripts | `scripts/calculateWeeklyStreak.js` | Backfill de weeklyStreak (usuario o --all) |
