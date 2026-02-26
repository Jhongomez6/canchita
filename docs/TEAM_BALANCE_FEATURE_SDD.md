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
  warnings: string[];
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Mínimo 4 jugadores confirmados para balancear | Validación en UI + `handleBalance()` |
| 2 | Primero se asignan arqueros (GK), máx. 1 por equipo, extras al pool | `balanceTeams()` en `lib/domain/team.ts` |
| 3 | Pool general ordenado por nivel desc → Snake Draft con 3 prioridades | `balanceTeams()` — P1: paridad numérica, P2: posición, P3: nivel |
| 4 | Admin puede rearreglar manualmente con drag-and-drop | `DndContext` en match detail |
| 5 | Equipos se guardan en Firestore | `saveTeams()` en `lib/matches.ts` |
| 6 | `getTeamSummary()` muestra estadísticas por equipo | Función pura en `lib/domain/team.ts` |
| 7 | Invitados se incluyen en el balanceo con nivel configurable | `guestToPlayer()` en `lib/domain/guest.ts` |
| 8 | Cada jugador tiene un `id` único para evitar colisiones por nombre | `Player.id` + `playerKey()` en `lib/domain/team.ts` |
| 9 | Diferencia máxima de jugadores entre equipos: 1 (número impar) | Garantizado por P1 del sistema de 3 prioridades |
| 10 | Warning si la diferencia de nivel entre equipos es > 2 puntos | `scoreDiff > 2` en `balanceTeams()` |
| 11 | Cada click en "Generar equipos" produce una distribución diferente | Fisher-Yates shuffle antes del sort por nivel en `balanceTeams()` |
| 12 | Jugadores en las cards se muestran ordenados: posición (GK→DEF→MID→FWD) y luego nivel desc | `sortTeamForDisplay()` en `lib/domain/team.ts` |

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

Algoritmo 100% puro, sin dependencias de Firebase.

**Sistema de 3 Prioridades** para cada asignación:

```
P1 (siempre gana)  : Paridad numérica → va al equipo con MENOS jugadores
P2 (empate de P1)  : Balance posición → va al equipo con MENOS de esa posición
P3 (empate de P2)  : Balance de nivel → va al equipo con MENOR score
```

```typescript
export function balanceTeams(players: Player[]): BalanceResult {
  // Fase 1: GKs → ordenar por nivel desc → asignar máx. 1 por equipo
  //         GKs extras van al pool general como jugadores de campo
  
  // Fase 2: Pool general (no-GK + GKs extras) → ordenar por nivel desc
  //         → iteración uno a uno con getTargetTeam(pos) → 3 prioridades
  
  // Fase 3: Warnings (GKs faltantes + diferencia de nivel alta)
}
```

> **Nota**: El algoritmo itera todos los jugadores no-GK **juntos** ordenados por nivel (Snake Draft), no en lotes por posición. Esto previene que el criterio de posición desequilibre el tamaño de los equipos.

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
const gks = players.filter(p => p.positions?.includes("GK"))
    .sort((a, b) => b.level - a.level);
const gksToAssign = gks.slice(0, 2); // Máx. 1 por equipo
const gksExtra = gks.slice(2);       // Extras al pool
```

### Regla #3: Snake Draft con 3 Prioridades

1. **Dominio** (`lib/domain/team.ts`):
```typescript
const getTargetTeam = (pos?: Position) => {
    // P1: Paridad numérica — siempre gana
    if (teamA.players.length < teamB.players.length) return teamA;
    if (teamB.players.length < teamA.players.length) return teamB;
    // P2: Balance de posición (solo cuando tamaños iguales)
    if (pos) { /* equipo con menos de esa posición */ }
    // P3: Balance de nivel (Snake Draft)
    return teamA.score <= teamB.score ? teamA : teamB;
};
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

### ✅ Criterio 6 (NUEVO)
**Given** 12 jugadores confirmados
**When** se generan equipos
**Then** cada equipo tiene exactamente 6 jugadores (paridad garantizada)

### ✅ Criterio 7 (NUEVO)
**Given** 11 jugadores confirmados (impar)
**When** se generan equipos
**Then** un equipo tiene 6 y otro 5 (diferencia máxima: 1)

### ✅ Criterio 8 (NUEVO)
**Given** equipos con diferencia de nivel > 2 puntos
**When** se generan equipos
**Then** aparece warning ⚠️ indicando la diferencia

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
✅ **Snake Draft con 3 prioridades** garantiza balanceo de tamaño, posición y nivel
✅ **Paridad numérica garantizada** (diferencia máxima 1, solo en número impar)
✅ **getTeamSummary() extraído** de la UI al dominio
✅ **Drag-and-drop** permite ajustes manuales
✅ **Re-export wrapper** mantiene backward compatibility
✅ **Identificación por `id`** previene colisiones de nombres duplicados
✅ **Warning de nivel** alerta si la diferencia de score es alta
✅ **Distribuciones variadas** cada click genera una distribución diferente igualmente balanceada
✅ **Display ordenado** jugadores se muestran por posición (GK→DEF→MID→FWD) y nivel

