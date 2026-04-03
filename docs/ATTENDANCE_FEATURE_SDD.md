# Feature: Control de Asistencia (Attendance)

## 📋 Specification-Driven Development (SDD)

Este documento define la especificación para el sistema de **Control de Asistencia** de jugadores.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Permitir a los administradores registrar "Llegadas Tarde" y "No Shows". Esta información alimentará una métrica de **Compromiso** (Commitment Score) que será la única visible para el usuario.

### Entidad: MatchPlayerAttendance
La entidad `Player` dentro de un `Match` se extenderá para incluir el estado de asistencia.

```typescript
type AttendanceStatus = "present" | "late" | "no_show";

interface Player {
  // ... campos existentes
  attendance?: AttendanceStatus; // Default: "present" (implícito si undefined)
}
```

### Entidad: UserStats (Actualización)
Se agregan contadores al perfil del usuario.

```typescript
interface UserStats {
  matchesPlayed: number;
  matchesWon?: number;
  matchesLost?: number;
  matchesDrawn?: number;
  
  // Nuevos campos (Internos/Admin only)
  lateArrivals: number;    // Cantidad de llegadas tarde
  noShows: number;         // Cantidad de inasistencias sin cancelar
  commitmentScore?: number; // Métrica calculada (0-100) - "Compromiso"
}

// Cálculo de Commitment Score (computado en display, no almacenado)
// Fórmula: Math.max(0, Math.min(99, 99 - noShows×20 - lateArrivals×6 + played))
//
// Desglose:
//   Base:              99 puntos
//   No-Show:          -20 puntos (no suma recuperación)
//   Late Arrival:      -6 puntos netos (-5 penalización + no aporta +1 de recuperación)
//   Presente a tiempo: +1 punto de recuperación (solo partidos donde attended = "present")
//
// Nota: `played` ya excluye no-shows (el código no incrementa `played` para no-shows).
// El late arrival no aporta recuperación porque la fórmula usa `played` (que incluye
// late) y le resta lateArrivals, resultando en +0 de recuperación para lates.
//
// Ejemplos:
//   Nuevo jugador (0 partidos):           99
//   1 no-show, sin jugar más:             79
//   1 no-show + 20 presentes:             99 (recuperado)
//   Veterano 50 partidos, 1 no-show:      99 (colchón natural)
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo el **admin** puede marcar asistencia | Validación de rol en UI (`app/match/[id]`) |
| 2 | El estado por defecto es "Presente" | Si `attendance` es `undefined`, se asume presente |
| 3 | Marcar "No Show" penaliza severamente la confiabilidad | Peso alto en algoritmo de score |
| 4 | Marcar "Late" penaliza levemente | Peso bajo en algoritmo de score |
| 5 | El registro se guarda en el documento del partido (`matches/{id}`) | `updateDoc` en `players` array |
| 6 | Al cerrar el partido, se agregan estos contadores al perfil del usuario | `updatePlayerStats` en `lib/playerStats.ts` |
| 7 | Un "No Show" NO cuenta como partido jugado para stats de W/L/D | Lógica en `updatePlayerStats` |
| 8 | La card "Tu asistencia" se **oculta** en la vista del jugador si `match.teamsConfirmed === true` (equipos ya definidos) | Guard `!match.teamsConfirmed` en `app/join/[id]/page.tsx` |

---

## 2. ARQUITECTURA

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Match Page  │ ───> │  Matches API │ ───> │  Match Doc   │
│ (Admin UI)   │      │(updateAttend)│      │ (Firestore)  │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                   │
                                            (Al Cerrar Partido)
                                                   ▼
                                            ┌──────────────┐
                                            │ User Profile │
                                            │ (Aggats)     │
                                            └──────────────┘
```

### Capas

#### Capa 1: Dominio (`lib/domain/attendance.ts` y `lib/domain/stats.ts`)
- Tipos: `AttendanceStatus`
- Constantes: `ATTENDANCE_LABELS`, `ATTENDANCE_ICONS`
- Lógica de Score: `calculateReliability(played, late, noShow)`

```typescript
export const ATTENDANCE_ICONS = {
  present: "✅",
  late: "⏰",
  no_show: "🚫"
};
```

#### Capa 2: API (`lib/matches.ts` & `lib/playerStats.ts`)
- `markPlayerAttendance(matchId, uid, status)`: Actualiza el array `players` en Firestore.
- `updatePlayerStats(...)`: Incrementa `lateArrivals` o `noShows`.

#### Capa 3: UI (`app/match/[id]/page.tsx` y `app/profile/page.tsx`)
- **Admin View**:
  - Control de asistencia completo (botones/dropdown).
- **Profile View**:
  - **NO MOSTRAR** contadores crudos (llegadas tarde, no shows).
  - **MOSTRAR SOLO** "Nivel de Compromiso" de forma creativa:
    - Gráfico tipo velocímetro o barra de progreso.
    - Etiquetas: "Siempre en la cancha antes que el balón" (100), "Listo para el 11 titular" (80-99), "Llegando justo para el pitazo inicial" (50-79), "Con la roja por falta de compromiso" (<50).
    - Colores: Emerald, Lime, Amber, Red.

---

## 3. TRAZABILIDAD

### Regla #1: Solo admin
- UI: El control de asistencia solo se renderiza si `isAdmin(user)`.

### Regla #6: Persistencia en Stats
- Al ejecutar `closeMatch`, iterar jugadores:
  - Si `attendance === 'late'`, `lateArrivals++`
  - Si `attendance === 'no_show'`, `noShows++`
  - Si `attendance === 'present'`, `matchesPlayed++` (y lógica de W/L)

---

## 4. CRITERIOS DE ACEPTACIÓN

1. **Given** un admin en un partido
   **When** selecciona a un jugador
   **Then** puede marcarlo como "Llegada Tarde" o "No Show".

2. **Given** un jugador marcado como "No Show"
   **When** se cierra el partido
   **Then** su contador de `noShows` incrementa en 1 en su perfil y NO se le suma partido jugado.

3. **Given** un jugador con historial de faltas
   **When** veo su perfil
   **Then** veo métricas de asistencia (ej: "Llegadas tarde: 3") y score de confiabilidad.
