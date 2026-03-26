# Feature: Gestión de Partidos

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna completamente la implementación de la feature "Gestión de Partidos".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Permitir que un administrador cree partidos, gestione jugadores, confirme asistencia, balancee equipos, registre marcador y cierre/reabra el partido.

### Algoritmo de Balanceo
1.  **Paridad Numérica Primero:** Los equipos deben tener la misma cantidad de jugadores (o diferencia de 1 si es impar).
2.  **Reparto por Categoría (1:1):** Se distribuyen sucesivamente Porteros, Mujeres y Posiciones (DEF, MID, FWD), balanceando cada grupo individualmente.
3.  **Consideración de Posición Secundaria:** Al balancear roles, se cuenta tanto la posición primaria como la secundaria para evitar desbalances tácticos.
4.  **Snake Draft:** El equipo con menor nivel/cantidad tiene prioridad para elegir al mejor jugador del siguiente grupo.

### Entidad: Match

```typescript
interface Match {
  id: string;
  date: string;           // Fecha del partido (ISO string)
  time: string;           // Hora del partido
  duration?: MatchDuration; // Duración en minutos (30|60|90|120|150|180)
  maxPlayers: number;     // Máximo de jugadores confirmados
  locationId: string;     // Referencia a la cancha
  status: "open" | "closed";
  createdBy: string;      // UID del administrador
  allowGuests?: boolean;  // Si el partido permite agregar invitados (por defecto true si no existe)
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
  positions: Position[];  // 1-3 posiciones
  primaryPosition?: Position; // Posición principal preferida (renderizada con 👑)
  confirmed: boolean;     // Si confirmó asistencia
  photoURL?: string;      // URL de la foto de perfil (Firebase Storage)
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Roles pueden crear partidos según Tier | `canManageLocation()` y `canCreatePublicMatch()` en `lib/domain/user.ts` |
| 2 | Máximo `maxPlayers` jugadores confirmados | `getConfirmedCount()` + `isMatchFull()` en `lib/domain/match.ts` |
| 3 | Partido no puede cerrarse sin equipos balanceados | Validación en UI (`disabled={!match?.teams}`) |
| 4 | Jugador puede confirmar/cancelar asistencia | `confirmAttendance()` / `unconfirmAttendance()` en `lib/matches.ts` |
| 5 | Admin puede agregar jugadores registrados o manuales | `addPlayerToMatch()` en `lib/matches.ts` |
| 6 | Owner (o Super Admin) puede eliminar jugadores | `deletePlayerFromMatch()` en `lib/matches.ts` |
| 7 | Al cerrar partido se registran estadísticas | `updatePlayerStats()` en `lib/playerStats.ts` |
| 8 | Partido reabierto revierte stats previos | `previousResult` param en `updatePlayerStats()` |
| 9 | Invitados visibles y balanceables desde match detail | Guest display + `guestToPlayer()` en match page |
| 10 | Reporte WhatsApp usa equipos locales (incluye cambios DnD) | `balanced` state preferred over `match.teams` |
| 11 | Los códigos de partido pueden ser IDs puros, con extensión `.ai`/`.app`, enlaces completos (`/join/ID`), con trailing slash o query params | `sanitizeMatchCode()` en `lib/matchCode.ts` |
| 12 | Jugadores agregados desde la página admin quedan confirmados automáticamente | `addPlayerToMatch()` acepta param opcional `confirmed` (default: `false`) |
| 13 | Al desconfirmar asistencia, el jugador se remueve también de los equipos balanceados | `unconfirmAttendance()` filtra `match.teams.A/B` además de `match.players` |
| 14 | `getMyMatches()` retorna partidos donde el usuario es jugador O creador | Doble query en paralelo: `playerUids array-contains` + `createdBy ==`, merge y deduplicación |
| 15 | La duración del partido es obligatoria al crear y debe ser tramos de 30 min (30-180) | `MatchDuration` type + validación en `validateMatchCreation()` |

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
  player: Omit<Player, "confirmed"> & { confirmed?: boolean }
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
      players: [...players, { ...player, confirmed: player.confirmed ?? false }],
      playerUids: arrayUnion(player.uid),
    });
  });
}
```

**✅ Cumple especificación**: Reglas #2, #5, #12

