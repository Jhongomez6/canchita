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
| 13 | Los objetos de jugador guardados en `match.teams.A/B` deben incluir `photoURL` y `primaryPosition` para que la vista cerrada del join pueda mostrar avatares e iconos de posición correctos | `handleBalance()` en `app/match/[id]/page.tsx` |
| 14 | En la vista cerrada (`/join/[id]`), si un jugador en `match.teams` no tiene `photoURL` o `primaryPosition`, se hace fallback a `match.players` buscando por `uid` | Display lógic en `app/join/[id]/page.tsx` |
| 15 | Al agregar o confirmar un jugador cuando los equipos ya están balanceados, se le asigna automáticamente al equipo con menos jugadores | `assignToSmallestTeam()` en `lib/matches.ts`, invocado desde `joinMatch`, `confirmAttendance`, `addPlayerToMatch`, `approveFromWaitlist` |
| 16 | El drag-and-drop se deshabilita al cerrar el partido (`isClosed`) para prevenir ediciones después de cerrado | `disabled={isClosed}` en `PlayerItem.tsx` y `useSortable` |

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

### ✅ Criterio 9
**Given** equipos ya balanceados y guardados en Firestore
**When** un jugador se une, confirma, es agregado por el admin o aprobado desde lista de espera
**Then** el jugador queda asignado automáticamente al equipo con menos jugadores (sin necesidad de re-balancear)

