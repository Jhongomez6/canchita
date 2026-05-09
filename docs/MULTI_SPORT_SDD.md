# Feature: Soporte Multi-Deporte por Sede

## 📋 Specification-Driven Development (SDD)

Permite que cada sede configure sus propios formatos de juego con deporte y número de jugadores, reemplazando el union type hardcodeado `CourtFormat` (`"5v5" | ... | "11v11"`) por un modelo extensible basado en objetos `VenueFormat` por sede.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Actualmente `CourtFormat` es un enum de fútbol: `"5v5" | "6v6" | "7v7" | "8v8" | "9v9" | "10v10" | "11v11"`. Una sede con canchas de volley, basket, tenis o pádel no puede configurar sus formatos correctamente ni cobrar precios diferenciados por deporte. Esta feature generaliza el modelo para soportar cualquier deporte sin romper sedes ni bookings existentes.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Cada sede tiene su propio catálogo de formatos (`VenueFormat[]`) | Admin ve solo los formatos de su sede |
| 2 | Un `Court.baseFormat` apunta a un `VenueFormat.id` de su sede | `CourtConfigEditor` muestra `VenueFormat.label` en lugar del string `"5v5"` |
| 3 | Un `CourtCombo.resultingFormat` apunta a un `VenueFormat.id` de su sede | Idem |
| 4 | Los slots de `DaySchedule` tienen `FormatPricing.format` apuntando a un `VenueFormat.id` | `ScheduleEditor` ofrece los formatos propios de la sede |
| 5 | Un `Booking.format` guarda el `VenueFormat.id` (string, backward compat con valores viejos tipo `"5v5"`) | `BookingDetailCard` y `formatLabel()` adaptan la presentación |
| 6 | Si una sede no tiene `formats` configurados, se asume el comportamiento football-only legacy | No rompe sedes existentes |
| 7 | Los formatos de fútbol legacy (`"5v5"` … `"11v11"`) se siguen mostrando con sus labels actuales en bookings históricos | `formatLabel()` mantiene su lógica actual como fallback |
| 8 | El jugador ve el label `VenueFormat.label` (ej. "Fútbol 5", "Volley 6v6") en lugar de "Cancha sencilla/doble/triple" cuando la sede tiene formatos multi-deporte | Actualizar `FormatSelector` y `BookingDetailCard` |
| 9 | Sedes con un solo deporte (fútbol) siguen funcionando igual; el admin no necesita configurar `VenueFormat` si no quiere | Migración transparente |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Sedes activas: < 100 en el corto plazo
- Formatos por sede: 2–10 típicamente (ej. Fútbol 5, Fútbol 7, Volley)
- Bookings históricos: miles, con `format: "5v5"` hardcodeado — deben seguir leyéndose

### Modelo de almacenamiento: array embebido en `Venue` (decisión justificada en sección 9 y en "Decisiones de Diseño Clave")

`Venue.formats: VenueFormat[]` — máximo ~10 items por doc. Sin queries propias, sin índices extra. Se lee en el mismo `getVenue()` que ya se hace en la apertura de cualquier página.

### Índices Firestore requeridos
Ninguno nuevo. `VenueFormat` vive embebido en el doc `venues/{id}`. Las queries existentes sobre `courts`, `court_combos` y `schedules` no cambian su estructura de índices.

### Paginación
No aplica para `VenueFormat[]` (bounded collection, < 10 items).

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- Guardar `Venue.formats` junto con canchas o combos que referencian esos `VenueFormat.id`s en la misma operación de escritura. Actualmente `saveVenueCourts` usa `writeBatch`, y `updateVenueSettings` usa `updateDoc`. Al agregar `formats`, se debe coordinar:
  - `updateVenueSettings` acepta `formats?: VenueFormat[]` como campo adicional.
  - Si se borran formatos que todavía referencian courts/combos activos, la validación debe ocurrir en la misma transacción o batch.

