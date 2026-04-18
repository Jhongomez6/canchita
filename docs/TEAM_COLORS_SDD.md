# Feature: Cambio de Color de Equipos A y B

## 📋 Specification-Driven Development (SDD)

Permite al admin elegir el color de identificación de cada equipo (A y B) desde la pestaña de equipos, reemplazando los colores hardcodeados rojo/azul actuales.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Actualmente los colores de los equipos están hardcodeados en `TeamColumn.tsx` (rojo para A, azul para B). El admin necesita poder personalizarlos para reflejar los colores reales de las camisetas o simplemente distinguir mejor los equipos en la pantalla.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Solo el admin del partido puede cambiar los colores | El selector solo aparece en la vista admin (`/match/[id]`) |
| 2 | Los colores se eligen de una paleta fija de 8 opciones | No hay color picker libre — previene colores ilegibles o inaccesibles |
| 3 | Los dos equipos no pueden tener el mismo color | El color elegido para A se deshabilita en el selector de B y viceversa |
| 4 | El cambio se guarda inmediatamente al seleccionar (sin botón "Guardar") | Feedback inmediato, sin pasos adicionales |
| 5 | Si no hay colores definidos, el default es rojo (A) y azul (B) | Retrocompatibilidad con partidos existentes |
| 6 | Los colores son visibles para todos los jugadores en `/join/[id]` | Los jugadores ven los mismos colores que eligió el admin |

### Paleta de colores disponibles
| Clave | Label | Color principal |
|-------|-------|----------------|
| `red` | Rojo | `#ef4444` |
| `blue` | Azul | `#3b82f6` |
| `green` | Verde | `#22c55e` |
| `orange` | Naranja | `#f97316` |
| `purple` | Morado | `#a855f7` |
| `yellow` | Amarillo | `#eab308` |
| `pink` | Rosa | `#ec4899` |
| `slate` | Gris | `#64748b` |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Campo adicional de 2 strings en el documento `matches` — impacto en tamaño del documento: negligible (~20 bytes)
- Sin índices adicionales necesarios

### Índices Firestore requeridos
- Ninguno — la query de partidos no filtra por color de equipo

### Paginación
- No aplica

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Ninguna** — cambiar los colores es una escritura exclusiva del admin, sin estado compartido que pueda colisionar

### Race conditions identificadas
- Ninguna relevante. En el caso extremo de dos admins en el mismo partido, el último en guardar gana (last-write-wins), que es el comportamiento aceptable para una preferencia visual.

---

## 4. SEGURIDAD

### Autenticación y autorización
- **Leer** colores: cualquier usuario autenticado (ya permitido por la regla `allow get` existente)
- **Escribir** colores: solo admin del partido (ya cubierto por la regla `isAdmin()` existente en `firestore.rules`)

### Firestore Rules requeridas
No se necesitan cambios en `firestore.rules`. La regla de update existente ya permite a admins modificar cualquier campo del documento `matches`:
```
// Regla existente — ya cubre teamColors:
allow update: if request.auth != null && isAdmin();
```

### Validaciones de input
- El color recibido debe ser una de las 8 claves válidas de la paleta (`red`, `blue`, `green`, `orange`, `purple`, `yellow`, `pink`, `slate`)
- Validación client-side únicamente (el campo es cosmético, no afecta lógica de negocio)
- No exponer colores en queries públicas: el campo `teamColors` es parte del documento `matches` que ya es público para usuarios autenticados — no hay datos sensibles

### Datos sensibles
- Ninguno — es metadata visual

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Firestore offline al guardar | Pérdida de conexión | Toast de error, el color vuelve al valor anterior en la UI (optimistic update revertido) |
| Partido sin `teamColors` en Firestore | Partido existente antes de la feature | Default automático: `{ A: "red", B: "blue" }` |
| Color inválido en Firestore (corrupción) | Bug o escritura directa | Default automático al renderizar |

### Retry strategy
- Sin retry automático — el admin puede volver a seleccionar el color si falla

### Degradación elegante
- Si `teamColors` no existe en el documento, todos los componentes usan los defaults rojo/azul sin error visible

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Admin abre `/match/[id]` → pestaña "Equipos"
2. Ve los dos columnas de equipos con un pequeño selector de color debajo del título de cada equipo
3. Toca un círculo de color → el equipo cambia de color inmediatamente (optimistic update)
4. Se guarda en Firestore en background
5. Los jugadores en `/join/[id]` ven el nuevo color en su próxima carga o en tiempo real si tienen el partido abierto

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando | Los colores actuales se mantienen (no hay loader específico para esto) |
| Guardando | El selector muestra un micro-spinner en el color seleccionado |
| Error | Toast "No se pudo cambiar el color" + revierte al color anterior |
| Éxito | El equipo cambia de color sin toast (el cambio visual es el feedback) |