### ✅ Criterio 10 (NUEVO)
**Given** un partido en estado cerrado (`isClosed = true`)
**When** un administrador visualiza los equipos en la vista de control
**Then** el drag-and-drop se encuentra deshabilitado para las cartas de jugadores y no se muestra el cursor de reordenamiento

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/team.ts` | Algoritmo puro, getTeamSummary() |
| Dominio | `lib/domain/player.ts` | Player, Position |
| Dominio | `lib/domain/guest.ts` | Guest, guestToPlayer() |
| API | `lib/balanceTeams.ts` | Re-export wrapper |
| API | `lib/matches.ts` | saveTeams(), assignToSmallestTeam() |
| UI | `app/match/[id]/page.tsx` | DnD + visual + guest integration + handleBalance() |
| UI | `app/join/[id]/page.tsx` | Vista cerrada con fallback de photoURL / primaryPosition |

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
✅ **`photoURL` y `primaryPosition` preservados** en `match.teams.A/B` desde `handleBalance()`
✅ **Fallback en vista cerrada** — `/join/[id]` busca en `match.players` si el objeto del team no tiene estos campos (compatibilidad con partidos guardados antes del fix)
✅ **Auto-asignación post-balanceo** — nuevos jugadores (join, confirm, addPlayer, approveFromWaitlist) se agregan al equipo más pequeño cuando `match.teams` ya existe
✅ **Drag-and-drop deshabilitado post-cierre** — para prevenir desajustes después de que un partido sea declarado cerrado y estadísticas emitidas

---
---

# 🚀 PROPUESTA v2 — Optimización Multi-objetivo

> Esta sección es la **fuente de verdad de la evolución del algoritmo**. Reemplaza la heurística *greedy* de la v1 por un esquema **multi-start + mejora local (hill climbing)** evaluado contra una **función de costo multi-objetivo**, manteniendo intactas las garantías estructurales (paridad, 1 GK por equipo, pureza del dominio) y la firma pública por backward compatibility.

## v2.0. MOTIVACIÓN — Debilidades de la v1

| # | Debilidad v1 | Evidencia |
|---|--------------|-----------|
| D1 | El *greedy* de **una sola pasada** depende de sus desempates locales: un reparto puede quedar atrapado en un óptimo local del que no puede salir (no hay backtracking ni intercambios). Optimiza **solo el nivel total** | Bajo la restricción de paridad (cardinalidad n/2 por equipo) y niveles 1–4 el greedy suele quedar **cerca** del óptimo de nivel, pero no lo garantiza por candidato y **ignora por completo** los criterios D2–D5 |
| D2 | El `score` total **esconde la concentración de cracks** | `[4,4,2,2]` y `[3,3,3,3]` empatan en 12 pero no están balanceados |
| D3 | El balance de **posición (P2) es débil e inconsistente**: solo actúa con tamaños iguales y `countPos` mide todas las posiciones mientras la asignación usa solo la primaria | `getTargetTeam()` en v1 |
| D4 | **Sesgos deterministas a favor de A**: el GK más fuerte siempre cae en A; los empates de P3 (`<=`) favorecen A | Asignación de GK + `score <= score` |
| D5 | **No se balancea por sexo** aunque `Player.sex` existe | 2 mujeres pueden caer en el mismo equipo |
| D6 | **No se devuelve métrica de calidad** — la UI solo recibe `warnings` de texto | `BalanceResult` v1 |
| D7 | **Sin tests automatizados** del dominio de balanceo | No existe `team.test.ts` |

---

## v2.1. ESPECIFICACIÓN FUNCIONAL — Nuevas Reglas de Negocio

| # | Regla | Resuelve | Impacto UI |
|---|-------|----------|------------|
| R17 | El algoritmo evalúa **N candidatos** (multi-start, default 100) y conserva el de **menor costo** | D1 | Balanceo medible mejor, mismo botón |
| R18 | El candidato se evalúa con una **función de costo multi-objetivo ponderada**: nivel + concentración de cracks + posición + sexo | D1, D2, D3, D5 | — |
| R19 | Cada candidato pasa por una **mejora local por intercambios (hill climbing)** que solo aplica swaps que reducen el costo | D1 | — |
| R20 | Los **swaps preservan** la paridad numérica (diff ≤ 1) y la distribución de arqueros (1 por equipo) | — | Mantiene garantías v1 |
| R21 | **Sin sesgo determinista**: el orden de asignación de GKs y los desempates se resuelven con un `rng` inyectable; el multi-start explora ambas colocaciones de GK | D4 | Equipos justos |
| R22 | La **concentración de cracks** (jugadores nivel 4) se penaliza explícitamente en el costo | D2 | — |
| R23 | El **balance de sexo** (reparto de mujeres) es un término del costo | D5 | — |
| R24 | `BalanceResult.quality` expone **métricas numéricas** (diff de nivel, diff de cracks, desbalance de posición, diff de sexo, costo, candidatos evaluados) | D6 | Chip/resumen de calidad en la card de equipos |
| R25 | El `rng` y los pesos son **inyectables** vía `BalanceOptions` para **tests deterministas** y tuning | D7 | — |
| R26 | Existe `team.test.ts` con **tests de propiedades** que verifican paridad, GK, cota de costo y optimalidad en casos chicos | D7 | — |
| R27 | La firma pública `balanceTeams(players)` se mantiene; `BalanceOptions` es **opcional** y `quality` es **aditivo** (no rompe `handleBalance()`) | — | Backward compatible |

> **Garantías heredadas de la v1 que NO cambian:** mínimo 4 jugadores (validación UI), paridad ≤ 1, 1 GK por equipo con ≥2 GKs, pureza del dominio (sin Firebase/React), identificación por `playerKey()`, `sortTeamForDisplay()` y `getTeamSummary()`.

---

## v2.2. ESCALABILIDAD

### Volumen esperado
- Partido típico: **10–22 jugadores** confirmados + invitados. Cota práctica ≤ 30.
- El balanceo es **100% client-side y puro** (no toca Firestore hasta `saveTeams()`).

### Costo computacional
- **Multi-start**: `N` candidatos (default 100). Cada candidato: greedy `O(n log n)`.
- **Hill climbing** por candidato: cada pasada evalúa hasta `nA · nB ≈ (n/2)²` swaps; ≤ `n` pasadas hasta converger. Costo de evaluar un swap: `O(1)` con recálculo incremental del costo, o `O(n)` con recálculo completo (aceptable).
- Cota total para `n = 22`, `N = 100`: ≈ `100 · (121 · 22)` ≈ **270k operaciones triviales → < 15 ms**. Sin impacto perceptible.
- **Early-exit**: si un candidato alcanza `cost === 0` (balance perfecto), se corta el bucle.

### Sin índices Firestore nuevos
La feature no agrega queries; `saveTeams()` ya existe. **No requiere índices nuevos.**

---

## v2.3. CONCURRENCIA SEGURA

- El cálculo de balanceo es **puro y local** → sin race conditions en la generación.
- La **persistencia** sigue por `saveTeams()` en `lib/matches.ts` (sin cambios). La auto-asignación de jugadores nuevos a equipos ya existentes (`assignToSmallestTeam`, R15 v1) **no se ve afectada**: opera sobre `match.teams` ya guardado.
- **No se introduce nueva escritura compartida** → no se requiere `runTransaction()` adicional.

---

## v2.4. SEGURIDAD

- **Sin nuevos datos expuestos**: `quality` son agregados numéricos derivados de datos ya visibles para el admin.
- El **nivel de invitados** sigue siendo controlado solo por el admin (`guestLevels`), igual que v1.
- **`firestore.rules` sin cambios**: el esquema de `match.teams.A/B` no cambia (los objetos de jugador conservan los mismos campos, incluidos `photoURL` y `primaryPosition`, R13 v1).
- **Validación de input**: `balanceTeams` clampa `level` al rango válido (1–4) y trata `positions` vacío como `["MID"]` (defensivo, nunca confía en el caller).

---

## v2.5. TOLERANCIA A FALLOS

| Error | Causa probable | Fallback |
|-------|---------------|----------|
| `rng` lanza / pesos inválidos | Caller pasa `BalanceOptions` corrupto | Se usan `DEFAULT_WEIGHTS` y `Math.random` |
| Lista vacía o < 2 jugadores | Llamada fuera de la validación UI | Retorna equipos vacíos + warning, sin throw |
| Todos del mismo nivel/posición | Datos homogéneos | Multi-start degenera al greedy aleatorio; sigue siendo válido (paridad garantizada) |
| Optimización no mejora | Candidato ya óptimo | Hill climbing converge en 1 pasada; se devuelve el greedy |

**Degradación elegante:** si la optimización fallara, el resultado del **primer candidato greedy** (equivalente a la v1) siempre es un balanceo válido. La calidad nunca es *peor* que la v1, porque el greedy v1 es uno de los candidatos evaluados.

---

## v2.6. UX — FLUJOS DE USUARIO

### Flujo principal (sin cambios para el admin)
1. Admin pulsa **"Generar equipos"** → mismo botón, misma latencia percibida.
2. El sistema genera equipos **medibles más balanceados**.
3. La card de equipos muestra un **resumen de calidad** (nuevo).

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Generando | Spinner en el botón (ya existe `balancing`) |
| Éxito | Toast "Equipos balanceados y guardados" + **chip de calidad** |
| Warning | Warnings de GK/nivel como hoy, alimentados por `quality` |

### Chip de calidad (nuevo, opcional en esta entrega)
- Verde "Balance óptimo" si `cost === 0`.
- Ámbar "Balance ±N" mostrando `levelDiff` y/o desbalance de posición cuando `cost > 0`.

---

## v2.7. UI DESIGN

- El drag-and-drop, las cards y `getTeamSummary()` se mantienen.
- **Implementado**: badge de calidad en el header de `TeamsTab`. Se calcula **en vivo** con `getBalanceQuality(teamA, teamB)` (función pura nueva) ⇒ refleja también las ediciones manuales por drag-and-drop, no solo el resultado de `balanceTeams`.
  - `cost === 0` → pill verde "Equipos parejos" (`ShieldCheck`).
  - `cost > 0` → pills ámbar con las dimensiones secundarias desbalanceadas (`Posición ±N`, `Cracks ±N`, `Mixto ±N`). La diferencia de nivel ya es el número destacado del header.
- `lucide-react` para iconos; sin inputs nuevos.

---

## v2.8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `teams_balanced` (existente) | Al guardar equipos balanceados | `match_id`, **`level_diff`**, **`position_imbalance`**, **`candidates_evaluated`** (nuevas props derivadas de `quality`) |

Se **enriquece** el evento existente con la métrica de calidad; no se crean eventos nuevos. Mantener `snake_case` e `initAnalytics()` lazy. **Implementado**: `logTeamsBalanced(matchId, quality?)` recibe el `quality` desde `handleBalance()`; `trackEvent` se amplió a `Record<string, string | number>` para soportar props numéricas.

---

## v2.9. ARQUITECTURA TÉCNICA

### Modelo de datos (tipos nuevos en `lib/domain/team.ts`)

```typescript
/** Pesos de cada término del costo. Mayor peso = criterio más prioritario. */
export interface BalanceWeights {
  level: number;    // diferencia de nivel total entre equipos
  star: number;     // diferencia de jugadores "crack" (nivel 4)
  position: number; // desbalance de posiciones primarias
  sex: number;      // diferencia de mujeres entre equipos
}

