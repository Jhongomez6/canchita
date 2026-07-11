# Feature: Estadísticas de Jugadores

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "Estadísticas de Jugadores".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Registrar y mantener estadísticas individuales de jugadores (victorias, derrotas, empates) basándose en los resultados de los partidos.

### Datos de Stats (dentro de `users/{uid}`)

```typescript
// Campos en el documento de usuario
{
  stats: {
    played: number;       // Total de partidos jugados
    won: number;          // Partidos ganados
    lost: number;         // Partidos perdidos
    draw: number;         // Empates
    noShows: number;      // No-shows registrados
    lateArrivals: number; // Llegadas tarde registradas
  };
  commitmentStreak: number; // Partidos consecutivos puntual — se gestiona junto a stats
                             // Ver PLAYER_STREAKS_SDD.md para el resto de rachas
}
```

### Tipos de Resultado

```typescript
type MatchResult = "win" | "loss" | "draw";
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo jugadores con `uid` reciben stats | Filtro en `updatePlayerStats()` |
| 2 | Stats se actualizan al cerrar partido | Llamada desde match detail page |
| 3 | Si partido se reabre y re-cierra, stats previos se revierten | `previousResultByUid` map (por jugador) |
| 3b | La reversión usa el equipo REAL donde estaba el jugador en el cierre anterior, aunque cambie de equipo | `previousTeams` snapshot + `previousResultByUid` |
| 4 | Stats son atómicas — se usa `writeBatch` para all-or-nothing | `writeBatch` agrupa todos los `increment()` + flag `statsProcessed` en un solo commit atómico |
| 5 | Resultado depende del score: A > B = win para A | Lógica en UI (match detail) |
| 6 | `commitmentStreak` se actualiza junto a stats en el mismo batch | Increment si `attendance === "present"`, reset a 0 si `late` o `no_show` |
| 7 | Re-cierre de partido no modifica `commitmentStreak` | `previousResult` presente = skip |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │ DOMINIO│     │   API   │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
    MatchResult    updatePlayer   Cerrar partido
    Player type    Stats()        Score inputs
```

### Capas

#### **Capa 1: Dominio** (`lib/domain/player.ts`)

Define los tipos base:

```typescript
export type MatchResult = "win" | "loss" | "draw";

export interface Player {
  id?: string;        // Unique identifier for tracking/DnD
  uid?: string;
  name: string;
  level: PlayerLevel;
  positions: Position[];
  confirmed: boolean;
}
```

**✅ Cumple especificación**: Regla #1 (uid optional = distingue registrados de manuales, id = tracking único)

#### **Capa 2: API** (`lib/playerStats.ts`)

```typescript
export async function updatePlayerStats(
  players: Player[],
  result: MatchResult,
  matchId: string,
  previousResult?: MatchResult
): Promise<void> {
  for (const player of players) {
    if (!player.uid) continue; // Regla #1: solo con uid

    const ref = doc(db, "users", player.uid);

    // Regla #3: Revertir stats previos si partido reabierto
    if (previousResult) {
      const decrement = { [getStatField(previousResult)]: increment(-1) };
      await updateDoc(ref, decrement);
    }

    // Regla #4: Incremento atómico
    await updateDoc(ref, {
      [getStatField(result)]: increment(1),
    });
  }
}
```

**✅ Cumple especificación**: Reglas #1, #3, #4

#### **Capa 3: UI** (`app/match/[id]/page.tsx`)

La lógica de determinar el resultado se ejecuta en la UI al cerrar:

```typescript
// Re-cierre: mapa uid → resultado previo, derivado del equipo REAL donde estaba
// cada jugador en el cierre anterior (previousTeams). Se pasa el MISMO mapa a ambas
// llamadas; cada una hace lookup por uid del jugador que procesa.
// Regla #5: Determinar resultado por score
if (scoreA > scoreB) {
  await updatePlayerStats(teamA, "win", id, matchDate, previousResultByUid, matchData);
  await updatePlayerStats(teamB, "loss", id, matchDate, previousResultByUid);
} else if (scoreB > scoreA) {
  await updatePlayerStats(teamA, "loss", id, matchDate, previousResultByUid, matchData);
  await updatePlayerStats(teamB, "win", id, matchDate, previousResultByUid);
} else {
  await updatePlayerStats(teamA, "draw", id, matchDate, previousResultByUid, matchData);
  await updatePlayerStats(teamB, "draw", id, matchDate, previousResultByUid);
}
```

**✅ Cumple especificación**: Reglas #2, #5

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #3: Reversión de stats al reabrir

**Especificación**:
> Si un partido se reabre y se cierra con nuevo resultado, las estadísticas previas se revierten

**Implementación**:

1. **UI**: Al cerrar guarda en Firestore `previousScore` (score aplicado) **y** `previousTeams` (composición A/B aplicada).
2. **UI**: En un re-cierre construye `previousResultByUid` — un `Map<uid, MatchResult>` derivado de `previousTeams` + `previousScore`, es decir el resultado previo de cada jugador según el equipo **real** donde estaba, no según su equipo actual.
3. **API**: `updatePlayerStats(team, result, matchId, matchDate, previousResultByUid, …)` revierte el resultado previo por jugador (lookup por `uid`) e incrementa el nuevo, en el mismo `writeBatch`.

> **Bug corregido**: antes se calculaba un único `previousResult` por equipo (A/B) y se aplicaba a los jugadores que estaban en ese equipo *en el momento del re-cierre*. Si un jugador cambiaba de equipo entre cierres, la reversión se hacía contra el equipo equivocado → su victoria/derrota previa nunca se revertía y no se le sumaba la nueva. Ahora la reversión es por jugador vía `previousTeams`.
>
> _Fallback_: partidos cerrados antes de que existiera `previousTeams` usan los equipos actuales como composición previa (comportamiento anterior) — el fix aplica a partir del próximo cierre que guarde `previousTeams`.

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un partido cerrado donde Equipo A ganó 3-1
**When** se procesan stats
**Then** jugadores de A reciben +1 win, jugadores de B reciben +1 loss

### ✅ Criterio 2
**Given** un partido reabierto con score previo 3-1
**When** se cierra con nuevo score 2-2
**Then** se revierte win/loss anterior y se registra draw

### ✅ Criterio 3
**Given** un jugador manual (sin uid)
**When** se procesan stats
**Then** es ignorado silenciosamente

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/player.ts` | Player, MatchResult |
| Dominio | `lib/domain/user.ts` | UserProfile con campos de stats y streaks |
| API | `lib/playerStats.ts` | updatePlayerStats() — stats + commitmentStreak en mismo batch |
| UI | `app/match/[id]/page.tsx` | Determina resultado, invoca stats |

> Para `weeklyStreak`, `winStreak`, `unbeatenStreak` y `mvpStreak` ver [PLAYER_STREAKS_SDD.md](./PLAYER_STREAKS_SDD.md).

---

## 6. CONCLUSIÓN

✅ **Tipos de resultado (`MatchResult`)** definidos en dominio
✅ **Batch atómico** con `writeBatch` + `increment()` de Firestore (all-or-nothing)
✅ **Reversión segura** de stats al reabrir partidos
✅ **Jugadores manuales ignorados** correctamente
✅ **Trazabilidad completa** de cada regla de negocio
