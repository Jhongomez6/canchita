# Feature: Balanceo de Equipos

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "Balanceo de Equipos".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Generar dos equipos balanceados automáticamente a partir de los jugadores confirmados, permitiendo ajustes manuales con drag-and-drop.

### Entidad: BalanceResult

```typescript
interface BalanceResult {
  teamA: { players: Player[] };
  teamB: { players: Player[] };
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Mínimo 4 jugadores confirmados para balancear | Validación en UI + `handleBalance()` |
| 2 | Primero se asignan arqueros (GK), uno por equipo | `balanceTeams()` en `lib/domain/team.ts` |
| 3 | Resto se ordena por nivel descendente y se alterna | Snake draft en `balanceTeams()` |
| 4 | Admin puede rearreglar manualmente con drag-and-drop | `DndContext` en match detail |
| 5 | Equipos se guardan en Firestore | `saveTeams()` en `lib/matches.ts` |
| 6 | `getTeamSummary()` muestra estadísticas por equipo | Función pura en `lib/domain/team.ts` |
| 7 | Invitados se incluyen en el balanceo con nivel configurable | `guestToPlayer()` en `lib/domain/guest.ts` |
| 8 | Cada jugador tiene un `id` único para evitar colisiones por nombre | `Player.id` + `playerKey()` en `lib/domain/team.ts` |

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
    balanceTeams   saveTeams()    DndContext
    getTeamSummary Re-export      Drag-and-Drop
    Algoritmo puro                Visual summary
```

### Capas

#### **Capa 1: Dominio** (`lib/domain/team.ts`)

Algoritmo 100% puro, sin dependencias de Firebase:

```typescript
export function balanceTeams(players: BalanceInput[]): BalanceResult {
  // 1. Separar arqueros
  const goalkeepers = players.filter(p => p.positions.includes("GK"));
  const others = players.filter(p => !p.positions.includes("GK"));

  // 2. Asignar 1 GK por equipo
  const teamA: BalanceInput[] = [];
  const teamB: BalanceInput[] = [];

  if (goalkeepers.length >= 2) {
    goalkeepers.sort((a, b) => b.level - a.level);
    teamA.push(goalkeepers[0]);
    teamB.push(goalkeepers[1]);
    others.push(...goalkeepers.slice(2)); // GKs extras van como campo
  }

  // 3. Snake draft por nivel
  const sorted = [...others].sort((a, b) => b.level - a.level);
  sorted.forEach((p, i) => {
    if (i % 2 === 0) teamA.push(p);
    else teamB.push(p);
  });

  return {
    teamA: { players: teamA },
    teamB: { players: teamB },
  };
}

export function getTeamSummary(players: BalanceInput[]) {
  const totalLevel = players.reduce((sum, p) => sum + (p.level ?? 0), 0);
  const positionsCount: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players.forEach(p => {
    p.positions?.forEach(pos => { positionsCount[pos]++; });
  });
  return { count: players.length, totalLevel, positionsCount };
}
```

**✅ Cumple especificación**: Reglas #2, #3, #6

> **Nota**: El algoritmo usa `playerKey(p) = p.id ?? p.name` para rastrear jugadores asignados, evitando colisiones cuando dos jugadores comparten el mismo nombre.

#### **Capa 2: API** (`lib/balanceTeams.ts`)

Wrapper de re-exportación para backward compatibility:

```typescript
export { balanceTeams, getTeamSummary } from "./domain/team";
```

**✅ Cumple especificación**: Regla #5 (via `saveTeams()` en `lib/matches.ts`)

#### **Capa 3: UI** (`app/match/[id]/page.tsx`)

- Botón "Generar equipos" deshabilitado si < 4 confirmados+invitados
- Drag-and-drop con `@dnd-kit` para rearreglo manual
- Resumen visual con `getTeamSummary()` importado del dominio
- Botón "Guardar cambios manuales" llama `saveTeams()`
- Invitados convertidos con `guestToPlayer()` y nivel configurable por admin

```typescript
// Incluir invitados en el balanceo
const guestPlayers = (match.guests ?? []).map(g =>
  guestToPlayer(g, guestLevels[g.name] ?? 2)
);
const result = balanceTeams([...confirmed, ...guestPlayers]);
```

**✅ Cumple especificación**: Reglas #1, #4, #5, #7

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #2: Asignación de arqueros

1. **Dominio** (`lib/domain/team.ts`):
```typescript
const goalkeepers = players.filter(p => p.positions.includes("GK"));
// Ordenar por nivel, asignar 1 a cada equipo
teamA.push(goalkeepers[0]);
teamB.push(goalkeepers[1]);
```

### Regla #6: Resumen de equipo

1. **Dominio** (`lib/domain/team.ts`): `getTeamSummary()` retorna conteo + nivel + posiciones
2. **UI** (`app/match/[id]/page.tsx`):
```typescript
import { getTeamSummary } from "@/lib/domain/team";
const summaryA = getTeamSummary(balanced.teamA.players);
```

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** menos de 4 jugadores confirmados
**When** admin intenta balancear
**Then** el botón está deshabilitado con mensaje

### ✅ Criterio 2
**Given** 2+ arqueros entre los confirmados
**When** se balancean equipos
**Then** cada equipo tiene exactamente 1 arquero

### ✅ Criterio 3
**Given** equipos generados
**When** admin arrastra un jugador al otro equipo
**Then** el cambio se refleja visualmente y puede guardarse

### ✅ Criterio 4
**Given** un partido con invitados agregados por jugadores
**When** admin genera el balanceo
**Then** los invitados aparecen en los equipos con nivel configurable

### ✅ Criterio 5
**Given** dos jugadores con el mismo nombre en el balanceo
**When** se generan equipos y se usa drag-and-drop
**Then** ambos jugadores se manejan independientemente sin colisiones

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/team.ts` | Algoritmo puro, getTeamSummary() |
| Dominio | `lib/domain/player.ts` | Player, Position |
| Dominio | `lib/domain/guest.ts` | Guest, guestToPlayer() |
| API | `lib/balanceTeams.ts` | Re-export wrapper |
| API | `lib/matches.ts` | saveTeams() |
| UI | `app/match/[id]/page.tsx` | DnD + visual + guest integration |

---

## 6. CONCLUSIÓN

✅ **Algoritmo 100% puro** en dominio, testeable sin Firebase
✅ **getTeamSummary() extraído** de la UI al dominio
✅ **Snake draft** garantiza balance por nivel
✅ **Drag-and-drop** permite ajustes manuales
✅ **Re-export wrapper** mantiene backward compatibility
✅ **Identificación por `id`** previene colisiones de nombres duplicados
