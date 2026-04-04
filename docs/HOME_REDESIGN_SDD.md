# Feature: Rediseño de la Home + Página de Historial

## 📋 Specification-Driven Development (SDD)

Rediseño de la pantalla principal para mostrar al jugador su identidad, rachas y contexto del próximo partido de forma clara. Introduce la página `/history` con el historial completo de partidos cerrados y un nuevo tab en la navegación inferior.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Reemplazar el header genérico de saludo por una identidad de jugador con indicadores relevantes (nivel, COM, racha). Hacer que la acción principal del hero card sea contextual según si el jugador ya confirmó o no. Mostrar las últimas 5 partidas en la Home y redirigir al historial completo.

---

### 1.1 Estructura de la Home (post-rediseño)

```
┌────────────────────────────────┐
│  IdentityHeader (verde)        │  → link a /profile
│  Avatar + nombre + nivel + COM │
├────────────────────────────────┤
│  Admin Action Bar (solo admin) │  → Nuevo Partido, Ver Usuarios, Explorar
├────────────────────────────────┤
│  Hero Card — Próximo Partido   │  → CTA contextual
│    o Empty State               │
├────────────────────────────────┤
│  Push Prompt (solo con partido)│
├────────────────────────────────┤
│  QuickStats (solo jugadores,   │  → link a /profile#statistics
│  ≥3 partidos)                  │
├────────────────────────────────┤
│  Partidos Activos              │
├────────────────────────────────┤
│  Historial (últimas 5)         │  → link a /history
└────────────────────────────────┘
```

### 1.2 IdentityHeader (`components/home/IdentityHeader.tsx`)

| Campo | Fuente | Visible para |
|-------|--------|-------------|
| Avatar (foto o iniciales) | `profile.photoURL` | Todos |
| Nombre | `profile.name` | Todos |
| Badge "Admin" | `isAdmin(profile)` | Solo admins |
| Nivel (`⚡ Intermedio`) | `profile.level` | Solo jugadores |
| COM score + Heart icon | `calcCommitmentScore(profile.stats)` | Solo jugadores (si hay stats) |
| Contador partidos activos + sin confirmar | props | Solo admins |

El header entero es clickeable y navega a `/profile`.

### 1.3 Hero Card — Próximo Partido

**CTA contextual:**

| Situación | Texto del botón | Estilo |
|-----------|-----------------|--------|
| Jugador no confirmado | "Confirmar asistencia" | Verde (principal) |
| Jugador confirmado | "Ver detalles" | Gris (secundario) |
| Admin | "Ver detalles" | Gris (secundario) |

**Elementos adicionales:**

- Barra de capacidad (jugadores confirmados / maxPlayers)
- Chip de estado personal ("✓ Confirmado" / "Falta tu confirmación")
- Push prompt solo se muestra cuando hay `nextMatch` (contextual, no siempre)

**Empty State (sin partido próximo):**
- Icono Trophy slate
- "Último partido hace N días" (si existe historial)
- Botones: "Buscar partidos" → `/explore`, "Unirme con código" → prompt nativo

### 1.4 Admin Action Bar

Solo visible cuando `isAdmin(profile)`. Scrollable horizontal con snap:

| Botón | Destino | Visible para |
|-------|---------|-------------|
| "Nuevo Partido" | `/new-match` | Admins |
| "Ver Usuarios" | `/admin/users` | Super Admins únicamente |
| "Explorar" | `/explore` | Admins |

### 1.5 MatchCard — Indicador de Confirmación

`MatchCard` recibe el prop opcional `userConfirmed?: boolean`:
- Si `true`: círculo verde con check
- Si `false`: círculo ámbar con punto
- Si `undefined`: flecha derecha clásica (admin o sin contexto)

### 1.6 QuickStats (`components/home/QuickStats.tsx`)

- Solo para jugadores (no admins) con `profile.stats.played >= 3`
- Muestra `weeklyStreak` y `commitmentStreak`
- Animación de llama con Framer Motion cuando valor > 0
- Tooltip en hover con explicación
- Click navega a `/profile#statistics` (con múltiples intentos de scroll para asegurar que el elemento esté renderizado)