#### Obtención de partidos del usuario (`getMyMatches`)
```typescript
export async function getMyMatches(uid: string): Promise<Match[]> {
  // Query 1: partidos donde el usuario es jugador
  const playerQ = query(matchesRef, where("playerUids", "array-contains", uid), orderBy("createdAt", "desc"));
  // Query 2: partidos creados por el usuario
  const creatorQ = query(matchesRef, where("createdBy", "==", uid), orderBy("createdAt", "desc"));

  const [playerSnap, creatorSnap] = await Promise.all([getDocs(playerQ), getDocs(creatorQ)]);

  // Merge y deduplicar
  const matchMap = new Map<string, Match>();
  for (const snap of [playerSnap, creatorSnap]) {
    for (const d of snap.docs) {
      if (!matchMap.has(d.id)) matchMap.set(d.id, { id: d.id, ...(d.data() as Omit<Match, "id">) });
    }
  }
  return Array.from(matchMap.values());
}
```

**✅ Cumple especificación**: Regla #14 — Garantiza que admins siempre vean partidos que crearon

### Limitación por Tier (Creación de Partidos)
```typescript
export async function createMatch(data: CreateMatchInput, createdBy: UserProfile): Promise<string> {
  const isSuper = isSuperAdmin(createdBy);
  const canManage = canManageLocation(createdBy, data.locationId);

  if (!isSuper && !canManage) {
    throw new Error("No tienes acceso a esta cancha.");
  }

  if (!data.isPrivate && !canCreatePublicMatch(createdBy)) {
    throw new Error("Solo Super y Location Admins pueden crear partidos públicos.");
  }

  // Creación del partido
}
```

#### **Capa 3: UI** — Arquitectura Tab-Based con Component Decomposition

La página admin de partido (`app/match/[id]/page.tsx`) fue rediseñada de un monolito de ~1,700 líneas a un orquestador de ~480 líneas que delega a componentes especializados mediante 4 tabs.

**Orquestador** (`page.tsx`): Owns `onSnapshot` listener, match state, balanced state, all API callbacks. Pasa datos y callbacks como props a tab components.

```
app/match/[id]/
  page.tsx                    -- Orquestador (~480 líneas)
  components/
    MatchAdminTabs.tsx        -- Navegación por tabs sticky (WAI-ARIA)
    DashboardTab.tsx          -- Resumen de estado + progress bar
    MatchProgressBar.tsx      -- Stepper visual del ciclo de vida
    PlayersTab.tsx            -- Lista jugadores + agregar jugador + waitlist
    PlayerRow.tsx             -- Fila expandible de jugador
    AttendanceMode.tsx        -- Modo batch de asistencia
    TeamsTab.tsx              -- Balance + equipos side-by-side + marcador
    TeamColumn.tsx            -- Columna DnD de equipo individual
    ScoreInput.tsx            -- Entrada de marcador +/-
    PlayerItem.tsx            -- Tarjeta drag-and-drop de jugador
    SettingsTab.tsx           -- Compartir, config, ciclo de vida, zona peligrosa
    MatchFAB.tsx              -- Floating action button contextual
```

### Match Lifecycle Phase System

Función pura `getMatchPhase()` en `lib/domain/match.ts` que determina la fase actual:

| Phase | Condición | Tab por defecto |
|---|---|---|
| `recruiting` | Abierto, hay cupo, sin equipos | Dashboard |
| `full` | Abierto, lleno O equipos existen | Teams |
| `gameday` | Abierto, equipos guardados, es hoy | Teams |
| `postgame` | Abierto, equipos + marcador ingresado | Teams |
| `closed` | status=closed | Dashboard |

### Tab Navigation (MatchAdminTabs)
- 4 tabs: Dashboard, Jugadores (badge con count), Equipos (dot unsaved), Ajustes
- `sticky top-0 z-40`, WAI-ARIA tab pattern (`role="tablist"`, `aria-selected`)
- Auto-selecciona tab según `MatchPhase` al cargar
- Deep linking via `?tab=players` URL params

### Context-Sensitive FAB (MatchFAB)
Botón flotante `fixed bottom-24 right-4 z-40` que muestra la acción prioritaria por fase:

| Phase | FAB | Icono |
|---|---|---|
| recruiting | Compartir | 📲 |
| full | Balancear | ⚖️ |
| gameday | Pasar lista | ✅ |
| postgame | Cerrar | 🔒 |
| closed | Reporte | 📋 |