### Race conditions identificadas
| Escenario | Mitigación |
|-----------|-----------|
| Admin A edita formatos mientras Admin B configura canchas que usan esos formatos | La carga de `venue` es reactiva via `subscribeToVenue()` — Admin B verá el catálogo actualizado antes de guardar. La validación final de referencia se hace en `saveVenueCourts` (batch) chequeando que todos los `baseFormat` existan en `venue.formats` activo |
| Booking creado con `VenueFormat.id` que el admin luego borra del catálogo | El booking guarda snapshot del `id` como string. Si el formato se elimina, el booking histórico sigue mostrando el label via fallback (ver Sección 5). Los nuevos bookings no pueden usar ese formato (ya no aparece en el selector) |

---

## 4. SEGURIDAD

### Autenticación y autorización
- `Venue.formats` es parte del doc `venues/{id}` — las rules existentes aplican directamente.
- Solo el super admin (`isSuperAdmin`) o location admin de esa sede (`isLocationAdmin`) pueden modificar `formats`.
- Jugadores solo leen `formats` para el selector de booking.

### Firestore Rules requeridas
No se requieren nuevas reglas. Las rules existentes de `venues/{venueId}` ya controlan quién puede leer/escribir el doc completo. Si hay reglas por campo (`request.resource.data.keys()`), agregar `formats` a la whitelist de campos editables por admins.

```
// Ejemplo si se usa validación por campo:
allow update: if isAdmin(request.auth.uid, venueId) &&
              request.resource.data.keys().hasOnly([..., 'formats', 'updatedAt']);
```

### Validaciones de input (capa dominio `lib/domain/venue.ts`)
- `VenueFormat.id`: string, non-empty, único dentro del array de la sede, sin espacios (slug-like)
- `VenueFormat.sport`: debe ser uno de los valores de `SportType`
- `VenueFormat.label`: string, 2–50 chars, requerido
- `VenueFormat.playersPerTeam`: number, 1–20
- Al guardar courts: cada `Court.baseFormat` debe existir en `venue.formats` (o ser un valor legacy `CourtFormat` si la sede no tiene `formats`)
- Al guardar combos: idem para `CourtCombo.resultingFormat`
- Al guardar schedules: cada `FormatPricing.format` debe existir en `venue.formats` o ser un valor legacy

### Datos sensibles
Ninguno. `VenueFormat` no contiene PII.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `venue.formats` es `undefined` o `[]` | Sede legacy sin migrar, o nueva sede antes de configurar | Funciona en modo football-only: usa `COURT_FORMATS` hardcodeados como antes. `FormatSelector` muestra "Cancha sencilla/doble/triple" |
| `Booking.format` no se encuentra en `venue.formats` | Booking histórico con `"5v5"`, o formato eliminado | `formatLabel()` usa el fallback legacy para strings `XvX`, o muestra el `id` crudo si no matchea ningún patrón |
| `Court.baseFormat` apunta a un `VenueFormat.id` que ya no existe | Admin eliminó un formato que tenía canchas asociadas | En `CourtConfigEditor`, la cancha muestra el `id` en rojo con warning "Formato no encontrado". Impide guardar sin resolver |
| `FormatPricing.format` en schedule apunta a `VenueFormat.id` inexistente | Idem | `ScheduleEditor` marca el pricing en rojo. `formatLabel()` muestra el id crudo |

### Retry strategy
- Lectura de `venue.formats`: mismo flujo que `getVenue()` — un toast de error y retry manual.
- Escritura de `formats` via `updateVenueSettings`: retry automático en caso de Firestore offline; muestra toast de error si falla.