### Consideraciones mobile-first
- Los círculos de color deben ser mínimo 32×32px para touch targets adecuados
- El selector se posiciona debajo del título del equipo en `TeamColumn`, sin expandir la altura del card
- En mobile los dos columns están lado a lado — el selector no debe empujar el layout

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- `TeamColorPicker` → selector de paleta inline; recibe `value`, `disabledColor` (el del otro equipo), `onChange`; se renderiza dentro de `TeamColumn`

### Dónde se integra
- **Admin** (`/match/[id]`): `TeamColumn.tsx` recibe `teamColors` y `onColorChange` como props; muestra `TeamColorPicker` cuando `isOwner === true`
- **Jugadores** (`/join/[id]`): lee `match.teamColors` y aplica los colores — sin selector

### Animaciones (Framer Motion)
- Transición de color en el card del equipo: `transition` CSS de 200ms en `background-color` y `border-color` (sin Framer Motion — es CSS puro, más performante para cambio de color)
- El círculo seleccionado en el picker muestra un `ring-2 ring-offset-1` como indicador de selección activa

### Diseño del `TeamColorPicker`
```
[●][●][●][●][●][●][●][●]   ← 8 círculos de 28px, gap-1.5, flex-wrap
```
- Círculo seleccionado: `ring-2 ring-offset-1 ring-slate-400 scale-110`
- Círculo deshabilitado (color del otro equipo): `opacity-30 cursor-not-allowed`
- El picker solo es visible para el admin — en la vista de jugadores no aparece

### Mapa de estilos Tailwind por color
Para evitar purging de clases dinámicas, todas las clases se declaran en un objeto config estático en `lib/domain/team-colors.ts`:

```typescript
export type TeamColor = "red" | "blue" | "green" | "orange" | "purple" | "yellow" | "pink" | "slate";

export const TEAM_COLOR_CONFIG: Record<TeamColor, {
  label: string;
  hex: string;
  bg: string;        // fondo del card (ej. "bg-red-50")
  border: string;    // borde del card
  text: string;      // texto del título
  subtext: string;   // texto secundario
  shieldFill: string; // color fill del icono Shield (hex)
  shieldText: string; // clase text del icono Shield
  dot: string;       // clase del punto en join page
}> = {
  red:    { label: "Rojo",    hex: "#ef4444", bg: "bg-red-50",    border: "border-red-100",    text: "text-red-800",    subtext: "text-red-600",    shieldFill: "#ef4444", shieldText: "text-red-500",    dot: "bg-red-500"    },
  blue:   { label: "Azul",    hex: "#3b82f6", bg: "bg-blue-50",   border: "border-blue-100",   text: "text-blue-800",   subtext: "text-blue-600",   shieldFill: "#3b82f6", shieldText: "text-blue-500",   dot: "bg-blue-500"   },
  green:  { label: "Verde",   hex: "#22c55e", bg: "bg-green-50",  border: "border-green-100",  text: "text-green-800",  subtext: "text-green-600",  shieldFill: "#22c55e", shieldText: "text-green-500",  dot: "bg-green-500"  },
  orange: { label: "Naranja", hex: "#f97316", bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-800", subtext: "text-orange-600", shieldFill: "#f97316", shieldText: "text-orange-500", dot: "bg-orange-500" },
  purple: { label: "Morado",  hex: "#a855f7", bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-800", subtext: "text-purple-600", shieldFill: "#a855f7", shieldText: "text-purple-500", dot: "bg-purple-500" },
  yellow: { label: "Amarillo",hex: "#eab308", bg: "bg-yellow-50", border: "border-yellow-100", text: "text-yellow-800", subtext: "text-yellow-600", shieldFill: "#eab308", shieldText: "text-yellow-500", dot: "bg-yellow-500" },
  pink:   { label: "Rosa",    hex: "#ec4899", bg: "bg-pink-50",   border: "border-pink-100",   text: "text-pink-800",   subtext: "text-pink-600",   shieldFill: "#ec4899", shieldText: "text-pink-500",   dot: "bg-pink-500"   },
  slate:  { label: "Gris",    hex: "#64748b", bg: "bg-slate-100", border: "border-slate-200",  text: "text-slate-800",  subtext: "text-slate-600",  shieldFill: "#64748b", shieldText: "text-slate-500",  dot: "bg-slate-500"  },
};

export const DEFAULT_TEAM_COLORS = { A: "red" as TeamColor, B: "blue" as TeamColor };
```