### Players Tab
- **Summary bar**: Confirmados / Pendientes / Espera con conteos tappables
- **Player rows expandibles**: Collapsed muestra foto + nombre + posición + badge. Expanded muestra level, posiciones, teléfono, controles de asistencia, eliminar
- **Agregar jugador**: Tarjetas de usuario buscables (foto, nombre, posición, nivel) en vez de `<select>`
- **Agregar invitado manual**: Requiere selección de posición antes de agregar
- **Attendance mode**: Modo batch "Pasar Lista" con tap-to-cycle (presente → tarde → no_show)

### Teams Tab
- **Side-by-side siempre**: `grid grid-cols-2 gap-2` en todas las pantallas
- **DnD**: `@dnd-kit/core` con `PointerSensor` + `TouchSensor` (delay: 200ms para distinguir de scroll)
- **Marcador inline** con equipos (no sección separada)
- **"Guardar todo"** unificado (equipos + marcador)
- **Position grid colapsable**

### Access Denied UX
- Si un admin sin permisos accede a `/match/[id]`, ve pantalla "Sin permisos de administración" con botón para ir a `/join/[id]` como jugador (en vez de un 404 genérico)

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

## 6. TESTING

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

### Tests de sanitizeMatchCode (22 tests ✅)

```typescript
// lib/matchCode.test.ts — ejecutar con: npx vitest run lib/matchCode.test.ts
// Cubre: códigos planos, sufijos .ai/.app, URLs completas,
//        trailing slashes, query params, inputs vacíos
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
| Dominio | `lib/domain/match.ts` | Tipos, reglas puras, `getMatchPhase()`, `canViewMatchAdmin()` |
| Dominio | `lib/domain/player.ts` | Player, Position |
| Dominio | `lib/domain/team.ts` | `sortTeamForDisplay()` |
| Dominio | `lib/domain/errors.ts` | MatchFullError |
| API | `lib/matches.ts` | CRUD Firestore, `getMyMatches()` (dual query) |
| API | `lib/playerStats.ts` | Estadísticas |
| API | `lib/matchReport.ts` | Reporte WhatsApp |
| API | `lib/matchCode.ts` | Sanitización de códigos (.ai/.app trick, URLs, query params) |
| Test | `lib/matchCode.test.ts` | 22 tests para sanitizeMatchCode |
| UI | `app/match/[id]/page.tsx` | Orquestador admin (onSnapshot, state, callbacks) |
| UI | `app/match/[id]/components/*.tsx` | 12 componentes: Tabs, Dashboard, Players, Teams, Settings, FAB, etc. |
| UI | `app/join/[id]/page.tsx` | Player view |
| UI | `app/page.tsx` | Home / lista |
| UI | `app/new-match/page.tsx` | Crear partido |
| Seguridad | `firestore.rules` | `isTeamAdmin()` helper + regla de lectura granular |

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

### Visualización de Avatar y Posición
En todos los listados de jugadores (Join Page, Admin, MVP), se utiliza un sistema de avatar unificado que combina identidad y rol táctico.

### Reglas de Visualización
| Elemento | Fuente de Datos | Comportamiento |
|------|-----------------------|---------------------------|
| **Base del Avatar** | `photoURL` | Si existe, muestra la foto; si no, muestra las **iniciales** del nombre. |
| **Badge de Posición** | `primaryPosition` | Se muestra siempre como un badge flotante sobre el avatar. |
| **Prioridad de Icono** | `primaryPosition` > `positions[0]` | Prioriza la posición principal del perfil sobre la lista general. |

### Sincronización de Perfiles
Para asegurar que los datos visuales sean consistentes, la página de Join implementa una sincronización reactiva:
- **Evento**: Al cargar el detalle del partido.
- **Lógica**: Si el `photoURL` o las `positions` del perfil del usuario difieren de los almacenados en el documento del partido, el sistema los actualiza automáticamente sin requerir acción del usuario.
- **Objetivo**: Garantizar que los cambios en el perfil se reflejen en todos los partidos activos del jugador.

### Navegación de Administrador
- Los usuarios con rol `admin` verán un botón destacado "👁️ Ver como admin" en la parte superior del detalle del partido.
- Este botón los redirige a la vista completa de administración (`/match/[id]`), facilitando el salto entre la vista pública y la gestión del partido.

### Home Page: MatchCard y Secciones

La Home (`app/page.tsx`) organiza los partidos del usuario en tres zonas:

#### Hero Card (Próximo Partido)
- Muestra el siguiente partido abierto más cercano en el tiempo.
- **Date box** (5.5rem × 5.5rem): día de semana completo (ej: "JUEVES"), número del día (grande), mes abreviado.
- **Jerarquía visual**: Hora (protagonista, `text-lg font-black`) > Ubicación (secundaria con icono `MapPin`) > Metadata (cupos + formato).
- **Avatares**: Componente `PlayerAvatars` muestra los primeros 4 jugadores confirmados con carga coordinada (pulse skeleton hasta que todas las imágenes cargan, luego fade-in conjunto).
- **Líneas de cancha**: SVG inline al 8% de opacidad como fondo decorativo.
- **Conteo de jugadores**: Incluye jugadores confirmados + invitados activos (no waitlist). Se muestra en verde cuando el partido está lleno.

#### MatchCard (`components/MatchCard.tsx`)
- **Date box** (4.5rem × 4.5rem): día de semana completo en verde (`text-emerald-700 font-black`), día numérico, mes abreviado.
- **Jerarquía**: Hora (`text-sm font-black`) > Ubicación (`text-xs text-slate-500`) > Metadata (`text-xs text-slate-400`).
- **Metadata**: Icono `Clock` + hora (PM/AM en mayúsculas), icono `Users` + confirmados/máximo, icono `LandPlot` + formato (ej: "Fútbol 6").
- **Conteo**: Jugadores confirmados + invitados activos (no waitlist).
- **Cerrados**: `opacity-75` para señalización visual.
- **Normalización de ubicación**: Title Case aplicado (`toLowerCase().replace(/\b\w/g, ...)`).
- **Chevron** derecho para señal de navegación.
- **Formato**: `formatTime12h()` normaliza `"p. m."` → `"PM"`.

#### Separación Activos / Historial
- **"Partidos Activos"**: Partidos con `status === 'open'` (excluye el hero). Badge pill verde con conteo.
- **"Historial"**: Partidos con `status === 'closed'`. Badge pill gris con conteo. Cards en `opacity-75`.
- Cada sección tiene su propio header y conteo independiente.

#### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `components/MatchCard.tsx` | Card reutilizable para listas de partidos |
| `components/PlayerAvatars.tsx` | Avatares con carga coordinada |
| `components/skeletons/HomeSkeleton.tsx` | Skeleton de la home (hero + dos secciones) |
| `components/skeletons/MatchListSkeleton.tsx` | Skeleton para listas de partidos |
| `lib/date.ts` → `formatTime12h()` | Normaliza AM/PM en mayúsculas |

### Estados de Carga (Skeletons)
- Para evitar saltos de diseño (layout shifts) durante la carga de las páginas, la aplicación usa componentes `Skeleton` (ej. `HomeSkeleton`, `MatchListSkeleton`, `ProfileSkeleton`, `JoinSkeleton`, `MatchAdminSkeleton`).
- Estos componentes reflejan exactamente la misma estructura de CSS, bordes, paddings y truncamientos de texto que la vista final para asegurar transiciones visualmente imperceptibles. En páginas con elementos estáticos (como el banner verde superior de `JoinMatchPage`), el skeleton los renderiza idénticamente y delega las clases de animación `animate-pulse` exclusiva e individualmente a los contenedores interiores dinámicos. Así mismo, la vista de administración usa su propio skeleton complejo (`MatchAdminSkeleton`) que emula perfectamente las tarjetas de acciones administrativas y listados.
- **Integración con Auth**: Los skeletons de página principal (como `HomeSkeleton` en `app/page.tsx`) se coordinan explícitamente con el estado `authLoading` del `AuthContext`. Esto asegura que los esqueletos se muestren fluidamente mientras se resuelve la sesión sin bloquear la evaluación de `AuthGuard`, permitiendo la correcta redirección a Login si el usuario resulta no autenticado o previniendo bloqueos si ocurren errores de red.

### Fuente de Verdad
- Iconos definidos en `lib/domain/player.ts` (`POSITION_ICONS`)
- Posiciones definidas en `lib/domain/player.ts` (`Position`)