### Degradación elegante
Si `venue.formats` no carga, el booking flow funciona en modo legacy (football-only). El jugador puede reservar con los formatos extraídos del schedule (que siguen siendo strings, pueden ser valores legacy o `VenueFormat.id`s).

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal admin — configurar formatos de la sede
1. Admin entra a `/venues/admin/[id]` → tab "Canchas"
2. Nuevo sub-sección "Deportes y formatos" antes de "Canchas físicas"
3. Admin selecciona deporte (ej. "Voleibol") → ingresa label (ej. "Volley 6v6") y jugadores por equipo (6)
4. Sistema genera `id` automático: `volleyball_6v6` → Admin puede editarlo
5. Admin agrega cuantos formatos necesite → guarda (llama `updateVenueSettings({ formats: [...] })`)
6. Al configurar canchas: el select de `baseFormat` muestra los labels de `VenueFormat` de la sede (no los strings hardcodeados)
7. Al configurar horarios: `ScheduleEditor` muestra los formatos propios de la sede para asignar precios

### Flujo jugador — reservar en sede multi-deporte
1. Jugador abre `/venues/[id]`
2. `FormatSelector` muestra los `VenueFormat.label` disponibles (ej. "Fútbol 5", "Fútbol 7", "Volley 6v6")
3. Jugador selecciona formato → ve slots disponibles → reserva normalmente
4. En la confirmación y detalle, se muestra el `VenueFormat.label` en lugar de "Cancha sencilla"

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando formatos | Skeleton de la sección "Deportes y formatos" (3 filas) |
| Sin formatos configurados | Empty state: "Sin formatos configurados. Agrega al menos uno para habilitar reservas." con CTA |
| Error al guardar | Toast "Error al guardar los formatos" + opción de retry |
| Éxito | Toast "Formatos guardados" |
| Sede legacy (sin `formats`) | Todo funciona igual que antes (football-only), sin estado de error |

### Consideraciones mobile-first
- El selector de deporte usa chips horizontales con scroll (no un `<select>`) para touch-friendly
- El input de `label` y `playersPerTeam` tienen `text-base` (min 16px) para prevenir zoom en iOS
- Botón "Agregar formato" tiene touch target mínimo 44px
- Lista de formatos configurados: swipe-to-delete en mobile (o botón trash)
- `pb-24 md:pb-0` en el contenedor del tab "Canchas"

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

- `VenueFormatEditor` (`components/booking/VenueFormatEditor.tsx`) — gestor de formatos por sede. Similar en estructura a `CourtConfigEditor`. Recibe `formats: VenueFormat[]` y `onFormatsChange`. Se inserta en el tab "Canchas" de `/venues/admin/[id]/page.tsx` antes de `CourtConfigEditor`.

- `SportBadge` (`components/booking/SportBadge.tsx`) — chip visual por deporte con ícono y color. Reutilizable en `FormatSelector` y en `VenueFormatEditor`. Deportes → colores/íconos:
  - `football` → verde / ⚽
  - `volleyball` → amarillo / 🏐
  - `basketball` → naranja / 🏀
  - `tennis` → verde lima / 🎾
  - `padel` → azul / 🏸
  - `other` → gris / 🎯

### Cambios en componentes existentes

- `CourtConfigEditor` — el `<select>` de formato pasa de iterar `COURT_FORMATS` a iterar `VenueFormat[]` de la sede. Props: agrega `venueFormats: VenueFormat[]`.
- `ScheduleEditor` — el selector de formatos en el slot builder pasa de `COURT_FORMATS` a `venueFormats`. Props: agrega `venueFormats: VenueFormat[]`.
- `FormatSelector` — el tipo de `format` en `FormatOption` se generaliza a `string` (era `CourtFormat`). El `label` lo provee quien construye el array (via `VenueFormat.label` o `formatLabel()` fallback). Esto requiere cambio mínimo en la interfaz interna.
- `formatLabel(format: string): string` en `lib/domain/venue.ts` — extender para manejar tanto strings legacy (`"5v5"`) como `VenueFormat.id`s opacos. Cuando no matchea el patrón `XvX`, devuelve el string tal cual (muestra el id) como última instancia.

