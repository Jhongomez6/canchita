# Feature: Gestión de Partidos

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna completamente la implementación de la feature "Gestión de Partidos".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Permitir que un administrador cree partidos, gestione jugadores, confirme asistencia, balancee equipos, registre marcador y cierre/reabra el partido.

### Entidad: Match

```typescript
interface Match {
  id: string;
  date: string;           // Fecha del partido (ISO string)
  time: string;           // Hora del partido
  maxPlayers: number;     // Máximo de jugadores confirmados
  locationId: string;     // Referencia a la cancha
  status: "open" | "closed";
  createdBy: string;      // UID del administrador
  players: Player[];      // Lista de jugadores
  guests?: Guest[];       // Invitados (ver GUESTS_FEATURE_SDD.md)
  teams?: { A: Player[]; B: Player[] };
  score?: { A: number; B: number };
}
```

### Entidad: Player

```typescript
interface Player {
  id?: string;          // Unique identifier for tracking/DnD
  uid?: string;           // UID del usuario (opcional para manuales)
  name: string;           // Nombre del jugador
  level: 1 | 2 | 3;      // Nivel: Bajo, Medio, Alto
  positions: Position[];  // 1-2 posiciones
  confirmed: boolean;     // Si confirmó asistencia
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo admin puede crear partidos | `isAdmin()` en `lib/domain/user.ts` |
| 2 | Máximo `maxPlayers` jugadores confirmados | `getConfirmedCount()` + `isMatchFull()` en `lib/domain/match.ts` |
| 3 | Partido no puede cerrarse sin equipos balanceados | Validación en UI (`disabled={!match?.teams}`) |
| 4 | Jugador puede confirmar/cancelar asistencia | `confirmAttendance()` / `unconfirmAttendance()` en `lib/matches.ts` |
| 5 | Admin puede agregar jugadores registrados o manuales | `addPlayerToMatch()` en `lib/matches.ts` |
| 6 | Admin puede eliminar jugadores | `deletePlayerFromMatch()` en `lib/matches.ts` |
| 7 | Al cerrar partido se registran estadísticas | `updatePlayerStats()` en `lib/playerStats.ts` |
| 8 | Partido reabierto revierte stats previos | `previousResult` param en `updatePlayerStats()` |
| 9 | Invitados visibles y balanceables desde match detail | Guest display + `guestToPlayer()` en match page |
| 10 | Reporte WhatsApp usa equipos locales (incluye cambios DnD) | `balanced` state preferred over `match.teams` |
| 11 | Los códigos de partido pueden ser IDs puros, con extensión `.ai`/`.app`, o enlaces completos (`/join/ID`) | `sanitizeMatchCode()` en `lib/matchCode.ts` |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

### Separación de Responsabilidades

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
│              (Fuente de Verdad)                      │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │ DOMINIO│     │   API   │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
         │               │               │
    Match types     Firestore       Match Detail
    Validaciones    Transacciones   Join Page
    Reglas puras    CRUD ops        Home Page
```

### Capas de la Implementación

#### **Capa 1: Dominio** (`lib/domain/match.ts`)
- **Responsabilidad**: Tipos, validaciones puras, reglas de negocio
- **No depende de**: Firebase, React, UI
- **Exporta**: `Match`, `CreateMatchInput`, `getConfirmedCount()`, `isMatchFull()`

```typescript
export function getConfirmedCount(players: Player[]): number {
  return players.filter(p => p.confirmed).length;
}

export function isMatchFull(players: Player[], maxPlayers: number): boolean {
  return getConfirmedCount(players) >= maxPlayers;
}
```

**✅ Cumple especificación**: Regla #2

#### **Capa 2: API/Backend** (`lib/matches.ts`)
- **Responsabilidad**: Operaciones de Firestore, transacciones
- **Depende de**: Dominio, Firebase
- **Exporta**: `createMatch()`, `addPlayerToMatch()`, `confirmAttendance()`, `closeMatch()`, etc.

```typescript
export async function addPlayerToMatch(
  matchId: string,
  player: Omit<Player, "confirmed">
): Promise<void> {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const players: Player[] = data?.players ?? [];
    
    if (isMatchFull(players, data?.maxPlayers ?? Infinity)) {
      throw new MatchFullError("El partido está lleno");
    }
    
    tx.update(ref, {
      players: [...players, { ...player, confirmed: false }],
    });
  });
}
```