export const DEFAULT_WEIGHTS: BalanceWeights = {
  level: 10,   // prioridad máxima: nivel
  star: 6,     // luego: no concentrar cracks
  position: 3, // luego: repartir posiciones
  sex: 4,      // y repartir mujeres
};

export interface BalanceOptions {
  candidates?: number;        // multi-start (default 100)
  weights?: BalanceWeights;   // default DEFAULT_WEIGHTS
  rng?: () => number;         // inyectable para tests (default Math.random)
}

export interface BalanceQuality {
  levelDiff: number;          // |scoreA - scoreB|
  starDiff: number;           // |cracksA - cracksB| (nivel 4)
  positionImbalance: number;  // Σ |primaryCountA(pos) - primaryCountB(pos)|
  sexDiff: number;            // |mujeresA - mujeresB|
  cost: number;               // costo ponderado total (menor = mejor)
  candidatesEvaluated: number;
}

export interface BalanceResult {
  teamA: Team;
  teamB: Team;
  warnings: string[];
  quality: BalanceQuality;    // ← NUEVO (aditivo)
}
```

### Capa de dominio (`lib/domain/team.ts`) — funciones puras nuevas

```typescript
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const isCrack  = (p: Player) => (p.level ?? 0) >= 4;
const isFemale = (p: Player) => p.sex === "F";
const primaryPos = (p: Player): Position => p.positions?.[0] ?? "MID";