### Responsive
- Mobile: los 8 círculos en una fila horizontal dentro de cada columna de equipo
- Desktop (md+): igual — 8 círculos caben sin wrap en cualquier tamaño razonable

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `team_color_changed` | Admin cambia el color de un equipo | `match_id`, `team` ("A" \| "B"), `color` (ej. "green") |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// Adición a lib/domain/match.ts → interface Match
teamColors?: { A: TeamColor; B: TeamColor };
```

Firestore almacena:
```json
{
  "teamColors": { "A": "green", "B": "orange" }
}
```

### Capa de dominio (`lib/domain/`)
- **Nuevo archivo**: `lib/domain/team-colors.ts`
  - `type TeamColor` — union type con las 8 claves
  - `TEAM_COLOR_CONFIG` — mapa de clave → clases Tailwind + hex
  - `DEFAULT_TEAM_COLORS` — `{ A: "red", B: "blue" }`
  - `getTeamColors(match: Match): { A: TeamColor; B: TeamColor }` — devuelve `match.teamColors ?? DEFAULT_TEAM_COLORS`

### Capa de API (`lib/`)
- **`lib/matches.ts`** — nueva función:
```typescript
export async function updateTeamColors(
  matchId: string,
  colors: { A: TeamColor; B: TeamColor }
): Promise<void>
```
Usa `updateDoc` directo (no transaction — no hay race condition relevante).

### Componentes UI

**Nuevo:**
- `app/match/[id]/components/TeamColorPicker.tsx` — selector de paleta inline

**Modificados:**
- `lib/domain/match.ts` → agregar `teamColors?` a `Match`
- `lib/domain/team-colors.ts` → nuevo archivo de dominio
- `lib/matches.ts` → agregar `updateTeamColors()`
- `lib/analytics.ts` → agregar `logTeamColorChanged()`
- `app/match/[id]/components/TeamColumn.tsx` → recibir `colorKey: TeamColor` + `isOwner` + `onColorChange`; usar config en lugar de hardcode; renderizar `TeamColorPicker` si `isOwner`
- `app/match/[id]/components/TeamsTab.tsx` → pasar `teamColors` y `onColorChange` a cada `TeamColumn`
- `app/match/[id]/page.tsx` → leer `match.teamColors`, manejar `updateTeamColors()`, pasar a `TeamsTab`
- `app/join/[id]/page.tsx` → leer `match.teamColors` y aplicar colores dinámicos en las secciones de equipos

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] El admin ve un selector de 8 colores debajo del título de cada equipo en la pestaña Equipos
- [ ] Al seleccionar un color, el card del equipo cambia de color inmediatamente (optimistic update)
- [ ] El color del equipo A no puede ser igual al del equipo B (el color del otro equipo aparece deshabilitado)
- [ ] El cambio se persiste en Firestore y los jugadores en `/join/[id]` ven el nuevo color
- [ ] Partidos sin `teamColors` muestran los colores default rojo/azul sin error
- [ ] El selector no es visible para jugadores (solo admin)
- [ ] El evento `team_color_changed` se registra en analytics

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/match.ts` | Agregar `teamColors?: { A: TeamColor; B: TeamColor }` a `Match` |
| `lib/domain/team-colors.ts` | **Nuevo** — `TeamColor`, `TEAM_COLOR_CONFIG`, `DEFAULT_TEAM_COLORS`, `getTeamColors()` |
| `lib/matches.ts` | Agregar `updateTeamColors()` |
| `lib/analytics.ts` | Agregar `logTeamColorChanged()` |
| `app/match/[id]/components/TeamColorPicker.tsx` | **Nuevo** — selector de paleta inline |
| `app/match/[id]/components/TeamColumn.tsx` | Recibir `colorKey` + `isOwner` + `onColorChange`; reemplazar hardcode por config |
| `app/match/[id]/components/TeamsTab.tsx` | Pasar `teamColors` y handler a `TeamColumn` |
| `app/match/[id]/page.tsx` | Leer `teamColors`, manejar `updateTeamColors()`, pasar a `TeamsTab` |
| `app/join/[id]/page.tsx` | Leer `match.teamColors`, aplicar colores dinámicos |
| `firestore.rules` | Sin cambios (regla `isAdmin()` ya cubre el nuevo campo) |

---

## ⚠️ Decisiones de Diseño Clave

1. **Paleta fija vs. color picker libre**: Se eligió paleta fija de 8 colores para garantizar legibilidad y consistencia visual. Un color picker libre podría generar colores con bajo contraste sobre fondos blancos o texto ilegible. ¿Estás de acuerdo con esta restricción?

2. **Guardado inmediato vs. botón "Guardar"**: El cambio de color se persiste en Firestore al instante (sin confirmación). Esto da feedback visual inmediato pero implica escrituras frecuentes si el admin "prueba" varios colores seguidos. ¿O preferís un botón "Guardar colores" explícito?

3. **Optimistic update**: La UI cambia el color de forma inmediata y revierte si Firestore falla. Esto da una experiencia fluida pero requiere manejar el estado local del color en el componente. ¿Aceptable?

4. **Visibilidad del selector**: El `TeamColorPicker` solo aparece en la vista admin (`/match/[id]`). Los jugadores en `/join/[id]` ven los colores pero no pueden cambiarlos. ¿Correcto?

5. **Tailwind y clases dinámicas**: Para evitar que Tailwind purgue las clases de colores dinámicas, todas las clases se declaran estáticamente en el objeto `TEAM_COLOR_CONFIG` en `lib/domain/team-colors.ts`. Esto es un patrón estándar en proyectos con Tailwind — no requiere configuración de safelist. ¿Entendido?