### Animaciones (Framer Motion)
- `AnimatePresence` en `VenueFormatEditor` para entrada/salida de items de formato (igual que los otros editors del proyecto)
- Transición `layout` en la lista de formatos para reordenamiento visual al agregar/eliminar

### Responsive
- Mobile: `VenueFormatEditor` en stack vertical, chips de deporte en fila scrolleable
- Desktop (md+): la fila de deporte + inputs en una sola línea horizontal

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_format_added` | Admin agrega un `VenueFormat` | `venue_id`, `sport`, `format_id`, `players_per_team` |
| `venue_format_removed` | Admin elimina un `VenueFormat` | `venue_id`, `sport`, `format_id` |
| `booking_format_selected` | (ya existe) Jugador selecciona formato | `venue_id`, `format` — ahora `format` puede ser un `VenueFormat.id` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/venue.ts — tipos nuevos

export type SportType =
    | "football"
    | "volleyball"
    | "basketball"
    | "tennis"
    | "padel"
    | "other";

export const SPORT_LABELS: Record<SportType, string> = {
    football: "Fútbol",
    volleyball: "Voleibol",
    basketball: "Baloncesto",
    tennis: "Tenis",
    padel: "Pádel",
    other: "Otro",
};

export const SPORT_TYPES: SportType[] = [
    "football", "volleyball", "basketball", "tennis", "padel", "other",
];

export interface VenueFormat {
    id: string;             // slug único por sede, ej. "football_5v5", "volleyball_6v6"
    sport: SportType;
    label: string;          // label visible, ej. "Fútbol 5", "Volley 6v6"
    playersPerTeam: number; // jugadores por equipo (1–20)
}

// Venue — agregar campo opcional:
export interface Venue {
    // ... (campos existentes sin cambios)
    formats?: VenueFormat[];  // catálogo de formatos de la sede (undefined = legacy football-only)
}

// Court — baseFormat ahora es string para backward compat:
export interface Court {
    id: string;
    name: string;
    baseFormat: string;     // era CourtFormat. Ahora: VenueFormat.id O legacy CourtFormat string
    active: boolean;
    sortOrder: number;
}

// CourtCombo — idem:
export interface CourtCombo {
    id: string;
    name: string;
    courtIds: string[];
    resultingFormat: string; // era CourtFormat. Ahora: VenueFormat.id O legacy CourtFormat string
    active: boolean;
}

// FormatPricing — idem:
export interface FormatPricing {
    format: string;          // era CourtFormat. Ahora: VenueFormat.id O legacy CourtFormat string
    priceCOP: number;
}

// Booking — format ya es string compatible:
export interface Booking {
    // ...
    format: string;          // era CourtFormat. Backward compat: puede ser "5v5" o "volleyball_6v6"
}

// CreateBookingInput — idem:
export interface CreateBookingInput {
    venueId: string;
    format: string;          // era CourtFormat
    date: string;
    startTime: string;
    endTime: string;
}
```

> **Nota de migración de tipos**: `CourtFormat` se mantiene en `lib/domain/venue.ts` para backward compat en helpers legacy (`formatLabel`, `COURT_FORMATS`, `getAvailableFormats`). Se depreca gradualmente.

### Capa de dominio (`lib/domain/`)

**`lib/domain/venue.ts`** — cambios:

```typescript
// Helper actualizado — soporta VenueFormat.id y CourtFormat legacy
export function formatLabel(format: string, venueFormats?: VenueFormat[]): string {
    // 1. Buscar en venueFormats de la sede
    if (venueFormats) {
        const vf = venueFormats.find((f) => f.id === format);
        if (vf) return vf.label;
    }
    // 2. Fallback legacy para strings "XvX"
    const match = format.match(/^(\d+)v\d+$/);
    if (match) {
        const perTeam = parseInt(match[1], 10);
        if (perTeam <= 6) return "Cancha sencilla";
        if (perTeam <= 9) return "Cancha doble";
        return "Cancha triple";
    }
    // 3. Último recurso: mostrar el id crudo
    return format;
}

// Helper nuevo — obtiene los formatos disponibles dado el catálogo de la sede
export function getAvailableVenueFormats(
    courts: Court[],
    combos: CourtCombo[],
    venueFormats: VenueFormat[],
): VenueFormat[] {
    const ids = new Set<string>();
    for (const court of courts) { if (court.active) ids.add(court.baseFormat); }
    for (const combo of combos) { if (combo.active) ids.add(combo.resultingFormat); }
    return venueFormats.filter((f) => ids.has(f.id));
}

// Validación nueva
export function validateVenueFormat(f: VenueFormat): void {
    if (!f.id || /\s/.test(f.id)) throw new ValidationError("El id del formato no puede tener espacios");
    if (!SPORT_TYPES.includes(f.sport)) throw new ValidationError("Deporte inválido");
    if (!f.label || f.label.trim().length < 2 || f.label.length > 50)
        throw new ValidationError("El label debe tener entre 2 y 50 caracteres");
    if (!Number.isInteger(f.playersPerTeam) || f.playersPerTeam < 1 || f.playersPerTeam > 20)
        throw new ValidationError("Jugadores por equipo debe ser entre 1 y 20");
}

export function validateVenueFormats(formats: VenueFormat[]): void {
    const ids = new Set<string>();
    for (const f of formats) {
        validateVenueFormat(f);
        if (ids.has(f.id)) throw new ValidationError(`Id de formato duplicado: ${f.id}`);
        ids.add(f.id);
    }
}
```

**`lib/domain/court-allocation.ts`** — cambios mínimos:

`AllocationInput.requestedFormat` pasa de `CourtFormat` a `string`. El algoritmo no cambia: sigue comparando `court.baseFormat === requestedFormat` y `combo.resultingFormat === requestedFormat`. La comparación de strings funciona igual con `VenueFormat.id`.

```typescript
// Antes:
export interface AllocationInput {
    requestedFormat: CourtFormat;
    // ...
}

// Después:
export interface AllocationInput {
    requestedFormat: string;   // CourtFormat legacy O VenueFormat.id
    // ...
}
```

Las funciones `isFormatAvailable` y `getAvailableFormatsForSlot` en `court-allocation.ts` devuelven `string[]` en lugar de `CourtFormat[]`. Los callers se adaptan:
- `app/venues/[id]/page.tsx`: `selectedFormat` pasa de `CourtFormat | null` a `string | null`.
- `components/booking/AdminSlotPicker.tsx`: idem.

### Capa de API (`lib/venues.ts`)

`updateVenueSettings` acepta `formats?: VenueFormat[]` en su tipo de datos:

```typescript
export async function updateVenueSettings(
    venueId: string,
    data: Partial<Pick<Venue,
        "depositRequired" | "depositPercent" | "name" | "address" |
        "phone" | "description" | "active" | "imageURL" | "icon" | "formats"  // ← nuevo
    >>,
): Promise<void> { /* sin cambio en implementación */ }
```

No se requiere nueva función de API. `saveVenueCourts` y `saveVenueCombos` no cambian — reciben el array con los valores `string` actualizados.

### Componentes UI (`app/`)