/** Costo multi-objetivo: menor es mejor. cost === 0 ⇒ balance perfecto. */
function computeCost(a: Team, b: Team, w: BalanceWeights): BalanceQuality {
  const levelDiff = Math.abs(a.score - b.score);
  const starDiff  = Math.abs(a.players.filter(isCrack).length  - b.players.filter(isCrack).length);
  const sexDiff   = Math.abs(a.players.filter(isFemale).length - b.players.filter(isFemale).length);
  const positionImbalance = POSITIONS.reduce((sum, pos) =>
    sum + Math.abs(
      a.players.filter(p => primaryPos(p) === pos).length -
      b.players.filter(p => primaryPos(p) === pos).length), 0);
  const cost = w.level*levelDiff + w.star*starDiff + w.position*positionImbalance + w.sex*sexDiff;
  return { levelDiff, starDiff, positionImbalance, sexDiff, cost, candidatesEvaluated: 0 };
}

/** Un candidato: snake-draft greedy con shuffle + orden de GK aleatorio. */
function greedyCandidate(players: Player[], rng: () => number): { a: Team; b: Team } { /* … v1 + GK aleatorio + desempates con rng … */ }

/** Hill climbing: aplica el mejor swap que reduce el costo hasta converger.
 *  Solo intercambia jugadores de campo entre A y B ⇒ preserva paridad y GKs. */
