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
| `weeklyStreak` | Semanas calendario (lun-dom) consecutivas con ≥1 partido jugado | Al no tener partido en la semana actual ni en la anterior |
| `unbeatenStreak` | Partidos consecutivos sin perder (G+E) | Primera derrota |
| `winStreak` | Partidos ganados consecutivos | Cualquier no-victoria (E o P) |
| `mvpStreak` | Partidos consecutivos con premio MVP | Primer partido sin MVP |

> **Semana activa:** La racha semanal cuenta desde la semana actual hacia atrás. Si el usuario no jugó esta semana pero jugó la anterior, la racha es 0 (ya se cortó).

### 1.2 Reglas de Negocio

| # | Regla | Detalle |
|---|-------|---------|
| 1 | `commitmentStreak` se actualiza al cerrar partido | `lib/playerStats.ts → updatePlayerStats()` |
| 2 | Re-cierre no modifica streak | `previousResult` presente = skip (intención ambigua) |
| 3 | No-shows pendientes también resetean | Jugadores sin equipo marcados manualmente como `no_show` |
| 4 | `weeklyStreak` usa semana calendario lunes-domingo | Funciones `getMonday()` con hora local (no UTC midnight) |
| 5 | Los scripts de backfill calculan desde el historial completo | Útil para poblaciones iniciales o correcciones |
| 6 | Solo jugadores con `uid` reciben racha | Invitados (`guestToPlayer`) ignorados |

### 1.3 Campos del Modelo de Usuario

```typescript
// lib/domain/user.ts → UserProfile
interface UserProfile {
  commitmentStreak?: number;   // Partidos consecutivos puntual (no late, no no_show)
  weeklyStreak?: number;       // Semanas consecutivas con ≥1 partido
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
| `calcWeeklyStreak(matches)` | `Array<{ date: string }>` | `number` |
| `calcUnbeatableStreak(matches)` | `Array<{ won?, draw?, lost? }>` | `number` |
| `calcWinStreak(matches)` | `Array<{ won? }>` | `number` |
| `calcMvpStreak(matches)` | `Array<{ mvp? }>` | `number` |

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
**Then** los 50 usuarios tienen su `weeklyStreak` actualizado

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | Tipos de streak en UserProfile + funciones de cálculo puras |
| API | `lib/playerStats.ts` | Actualización de commitmentStreak en tiempo real al cerrar partido |
| UI | `components/home/QuickStats.tsx` | Visualización de weeklyStreak + commitmentStreak en Home |
| UI | `components/home/IdentityHeader.tsx` | Muestra COM score con heart icon en header |
| UI | `components/StatsCard.tsx` | Heart icon con color dinámico en perfil |
| Scripts | `scripts/calculateStreak.js` | Backfill de commitmentStreak (usuario o --all) |
| Scripts | `scripts/calculateWeeklyStreak.js` | Backfill de weeklyStreak (usuario o --all) |