---

## 2. PÁGINA DE HISTORIAL (`app/history/page.tsx`)

### Objetivo

Mostrar **todos** los partidos cerrados del usuario con resultado, score y si fue MVP.

### Reglas de Negocio

| # | Regla | Detalle |
|---|-------|---------|
| 1 | Solo partidos con `status === "closed"` | Filtrado en cliente |
| 2 | Ordenados por fecha descendente | Más reciente arriba |
| 3 | Super admins ven todos los partidos | `getAllMatches()` en lugar de `getMyMatches()` |
| 4 | Admins normales ven solo sus partidos | `getMyMatches()` |
| 5 | Locations cargadas en batch de 30 | Evita límite de Firestore `in` operator |

### Componente HistoryRow (`components/home/HistoryRow.tsx`)

Cada fila muestra:

| Campo | Fuente | Condición |
|-------|--------|-----------|
| Fecha compacta (DÍA + número + mes) | `match.date` | Siempre |
| Nombre de cancha | `location.name` | Si existe location |
| Formato (Fútbol 5/7/11) | `match.maxPlayers / 2` | Siempre |
| Score `A-B` | `match.score` | Si existe score |
| Chip resultado (G/E/P) | `match.teams + match.score + userId` | Si jugador en equipo y hay score |
| Icono MVP (🏆) | `match.mvpVotes` | Si usuario ganó votación MVP |

**Lógica de resultado:**

```
isInTeamA → scoreA > scoreB = G, scoreA < scoreB = P, scoreA === scoreB = E
isInTeamB → inverso
```

**Lógica MVP:** Cuenta votos en `match.mvpVotes` (Record<string, string>), encuentra el máximo, retorna todos los UIDs con ese máximo (soporta empate de MVP).

---

## 3. BOTTOM NAV — TAB HISTORIAL

Tab "Historial" (`/history`) añadido para jugadores **no super-admins**:

- Ícono: flecha circular (history icon con SVG)
- Activo cuando `pathname === "/history"`
- No visible para super admins (que tienen tab "Ranking" en su lugar)

---

## 4. CRITERIOS DE ACEPTACIÓN

### ✅ Criterio 1: CTA contextual en hero card
**Given** un jugador inscrito en el próximo partido pero sin confirmar
**When** carga la Home
**Then** el botón dice "Confirmar asistencia" en verde

### ✅ Criterio 2: Admin ve su action bar
**Given** un usuario con rol admin
**When** carga la Home
**Then** ve el admin action bar con "Nuevo Partido" y sin QuickStats

### ✅ Criterio 3: QuickStats solo con ≥3 partidos
**Given** un jugador con 2 partidos jugados
**When** carga la Home
**Then** QuickStats no se renderiza

### ✅ Criterio 4: Historial completo paginado
**Given** un usuario con 13 partidos cerrados
**When** navega a `/history`
**Then** ve los 13 partidos con fecha, score, resultado y MVP si aplica

### ✅ Criterio 5: HistoryRow muestra MVP correctamente
**Given** un partido donde el usuario ganó la votación MVP
**When** se renderiza en /history o en la Home
**Then** aparece el ícono Trophy dorado

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| UI | `app/page.tsx` | Home rediseñada: orquestación de todos los nuevos componentes |
| UI | `app/history/page.tsx` | Historial completo de partidos cerrados |
| UI | `components/home/IdentityHeader.tsx` | Avatar + nombre + nivel + COM en header verde |
| UI | `components/home/QuickStats.tsx` | Rachas semanales y de compromiso con animación |
| UI | `components/home/HistoryRow.tsx` | Fila compacta de partido cerrado con resultado y MVP |
| UI | `components/MatchCard.tsx` | Prop `userConfirmed` para indicar estado de confirmación |
| UI | `components/BottomNav.tsx` | Tab "Historial" para jugadores no super-admin |
| UI | `components/skeletons/HomeSkeleton.tsx` | Skeleton actualizado para nueva estructura de Home |
| UI | `components/StatsCard.tsx` | Heart icon con color dinámico para COM score |
| Estilos | `app/globals.css` | `.no-scrollbar` para admin action bar horizontal |