function improveBySwaps(a: Team, b: Team, w: BalanceWeights): void { /* … */ }
```

### Punto de entrada (firma compatible)

```typescript
export function balanceTeams(
  players: Player[],
  options: BalanceOptions = {},
): BalanceResult {
  const { candidates = 100, weights = DEFAULT_WEIGHTS, rng = Math.random } = options;

  let best: { a: Team; b: Team } | null = null;
  let bestQuality: BalanceQuality | null = null;

  for (let i = 0; i < candidates; i++) {
    const { a, b } = greedyCandidate(players, rng);
    improveBySwaps(a, b, weights);
    const q = computeCost(a, b, weights);
    if (!bestQuality || q.cost < bestQuality.cost) { best = { a, b }; bestQuality = q; }
    if (bestQuality.cost === 0) break; // óptimo perfecto
  }

  // warnings (GK faltantes + nivel alto, igual que v1, leídos desde quality)
  // quality.candidatesEvaluated = i + 1
  return { teamA: best!.a, teamB: best!.b, warnings, quality: bestQuality! };
}
```

> **Nota de diseño — por qué multi-start + hill climbing y no exhaustivo:** la partición exacta es exponencial; con `n ≤ 30` el multi-start (100 arranques aleatorios) + mejora local converge a óptimo o casi-óptimo en `< 15 ms`, es trivial de mantener y degrada con elegancia al greedy v1. Un solver exacto no aporta valor perceptible para estos tamaños.

> **Nota — eliminación de sesgos (D4):** el orden de los 2 GKs se baraja por candidato y los empates usan `rng`; con 100 candidatos ambas colocaciones de GK se exploran y se elige la de menor costo, eliminando el sesgo "GK fuerte → A".

### Capa API (`lib/balanceTeams.ts`)
- Se **re-exportan** los nuevos tipos: `BalanceWeights`, `BalanceOptions`, `BalanceQuality`, `DEFAULT_WEIGHTS`. La firma pública no cambia.

### Capa UI (`app/match/[id]/page.tsx`)
- `handleBalance()` **no requiere cambios** para funcionar (firma compatible).
- **Opcional**: leer `result.quality` para el chip de calidad y enriquecer `logTeamsBalanced(id, quality)`.

---

## v2.10. CRITERIOS DE ACEPTACIÓN

- [ ] **CA-1** Con `[4,3,3,2,2,2]` el optimizador alcanza el óptimo de nivel bajo paridad: `8-8` (`levelDiff = 0`). *(Nota: con la restricción de paridad y niveles 1–4 no siempre existe un split de `levelDiff = 0`; el criterio es que el optimizador alcance el mínimo alcanzable, no que supere al greedy en todos los casos.)*
- [ ] **CA-2** La paridad numérica se mantiene (diff de jugadores ≤ 1) en todos los casos.
- [ ] **CA-3** Con ≥ 2 GKs, cada equipo tiene exactamente 1 GK tras la optimización.
- [ ] **CA-4** Con un `rng` fijo inyectado, dos ejecuciones producen **idéntico** resultado (determinismo para tests).
- [ ] **CA-5** Sin sesgo de GK: sobre muchas corridas, el GK más fuerte cae en A y en B con frecuencia comparable.
- [ ] **CA-6** Dos mujeres en un mixto quedan **una en cada equipo** cuando el resto del costo lo permite.
- [ ] **CA-7** `[4,4,2,2]` vs alternativas: el resultado no concentra ambos nivel-4 en el mismo equipo si existe reparto de igual `levelDiff`.
- [ ] **CA-8** `BalanceResult.quality` se devuelve con todos los campos y `cost` coherente con los equipos.
- [ ] **CA-9** `balanceTeams(players)` (sin options) sigue funcionando y `handleBalance()` no se rompe.
- [ ] **CA-10** El balanceo de 22 jugadores resuelve en `< 50 ms` en máquina de desarrollo.
- [ ] **CA-11** `team.test.ts` cubre CA-1 a CA-8 con casos deterministas (rng fijo).

---

## v2.11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/team.ts` | Reescritura del motor: `BalanceWeights`, `BalanceOptions`, `BalanceQuality`, `computeQuality()`, `greedyCandidate()`, `improveBySwaps()`, `balanceTeams()` multi-start, `getBalanceQuality()`. Mantiene `getTeamSummary()` y `sortTeamForDisplay()` |
| `lib/domain/team.test.ts` | **NUEVO** — 19 tests de propiedades (CA-1…CA-10) con `rng` fijo |
| `lib/balanceTeams.ts` | Re-exporta nuevos tipos, `DEFAULT_WEIGHTS` y `getBalanceQuality` |
| `app/match/[id]/page.tsx` | `handleBalance()` pasa `result.quality` a `logTeamsBalanced` |
| `app/match/[id]/components/TeamsTab.tsx` | Badge de calidad en vivo con `getBalanceQuality()` |
| `lib/analytics.ts` | `logTeamsBalanced(matchId, quality?)` con props `level_diff`, `position_imbalance`, `candidates_evaluated`; `trackEvent` acepta `string \| number` |
| `docs/TEAM_BALANCE_FEATURE_SDD.md` | Este documento (propuesta v2) |

> `firestore.rules` **no cambia** (esquema de `match.teams` intacto).

---

## v2.12. PLAN DE IMPLEMENTACIÓN SUGERIDO

1. **Dominio + tipos** (`team.ts`): `computeCost`, `greedyCandidate`, `improveBySwaps`, `balanceTeams` multi-start. Mantener compatibilidad de firma.
2. **Tests** (`team.test.ts`): CA-1 a CA-8 con `rng` determinista → red/green.
3. **Re-exports** (`balanceTeams.ts`).
4. **UI opcional**: chip de calidad + analytics enriquecido.
5. **Verificación**: correr `handleBalance()` en un partido real y comparar `quality` antes/después.