**✅ Cumple especificación**: Reglas #2, #5

#### **Capa 3: UI** (`app/match/[id]/page.tsx`, `app/join/[id]/page.tsx`)
- **Responsabilidad**: Interfaz de usuario, feedback visual
- **Depende de**: API, Dominio (tipos)
- **Tipado estricto**: `useState<Match | null>`, `(p: Player)` en lugar de `any`

```typescript
const [match, setMatch] = useState<Match | null>(null);
const [users, setUsers] = useState<UserProfile[]>([]);
const [location, setLocation] = useState<Location | null>(null);

const guestCount = match.guests?.length ?? 0;
const confirmedCount = (match.players?.filter((p: Player) => p.confirmed).length ?? 0) + guestCount;
const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);
```

**✅ Cumple especificación**: Feedback visual de estado completo/abierto

### UI Components & Estados

#### 1. Location View (Accordion)
- **Estado**: `isMapOpen` (boolean)
- **Comportamiento**: Header con nombre de cancha y chevron rotativo. Al expandir muestra mapa y botones (Waze/Maps).
- **Estilo**: Card unificada en "Match Info", eliminando tarjeta separada.

#### 2. Admin Actions (Collapsible)
- **Estado**: `isAddPlayerOpen` (boolean)
- **Comportamiento**: Botón "+ Agregar Jugador o Invitado" expande el formulario.
- **Objetivo**: Reducir ruido visual en el dashboard.

#### 3. Match Result View (Closed Matches)
- **Condición**: `status === "closed" && teams !== undefined`
- **Componentes**:
  - **Scoreboard**: Marcador final (e.g., 3 - 2).
  - **Personal Result**: Banner "Ganaste/Perdiste" basado en `user.uid` vs `teams`.
  - **Team Rosters**: Listas de Equipo A vs Equipo B con iconos de posición.
- **Reemplaza**: La lista plana de "Jugadores confirmados".

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #2: Máximo jugadores confirmados

**Especificación**:
> No se pueden confirmar más jugadores que el máximo permitido

**Implementación**:

1. **Dominio** (`lib/domain/match.ts`):
```typescript
export function isMatchFull(players: Player[], maxPlayers: number): boolean {
  return getConfirmedCount(players) >= maxPlayers;
}
```

2. **API** (`lib/matches.ts`):
```typescript
if (isMatchFull(players, data?.maxPlayers ?? Infinity)) {
  throw new MatchFullError("El partido está lleno");
}
```

3. **UI** (`app/match/[id]/page.tsx`):
```typescript
<button disabled={!p.confirmed && isFull}>
  {p.confirmed ? "Cancelar asistencia" : "Confirmar asistencia"}
</button>
```

---

### Regla #7: Estadísticas al cerrar

**Especificación**:
> Al cerrar un partido se actualizan las estadísticas de los jugadores

**Implementación**:

1. **Dominio** (`lib/domain/player.ts`): Define `Player` con `uid` para trazabilidad
2. **API** (`lib/playerStats.ts`): `updatePlayerStats(players, result, matchId)`
3. **UI** (`app/match/[id]/page.tsx`): Llama a stats antes de `closeMatch()`

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un admin
**When** crea un partido con fecha, hora, cancha y máximo de jugadores
**Then** el partido queda registrado en estado "open"

### ✅ Criterio 2
**Given** un partido abierto con cupo disponible
**When** un jugador confirma asistencia
**Then** su estado cambia a "confirmado" y se incrementa el contador

### ✅ Criterio 3
**Given** un partido completo
**When** un jugador intenta confirmar
**Then** la acción es bloqueada con mensaje visual

### ✅ Criterio 4
**Given** un partido con equipos balanceados y marcador
**When** el admin cierra el partido
**Then** se registran estadísticas y el estado cambia a "closed"

---

## 5. EJEMPLO DE USO

### Vista de Admin (Match Detail)

```typescript
// app/match/[id]/page.tsx
import type { Match } from "@/lib/domain/match";
import type { Player } from "@/lib/domain/player";
import type { UserProfile } from "@/lib/domain/user";

const [match, setMatch] = useState<Match | null>(null);

// Agregar jugador registrado
const profile = await getUserProfile(selectedUid);
await addPlayerToMatch(id, {
  uid: selectedUid,
  name: profile.name,
  level: 2,
  positions: profile.positions || [],
});
```