| Componente / Página | Cambio |
|--------------------|--------|
| `app/venues/admin/[id]/page.tsx` | Carga `venue.formats` del doc. Pasa `venueFormats` a `CourtConfigEditor`, `ScheduleEditor`, `VenueFormatEditor`. Guarda formatos con `updateVenueSettings({ formats })`. |
| `app/venues/[id]/page.tsx` | `selectedFormat` cambia a `string | null`. El `formatOptions()` usa `getAvailableVenueFormats()` y construye `FormatOption[]` con `label: vf.label`. Fallback a `formatLabel()` legacy si la sede no tiene `formats`. |
| `components/booking/CourtConfigEditor.tsx` | Props + `venueFormats: VenueFormat[]`. El `<select>` de `baseFormat` itera `venueFormats` (muestra `vf.label`, value = `vf.id`). Si `venueFormats` está vacío, itera `COURT_FORMATS` legacy. |
| `components/booking/ScheduleEditor.tsx` | Props + `venueFormats: VenueFormat[]`. En el quick-setup y en el slot builder, el selector de formatos itera `venueFormats`. Fallback a `COURT_FORMATS` si vacío. |
| `components/booking/FormatSelector.tsx` | `FormatOption.format: string` (era `CourtFormat`). `onSelect: (format: string) => void`. Internamente ya es agnóstico al tipo — usa la prop `format` como key y value opaco. El caller ya construye el label. |
| `components/booking/BookingDetailCard.tsx` | `formatLabel(booking.format, venueFormats)` con el catálogo de la sede (si está disponible). Fallback automático. |
| `components/booking/AdminBookingCard.tsx` | Idem. |
| `components/booking/BookingConfirmSheet.tsx` | Recibe `formatLabel` como prop string pre-computado (ya lo hace así) o recibe `venueFormats` para computarlo. |
| `components/booking/AdminSlotPicker.tsx` | `selectedFormat: string | null`. El FormatSelector recibe el array de `FormatOption[]` construido desde `venueFormats`. |
| `lib/domain/manual-reservation-pricing.ts` | `calculateManualReservationPrice(schedule, format: string, ...)` — `format` ya era genérico (compara strings), sin cambio funcional. |

---

## 10. ESTRATEGIA DE MIGRACIÓN Y BACKWARD COMPATIBILITY

### Bookings históricos (`Booking.format = "5v5"`)
Los bookings históricos tienen `format: "5v5"` (u otro valor `CourtFormat`). Como `Booking.format` pasa a ser `string`, **no hay cambio de tipo en Firestore** — los valores existentes siguen siendo válidos. La presentación se resuelve con el fallback de `formatLabel()`:

1. Buscar el `format` en `venue.formats` → no encontrado (es un valor legacy `"5v5"`)
2. Detectar patrón `XvX` → devolver "Cancha sencilla/doble/triple" como antes

No se requiere migration script para bookings históricos.

### Sedes existentes (sin `Venue.formats`)
- `venue.formats` es `undefined` → toda la UI cae en modo **legacy football-only**
- `CourtConfigEditor` muestra `COURT_FORMATS` (`"5v5"…"11v11"`) como antes
- `ScheduleEditor` idem
- `FormatSelector` en booking flow idem
- El admin puede optar por no migrar nunca si opera solo fútbol

### Sedes que quieren migrar a multi-deporte
1. Admin entra a tab "Canchas" → sección "Deportes y formatos"
2. Agrega los formatos (ej. "Fútbol 5" → `football_5v5`, "Volley 6v6" → `volleyball_6v6`)
3. Sistema guarda `venue.formats` → a partir de ahora `CourtConfigEditor` y `ScheduleEditor` muestran los nuevos formatos
4. Admin re-configura las canchas existentes para apuntar a los nuevos `VenueFormat.id`s (los courts existentes con `baseFormat: "5v5"` muestran warning "Formato no encontrado" hasta que se actualicen)
5. Admin re-configura horarios para usar los nuevos `VenueFormat.id`s en los `FormatPricing`

**No hay migration script automático** en esta fase — la migración es opt-in y manual por parte del admin. Los datos viejos en courts/schedules que usan `"5v5"` siguen funcionando en modo legacy mientras la sede no tenga `formats` configurados.

### Período de coexistencia
Durante el período de coexistencia, algunos campos de la sede pueden tener valores mixtos (courts con `"5v5"`, otros con `"football_5v5"`). Esto se evita validando al guardar que todos los formatos referenciados existen en `venue.formats` **antes** de guardar. Si la sede no tiene `formats`, la validación acepta cualquier `CourtFormat` legacy.

