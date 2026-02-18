# Feature: Estadísticas de Jugadores

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "Estadísticas de Jugadores".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Registrar y mantener estadísticas individuales de jugadores (victorias, derrotas, empates) basándose en los resultados de los partidos.

### Datos de Stats (dentro de `users/{uid}`)

```typescript
// Campos adicionales en el documento de usuario
{
  wins: number;     // Partidos ganados
  losses: number;   // Partidos perdidos
  draws: number;    // Empates
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
| 3 | Si partido se reabre y re-cierra, stats previos se revierten | `previousResult` param |
| 4 | Stats son atómicas — se usan `increment()` de Firestore | `import { increment } from "firebase/firestore"` |
| 5 | Resultado depende del score: A > B = win para A | Lógica en UI (match detail) |

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
// Regla #5: Determinar resultado por score
if (scoreA > scoreB) {
  await updatePlayerStats(teamA, "win", id, previousResultA);
  await updatePlayerStats(teamB, "loss", id, previousResultB);
} else if (scoreB > scoreA) {
  await updatePlayerStats(teamA, "loss", id, previousResultA);
  await updatePlayerStats(teamB, "win", id, previousResultB);
} else {
  await updatePlayerStats(teamA, "draw", id, previousResultA);
  await updatePlayerStats(teamB, "draw", id, previousResultB);
}
```

**✅ Cumple especificación**: Reglas #2, #5

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #3: Reversión de stats al reabrir

**Especificación**:
> Si un partido se reabre y se cierra con nuevo resultado, las estadísticas previas se revierten

**Implementación**:

1. **UI**: Guarda `previousScore` en Firestore al cerrar
2. **UI**: Calcula `previousResult` del score anterior
3. **API**: `updatePlayerStats(team, result, matchId, previousResult)` decrementa stats viejos e incrementa nuevos

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
| API | `lib/playerStats.ts` | updatePlayerStats() |
| UI | `app/match/[id]/page.tsx` | Determina resultado, invoca stats |

---

## 6. CONCLUSIÓN

✅ **Tipos de resultado (`MatchResult`)** definidos en dominio
✅ **Incrementos atómicos** con `increment()` de Firestore
✅ **Reversión segura** de stats al reabrir partidos
✅ **Jugadores manuales ignorados** correctamente
✅ **Trazabilidad completa** de cada regla de negocio