### Vista de Jugador (Join Page)

```typescript
// app/join/[id]/page.tsx
import type { Player } from "@/lib/domain/player";

const isEnrolled = match.players.some(
  (p: Player) => p.uid === user.uid || p.name === playerName
);
```

---

## 6. TESTING (Recomendado)

### Tests de Dominio

```typescript
// lib/domain/__tests__/match.test.ts

describe("getConfirmedCount", () => {
  it("cuenta solo jugadores confirmados", () => {
    const players: Player[] = [
      { name: "A", level: 2, positions: ["MID"], confirmed: true },
      { name: "B", level: 2, positions: ["DEF"], confirmed: false },
    ];
    expect(getConfirmedCount(players)).toBe(1);
  });
});

describe("isMatchFull", () => {
  it("retorna true cuando se alcanza el máximo", () => {
    const players: Player[] = [
      { name: "A", level: 2, positions: ["MID"], confirmed: true },
      { name: "B", level: 2, positions: ["DEF"], confirmed: true },
    ];
    expect(isMatchFull(players, 2)).toBe(true);
  });
});
```

---

## 7. CÓMO LA ESPECIFICACIÓN GOBIERNA LA IMPLEMENTACIÓN

### Principios Aplicados

1. **La especificación es la fuente de verdad**
   - Cada regla tiene una función de dominio correspondiente
   - No se implementan reglas no especificadas

2. **Separación de responsabilidades**
   - Dominio: Tipos y validaciones puras
   - API: Transacciones Firestore
   - UI: Interfaz tipada con domain types

3. **Validación en múltiples capas**
   - UI: Botones deshabilitados cuando partido lleno
   - API: Transacciones con validación de cupo
   - Dominio: `isMatchFull()` como regla pura

4. **Errores tipados**
   - `MatchFullError`: Partido lleno
   - `ValidationError`: Datos inválidos

5. **Trazabilidad completa**
   - Cada regla de negocio mapeada a código específico
   - Tipos compartidos entre las 3 capas

---

## 8. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/match.ts` | Tipos, reglas puras |
| Dominio | `lib/domain/player.ts` | Player, Position |
| Dominio | `lib/domain/errors.ts` | MatchFullError |
| API | `lib/matches.ts` | CRUD Firestore |
| API | `lib/playerStats.ts` | Estadísticas |
| API | `lib/matchReport.ts` | Reporte WhatsApp |
| API | `lib/matchCode.ts` | Sanitización de códigos (.ai trick) |
| UI | `app/match/[id]/page.tsx` | Admin view |
| UI | `app/join/[id]/page.tsx` | Player view |
| UI | `app/page.tsx` | Home / lista |
| UI | `app/new-match/page.tsx` | Crear partido |

---

## 9. CONCLUSIÓN

Esta implementación demuestra cómo **SDD** garantiza que:

✅ **Cada regla de negocio está implementada en la capa correcta**
✅ **Tipos de dominio eliminan `any` en toda la UI**
✅ **Las funciones puras del dominio son testeables sin Firebase**
✅ **Las transacciones de Firestore validan con reglas del dominio**
✅ **El código es trazable a la especificación**

---

## 10. ESPECIFICACIÓN UI: LISTA DE JUGADORES (Join Page)

### Visualización de Avatar
En lugar de fotos de perfil o iniciales, se debe mostrar el **icono de la posición primaria** del jugador para facilitar la lectura táctica.

### Reglas de Visualización
| Tipo | Fondo | Color Icono | Contenido |
|------|-------|-------------|-----------|
| **Jugador Registrado** | `bg-emerald-100` | `text-emerald-700` | `POSITION_ICONS[p.positions[0]]` (o MID por defecto) |
| **Invitado** | `bg-purple-100` | `text-purple-700` | `POSITION_ICONS[g.positions[0]]` (o icono invitado si no hay pos) |

### Fuente de Verdad
- Iconos definidos en `lib/domain/player.ts` (`POSITION_ICONS`)
- Posiciones definidas en `lib/domain/player.ts` (`Position`)