---

## 11. CRITERIOS DE ACEPTACIÓN

- [ ] Una sede nueva puede configurar `VenueFormat[]` con deportes distintos (volley, basket, etc.) desde el tab "Canchas"
- [ ] `CourtConfigEditor` muestra los `VenueFormat.label` de la sede al asignar formato a una cancha
- [ ] `ScheduleEditor` muestra los `VenueFormat.label` de la sede al configurar precios por slot
- [ ] El booking flow (`/venues/[id]`) muestra los labels correctos del `VenueFormat` (ej. "Volley 6v6") en el `FormatSelector`
- [ ] Un booking histórico con `format: "5v5"` se sigue mostrando como "Cancha sencilla" en `BookingDetailCard`
- [ ] Una sede sin `formats` configurados funciona exactamente igual que antes (modo legacy)
- [ ] No se puede guardar una cancha con `baseFormat` que no exista en `venue.formats` (si la sede tiene formats configurados)
- [ ] No se puede guardar un `ScheduleSlot` con `FormatPricing.format` que no exista en `venue.formats` (si la sede tiene formats configurados)
- [ ] `court-allocation.ts` `allocateCourts()` sigue funcionando correctamente con `VenueFormat.id`s en lugar de `CourtFormat` strings
- [ ] `validateScheduleSlot()` en `lib/domain/venue.ts` acepta `VenueFormat.id`s cuando se le pasa el catálogo de la sede

---

## 12. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Agregar `SportType`, `VenueFormat`, `SPORT_LABELS`, `SPORT_TYPES`. Actualizar `Court.baseFormat`, `CourtCombo.resultingFormat`, `FormatPricing.format` a `string`. Agregar `formats?: VenueFormat[]` a `Venue`. Actualizar `formatLabel()`, `getAvailableFormats()`, `validateScheduleSlot()`. Agregar `getAvailableVenueFormats()`, `validateVenueFormat()`, `validateVenueFormats()`. Mantener `CourtFormat` como alias deprecado. |
| `lib/domain/court-allocation.ts` | `AllocationInput.requestedFormat: string`. Funciones que devuelven `CourtFormat[]` pasan a devolver `string[]`. |
| `lib/domain/booking.ts` | `Booking.format: string`, `CreateBookingInput.format: string`. |
| `lib/domain/manual-reservation-pricing.ts` | `format: string` (posiblemente ya compatible — verificar). |
| `lib/venues.ts` | `updateVenueSettings` acepta `formats?: VenueFormat[]`. |
| `app/venues/admin/[id]/page.tsx` | Carga/guarda `venue.formats`. Pasa `venueFormats` a editors. |
| `app/venues/[id]/page.tsx` | `selectedFormat: string | null`. Usa `getAvailableVenueFormats()`. |
| `components/booking/CourtConfigEditor.tsx` | Prop `venueFormats: VenueFormat[]`. Select de formato usa `venueFormats`. |
| `components/booking/ScheduleEditor.tsx` | Prop `venueFormats: VenueFormat[]`. Selector de formatos usa `venueFormats`. |
| `components/booking/FormatSelector.tsx` | `FormatOption.format: string`, `onSelect: (format: string) => void`. |
| `components/booking/AdminSlotPicker.tsx` | `selectedFormat: string | null`. Construye `FormatOption[]` desde `venueFormats`. |
| `components/booking/VenueFormatEditor.tsx` | **Nuevo**. Gestiona `VenueFormat[]` de la sede. |
| `components/booking/SportBadge.tsx` | **Nuevo**. Chip visual por deporte. |
| `components/booking/BookingDetailCard.tsx` | `formatLabel(format, venueFormats)` con catálogo. |
| `components/booking/AdminBookingCard.tsx` | Idem. |
| `components/booking/BookingConfirmSheet.tsx` | Recibir o computar el label correcto. |
| `app/bookings/[id]/page.tsx` | Cargar `venue.formats` al mostrar detalle de booking. |
| `firestore.rules` | Agregar `formats` a la whitelist de campos editables por admin si hay validación por campo. |

---

## ⚠️ Decisiones de Diseño Clave

### 1. `VenueFormat` embebido en `Venue` (no subcolección)

**Decisión**: `Venue.formats: VenueFormat[]` — array embebido en el doc principal.

**Pros**:
- Sin reads adicionales: `getVenue()` ya se llama en todo flujo de booking. `formats` llega gratis.
- Sin índices nuevos.
- Máximo ~10 formatos por sede — nunca excede el límite de 1MB del doc.
- Transacciones más simples: guardar formats + venue info en un solo `updateDoc`.

**Contras**:
- Si en el futuro se necesita queryear sedes por deporte (`where("formats.sport", "array-contains", "volleyball")`), Firestore no soporta queries sobre arrays de objetos por campo interno. Requeriría un campo desnormalizado (`sports: SportType[]`).
- Si una sede llegara a tener 100+ formatos (poco realista), el doc crecería.

**Mitigación del contrapunto**: agregar `Venue.sports: SportType[]` (array desnormalizado) cuando se requiera búsqueda por deporte en la página `/venues`. Por ahora no está en scope.

### 2. `CourtFormat` se depreca, no se elimina

**Decisión**: `CourtFormat` permanece en `lib/domain/venue.ts` como tipo alias para backward compat, y `COURT_FORMATS` se mantiene para el fallback legacy. No se hace un breaking change.

Los campos `Court.baseFormat`, `CourtCombo.resultingFormat`, `FormatPricing.format` y `Booking.format` pasan de `CourtFormat` a `string` en TypeScript — esto es una ampliación de tipo, no un cambio de contrato Firestore (Firestore ya los guarda como strings).

**Alternativa rechazada**: migrar todos los tipos a `string` inmediatamente y borrar `CourtFormat`. Riesgo: rompe TypeScript en todos los callers de una vez, y pierde la autocompletación para sedes football-only.

### 3. `formatLabel()` extiende en lugar de reemplazar

**Decisión**: `formatLabel(format: string, venueFormats?: VenueFormat[]): string` — signature backward-compatible. Los callers que no tienen `venueFormats` disponibles siguen funcionando como antes.

Esto evita actualizar todos los call sites a la vez. Se puede hacer de forma incremental: primero el booking flow del jugador, luego el admin.

### 4. Migración opt-in sin script automático

**Decisión**: Las sedes existentes no migran automáticamente. El admin de cada sede decide cuándo y si quiere configurar `VenueFormat[]`. Mientras no lo haga, la sede opera en modo legacy football-only sin degradación.

**Riesgo**: Dos sedes de fútbol que nunca configuren `formats` seguirán usando `CourtFormat` hardcodeado indefinidamente. Esto es aceptable — el objetivo es no romper lo que funciona.

**Alternativa rechazada**: script de migración que auto-crea `VenueFormat[]` a partir de los courts existentes. Descartada porque requiere leer y escribir en todas las sedes activas, con riesgo de corrupción si hay courts con múltiples formatos distintos.

### 5. El algoritmo `allocateCourts` no cambia su lógica

**Decisión**: `allocateCourts` en `lib/domain/court-allocation.ts` compara `court.baseFormat === requestedFormat` como strings. Al pasar de `CourtFormat` a `string`, la lógica es idéntica — solo cambia el tipo en TypeScript. No hay re-escritura del algoritmo.

Esto garantiza que el comportamiento de asignación "Smallest Fit First" sea exactamente el mismo para sedes de fútbol existentes, y funcione automáticamente para nuevos formatos multi-deporte sin cambio alguno en la lógica de dominio.
