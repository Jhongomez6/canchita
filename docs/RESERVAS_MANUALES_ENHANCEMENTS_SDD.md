# Feature: Mejoras a Reservas Manuales

## 📋 Specification-Driven Development (SDD)

Convertir las reservas manuales (`BlockedSlot`) en una entidad operativa completa: estado de gestión (Pendiente → Confirmado → Jugado → Pagado), datos de contacto obligatorios, precio explícito, atajos de acción desde la card y renombrado de campo. El concepto pasa de "bloqueo de horario" a "registro completo de una reserva fuera del flujo público".

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Tras el rebrand `bloqueos → reservas manuales` (commit `076b722`), la entidad `BlockedSlot` quedó funcionando como un bloqueo de calendario con un campo de cliente opcional. Pero el location admin la está usando como su sistema de gestión de reservas reales (cliente que llamó, vino o pagó por fuera de la app), y le faltan los atributos básicos de una reserva: estado, contacto, precio, acciones rápidas. Esta feature cierra esa brecha.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Toda reserva manual tiene un `status: ManualReservationStatus`. Estados: `pending → confirmed → played → paid` (ruta lineal) + `no_show` y `free` como estados terminales paralelos. Reservas viejas sin status se leen como `pending`. | Badge de estado en cards |
| 2 | El status puede cambiar a **cualquier valor** (adelante o atrás). El happy path es avanzar por la ruta lineal vía el quick button; corregir errores o asignar estados terminales (`no_show`, `free`) se hace tapeando el badge para abrir un selector con todas las opciones. La transacción no enforza orden, solo que el doc exista. | Quick button "Avanzar" (solo ruta lineal) + badge tappable que abre popover con todos los estados |
| 3 | El campo `clientName` ahora es **obligatorio** al crear una reserva manual. Reservas viejas sin nombre quedan tal cual (no rompen). | El form valida; sin nombre, el botón "Reservar" queda deshabilitado |
| 4 | Nuevo campo `clientPhone: string` **opcional**. Si se ingresa, se valida con regex de 10 dígitos (mismo formato que `/onboarding/phone`). Si está vacío, se omite del documento. | Input opcional en el form, validación inline solo si tiene valor |
| 5 | Nuevo campo `priceCOP: number` (precio total de la reserva). Calculado automáticamente al crear desde el schedule del venue (precio del slot del formato más cercano × duración × cantidad de canchas seleccionadas) y **se persiste tal cual al crear** — **no editable** por el admin. Si no se puede calcular (ej. venue sin schedule para ese día/hora/formato), se persiste `0` y la card lo muestra como "—". | El form muestra el precio calculado en modo solo-lectura (display), no input |
| 6 | El label "Motivo" se cambia visualmente a "Información adicional" (label + placeholder + microcopy). El **campo en Firestore sigue siendo `reason`** — sin renombre de schema, sin nuevo campo, sin backward compat. | Solo cambio de copy en `BlockedSlotForm` y en cards |
| 7 | La card de detalle de una reserva manual (`AdminBlockCard`) muestra: badge de status, nombre cliente, teléfono cliente (o "Sin celular" si no hay), precio, información adicional (si hay), canchas. Además, el teléfono se muestra en la vista rápida de slots (`AdminSlotPicker`). | Layout actualizado |
| 8 | La card tiene un **quick button "Eliminar"** (ícono trash). Tap → abre el `DeleteBlockedSlotSheet` existente (con su flujo actual: motivo opcional, opciones de recurrencia si aplica). Es solo un atajo: evita que el admin tenga que tapear la card y luego buscar la opción de eliminar. | Botón visible siempre, mismo sheet de hoy |
| 9 | La card tiene un **quick button "Avanzar estado"** (etiqueta dinámica: "Confirmar" / "Marcar jugado" / "Marcar pagado"). Tap → cambio de estado optimista + escritura a Firestore. Si la reserva está en `paid`, el botón no aparece. | Botón visible salvo en `paid` |
| 10 | Las cards en `HourDetailDrawer` y en `AdminBookingCalendar` (vista por día) se renderizan con `AdminBlockCard`. Los quick buttons funcionan idénticos en ambas vistas. | Mismo componente, mismo comportamiento |
| 11 | Bug fix simple (1-3 líneas) → excepción del proyecto, no requiere SDD. _(Convención.)_ | — |

### No-objetivos (explícitos)
- No introducir un sistema de "pago en línea" para reservas manuales — `paid` es solo un marcador que pone el admin manualmente.
- No exponer el teléfono del cliente fuera del admin (no aparece en flujos públicos).
- No agregar status a `Booking` online (ya tienen su propio estado distinto).
- No renombrar el campo `reason` en Firestore — solo cambio visual de label.
- No permitir editar el precio de una reserva manual ya creada — si el cliente paga otra cosa, se reflejará en `paid` pero `priceCOP` queda como referencia del cálculo del schedule.
- No agregar histórico de cambios de status (audit log) — si después se necesita, se agrega.

### Adiciones post-implementación
| # | Adición | Descripción |
|---|---------|-------------|
| A1 | **Estados terminales `no_show` y `free`** | `no_show` ("No asistió") para clientes que no aparecieron; `free` ("Gratis") para cortesías. Ambos aparecen en el popover del badge pero NO en la ruta de avance lineal del quick button. Badge rojo para `no_show`, morado para `free`. |
| A2 | **Validación de canchas ocupadas en el form** | `BlockedSlotForm` recibe `occupiedCourtIds?: string[]`. Canchas ya ocupadas se muestran como chips tachados/deshabilitados. El admin no las puede seleccionar. |
| A3 | **CTA deshabilitado cuando todas las canchas están ocupadas** | En `HourDetailDrawer`, el botón "Crear reserva manual" queda disabled (gris, texto "Sin canchas disponibles") si todos los courts activos del venue están ocupados por bookings o blocks en ese horario. |
| A4 | **Botón "Crear reserva manual" en vista calendario** | `AdminBookingCalendar` expone prop `onCreateManual?: (date: string) => void`. Al seleccionar un día, aparece el botón debajo de las reservas. Abre el form con la fecha pre-llenada (sin hora ni canchas, el admin las elige). |
| A5 | **Fix de cálculo de precio para combos multi-cancha** | `BlockedSlotForm` ahora infiere el formato desde las canchas seleccionadas primero (`inferFormatFromCourts`) y solo usa `defaultFormat` como fallback. Si no hay combo exacto para las canchas seleccionadas, el precio es la suma de cada cancha individual (en lugar de usar el formato de la vista por hora). |
| A6 | **Label de tier para 4+ canchas** | `tierLabelFromCount` ahora devuelve "Múltiples canchas" para 4+ courts (antes quedaba en "Cancha triple"). |
| A7 | **Script de migración de precios** | `scripts/backfill-manual-reservation-prices.js` — recalcula `priceCOP` en docs existentes con el algoritmo corregido. Soporta `--dry-run`. |
| A8 | **Realtime subscription en `AdminBookingCalendar`** | Los blocks del calendario ahora usan `subscribeToBlockedSlots` (onSnapshot) en lugar de fetch one-shot, para que cambios de estado se reflejen automáticamente. |
| A9 | **Edición de campos de reserva manual** | Nuevo `EditManualReservationSheet` permite editar `clientName`, `clientPhone` y `reason` de una reserva existente. Un botón `Pencil` en el footer de `AdminBlockCard` abre el sheet. `hasChanges` guard deshabilita "Guardar" hasta que haya cambios reales. Al guardar, se cierra también el `HourDetailDrawer` para que el usuario vea la info fresca al reabrir (Firestore ya actualizó). `updateDoc` directo (sin transacción) ya que estos campos no son estado compartido. Se usa `deleteField()` cuando el usuario borra un campo — Firestore no acepta `undefined` en `updateDoc`. |
| A10 | **Campo `isMonthly` para reservas recurrentes** | Nuevo boolean `isMonthly` en `BlockedSlot`. Solo se persiste en Firestore si la reserva tiene `recurrence` (Cloud Function `createBlockedSlot` lo descarta para puntuales). Al crear: toggle "Pago mensual" visible únicamente en la sección de recurrencia de `BlockedSlotForm`. Al editar: toggle "Pago mensual" en `EditManualReservationSheet` (solo para recurrentes); los cambios aplican a todas las instancias. En la card: el badge "Mensualidad" (violeta) reemplaza el precio en la fila de precio — si `isMonthly` es true, no se muestra el importe numérico. El toggle es verde (`#1f7a4f`) en ambos forms. |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Igual que hoy. La adición de campos a `BlockedSlot` no cambia cardinalidad ni patrones de query.

### Índices Firestore requeridos
- Ninguno nuevo. `status` no se usa para filtrar consultas (solo para mostrar). Si en el futuro se quiere "todas las reservas no pagadas del mes", se agrega un índice compuesto.

### Paginación
- N/A.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Cambio de status**: dos admins podrían cambiarlo simultáneamente. Aunque cualquier transición es válida, la transacción asegura que la escritura sea atómica y falle si el doc fue eliminado. Usar `runTransaction()` en `updateManualReservationStatus(slotId, newStatus)`.
- **Eliminación rápida**: la operación `deleteBlockedSlot()` existente ya es transaccional. Reuso.
- **Creación**: ya transaccional para detectar conflictos de canchas.

### Race conditions identificadas
- **Escenario**: Admin A pone Confirmado mientras Admin B pone Jugado en paralelo. → **Mitigación**: ambos updates son válidos por separado; el último en aplicarse gana (`last-write-wins`). Como las dos transiciones son legítimas (no hay enforce de orden), el resultado es consistente con la semántica permitida. Si el admin se sorprende del resultado, puede corregir tapeando el badge.
- **Escenario**: Admin A elimina la reserva mientras Admin B intenta cambiar su status. → **Mitigación**: la transacción de status falla con `not-found` si el doc fue eliminado. UI muestra error y revierte el optimistic update.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Sin cambios. Las acciones (crear, cambiar status, eliminar) las puede hacer `super_admin` o `location_admin` con la sede asignada — es lo que ya validan `firestore.rules` para `BlockedSlot`.

### Firestore Rules requeridas
- **Reglas de update sobre `BlockedSlot`**: hoy permiten al admin de la sede actualizar el doc. El nuevo campo `status` cae bajo la misma regla — sin cambios necesarios. **Validar manualmente** que la regla no permite a otros usuarios escribir.
- Si se quisiera hacer cumplir la regla "status solo avanza" a nivel rules, se necesitaría una función custom en rules que compare `request.resource.data.status` vs `resource.data.status`. **Por defecto NO lo implementamos** — lo enforzamos en código (transacción). Si auditamos uso futuro y hay manipulación maliciosa, lo agregamos. Tradeoff: simplicidad vs defensa-en-profundidad.

### Validaciones de input
- `clientName`: trim, longitud mínima 1, máxima 80. **Obligatorio**.
- `clientPhone`: trim. **Opcional**. Si tiene valor, debe matchear `^3\d{9}$` (mismo formato Colombia). Si está vacío, se omite del payload (no se persiste cadena vacía).
- `priceCOP`: integer ≥ 0, **calculado por el sistema al crear** desde el schedule. No es input del admin.
- `reason` (label "Información adicional"): trim, opcional, máx 200 chars.

### Datos sensibles
- `clientPhone` es PII del cliente (cuando se ingresa). Solo visible para admins con acceso a la sede. **No exponer** en queries públicas. Verificar que `firestore.rules` no permita lectura a usuarios fuera del rol admin de la sede.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Avance de status falla | Red, doc eliminado en paralelo, transacción abortada | Toast "No pudimos actualizar el estado" + revert optimista |
| Quick delete falla | Permisos, red, doc ya eliminado | Toast con detalle (manejado por el `DeleteBlockedSlotSheet` ya existente) |
| Crear sin `clientName` | Validación cliente | Botón "Reservar" deshabilitado, mensaje inline |
| Crear con `clientPhone` mal formado | Validación cliente (regex) | Botón "Reservar" deshabilitado, mensaje inline. Si está vacío se permite. |
| Schedule no disponible al calcular precio | Día sin schedule, formato no soportado | `priceCOP: 0` se persiste; la card muestra "—" en lugar del valor |
| Lectura de doc viejo sin `status` | Doc creado antes del SDD | Default `pending` en runtime (sin escribir) |

### Retry strategy
- Cambios de status: el admin reintenta manualmente con tap en el botón. No auto-retry.
- Eliminaciones: idem.

### Degradación elegante
- Si los nuevos campos no se pueden cargar por algún error, las cards muestran lo que tengan (compatible con docs viejos). Nada se rompe visualmente.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo 1 — Crear reserva manual completa
1. Admin abre `BlockedSlotForm` (vía CTA del `HourDetailDrawer` o vía botón `+ Reserva manual` en venue admin).
2. Form muestra (en orden):
   - Fecha (pre-rellenada).
   - Desde / Hasta (pre-rellenadas).
   - Toggle "Se repite" + opciones de recurrencia (existentes).
   - Canchas a bloquear (chips, ahora verdes — ya hecho).
   - **Cliente** (obligatorio, validación visible).
   - **Celular** (opcional; si tiene valor se valida 10 dígitos).
   - **Precio** (display solo-lectura, calculado en vivo desde fecha + hora + canchas + formato del schedule del venue).
   - Información adicional (opcional, antes "Motivo" — guardado en el campo `reason`).
3. CTA "Reservar" se habilita solo si `clientName` válido + canchas seleccionadas + tiempos válidos. Si `clientPhone` tiene valor, también debe ser válido. Precio no bloquea (incluso con 0 se puede crear).
4. Submit → crea doc con `status: "pending"` y `priceCOP` calculado.

### Flujo 2 — Avanzar estado desde una card (happy path)
1. Admin ve una card `AdminBlockCard` con badge "Pendiente" y botón quick "Confirmar".
2. Tap "Confirmar" → optimistic update de la card → transacción a Firestore.
3. La card actualiza badge a "Confirmado" + botón pasa a "Marcar jugado".
4. Repite hasta `paid`. En ese punto el botón quick desaparece.

### Flujo 2b — Corregir un cambio de estado equivocado (rollback)
1. Admin se equivoca y avanzó la reserva a "Pagado" cuando debía estar en "Confirmado".
2. Tap en el badge "Pagado" → abre popover con las 4 opciones (`Pendiente`, `Confirmado`, `Jugado`, `Pagado`); el actual viene marcado.
3. Tap en "Confirmado" → optimistic update + transacción → cierre del popover.
4. La card pasa a badge "Confirmado" y el botón quick reaparece como "Marcar jugado".

El mismo flujo se usa para saltar adelante varios estados de un solo paso (ej. de Pendiente directo a Pagado), o para corregir hacia atrás.

### Flujo 3 — Eliminación rápida
1. Admin ve card con botón quick trash.
2. Tap → abre el `DeleteBlockedSlotSheet` existente (mismo que hoy aparece al tapear la card y elegir eliminar).
3. El sheet pide confirmación, motivo opcional y, si la reserva es recurrente, ofrece las opciones de scope (solo esta, esta y futuras, todas).
4. Confirmar → la card desaparece (realtime).

El quick button no agrega un modal nuevo: solo evita el extra-tap de abrir el detalle primero. Cards puntuales y recurrentes pasan por el mismo sheet.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Card normal (`pending`) | Badge amarillo "Pendiente" + cliente + teléfono (si hay) + precio (o "—") + canchas + botones quick |
| Card `confirmed` | Badge azul "Confirmado" |
| Card `played` | Badge slate "Jugado" |
| Card `paid` | Badge verde "Pagado" + sin botón quick-status (último estado lineal) |
| Card `no_show` | Badge rojo "No asistió" + sin botón quick-status |
| Card `free` | Badge morado "Gratis" + sin botón quick-status |
| Form sin cliente | Botón Reservar disabled, mensaje inline junto al input de cliente |
| Form con celular mal formado | Botón Reservar disabled, mensaje inline junto al input de celular |
| Form con precio no calculable | Display "Precio no calculable para este horario", se persistirá `0` |

### Consideraciones mobile-first
- Los dos quick buttons deben ser tappables sin pelearse con el tap del card en sí. Solución: si la card mantiene tap-para-detalle (hoy: `onClick(block, targetDate)`), los buttons usan `e.stopPropagation()`.
- Touch targets mínimos 32×32 para los íconos quick + área de tap visualmente más grande.
- Inputs nuevos (Cliente, Celular, Precio): font-size ≥ 16px (regla anti-zoom iOS).
- Modal de confirmación: max-w-sm, centrado, bottom sheet en mobile (mismo patrón que confirm modals existentes).

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- Ninguno. Reuso completo del `DeleteBlockedSlotSheet` existente para el quick delete.

### Componentes modificados
- **`components/booking/AdminBlockCard.tsx`**:
  - Layout: agrega badge de status arriba a la derecha. **El badge es tappable** y abre un popover con las 4 opciones de estado (rollback / salto directo).
  - Cuerpo: muestra cliente, teléfono (si hay), precio formateado (o "—"), información adicional (campo `reason`), canchas.
  - Footer compacto con dos quick buttons: avanzar estado al siguiente (oculto en `paid`) + eliminar.
  - Card sigue siendo clickable (delegación al onClick existente para abrir el detalle / sheet).
  - Botones y el badge usan `stopPropagation` para no disparar el click del card.

- **`components/booking/StatusPopover.tsx`** (nuevo, opcional según se ajuste el alcance): popover/menu pequeño con las 4 opciones. Anclado al badge. Cierra al tap fuera o al elegir. Si el componente queda muy simple, se inlinea dentro de `AdminBlockCard` sin archivo separado.
- **`components/booking/BlockedSlotForm.tsx`**:
  - Reordena el form para que Cliente, Celular y Precio queden cerca de Canchas.
  - Validación de cliente (obligatorio) y celular (opcional con regex si tiene valor).
  - Cambio del copy: label "Motivo" → "Información adicional", placeholder ajustado. **Sigue guardando en el campo `reason`** (sin migración, sin nuevo campo).
  - Display de precio en solo-lectura calculado en vivo a partir de fecha/hora/canchas/formato del schedule.
  - Botón Reservar deshabilitado si falta cliente válido o celular mal formado.
- **`components/booking/HourDetailDrawer.tsx`**: pasa los handlers nuevos (`onAdvanceStatus`, `onQuickDelete`) a las cards.
- **`components/booking/AdminBookingCalendar.tsx`**: idem, pasa handlers.
- **`app/venues/admin/[id]/page.tsx`**: orquesta los handlers — `onAdvanceStatus` llama a `updateManualReservationStatus`; `onQuickDelete` setea `deleteTarget` y abre el `DeleteBlockedSlotSheet` (igual que hoy, solo que se accede más rápido).

### Animaciones (Framer Motion)
- Badge de status: transición de color con `transition-colors` (sin Framer; CSS es suficiente).
- Card al cambiar status: pulse rápido de `scale: 1 → 1.02 → 1` con Framer (~200ms) para feedback visual.
- Sheet de eliminación: ya tiene su animación existente, sin cambios.

### Responsive
- Card layout en mobile: badge + título + cliente en columna; phone + precio en flex-row con wrap; quick buttons en flex-row con `gap-2`.
- Desktop: igual layout, max-w-md por contexto.

### Colores (paleta del proyecto)
- Badge `pending`: `bg-amber-50 text-amber-700`
- Badge `confirmed`: `bg-blue-50 text-blue-700`
- Badge `played`: `bg-slate-100 text-slate-700`
- Badge `paid`: `bg-emerald-50 text-emerald-700`
- Botón quick avanzar: `bg-[#1f7a4f]/10 text-[#1f7a4f]` (subtle, no compite con la card)
- Botón quick delete: `text-slate-400 hover:text-red-500` (sutil, peligro solo en hover)

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `manual_reservation_status_changed` | Tap en quick avanzar O selección desde el popover del badge | `venueId`, `slotId`, `fromStatus`, `toStatus`, `via` (`"quick" \| "popover"`) |
| `manual_reservation_quick_delete_opened` | Tap en el quick button trash (antes de confirmar en el sheet) | `venueId`, `slotId`, `wasRecurring` |
| `manual_reservation_created` | Reuso del existente `blocked_slot_created` | + nuevas props: `hasPhone`, `priceCOP`, `priceCalculable` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

`lib/domain/venue.ts`:
```typescript
export type ManualReservationStatus = "pending" | "confirmed" | "played" | "paid" | "no_show" | "free";

export const MANUAL_RESERVATION_STATUS_ORDER: ManualReservationStatus[] = [
    "pending", "confirmed", "played", "paid", "no_show", "free",
];
// Ruta lineal para quick-advance (no_show y free son terminales paralelos):
const ADVANCE_ORDER = ["pending", "confirmed", "played", "paid"];

export interface BlockedSlot {
    id: string;
    date: string | null;
    startTime: string;
    endTime: string;
    courtIds: string[];
    recurrence?: BlockedSlotRecurrence;
    exceptDates?: string[];

    // === existentes (sin cambios de schema) ===
    reason?: string;           // visible como "Información adicional" en UI; sigue siendo el mismo campo
    clientName?: string;       // ahora obligatorio en escritura, opcional en docs viejos
    createdBy: string;
    createdAt: string;

    // === nuevos ===
    clientPhone?: string;      // opcional en escritura. Si está vacío, no se persiste.
    priceCOP?: number;         // calculado por el sistema al crear (>= 0). Opcional en docs viejos.
    status?: ManualReservationStatus; // default `pending` al leer si falta. Opcional en docs viejos.
}
```

### Capa de dominio (`lib/domain/`)
- **`lib/domain/venue.ts`**: agregar tipos y constantes anteriores. Helpers nuevos:
  ```typescript
  export function getBlockedSlotStatus(slot: BlockedSlot): ManualReservationStatus {
      return slot.status ?? "pending";
  }

  export function getNextStatus(current: ManualReservationStatus): ManualReservationStatus | null {
      const idx = MANUAL_RESERVATION_STATUS_ORDER.indexOf(current);
      return idx >= 0 && idx < MANUAL_RESERVATION_STATUS_ORDER.length - 1
          ? MANUAL_RESERVATION_STATUS_ORDER[idx + 1]
          : null;
  }

  export function statusBadge(status: ManualReservationStatus): { label: string; classes: string } {
      // mapping a colores y labels
  }
  ```
- **`lib/domain/court-allocation.ts` (o nuevo `lib/domain/manual-reservation-pricing.ts`)**: helper `calculateManualReservationPrice(schedule, format, startTime, endTime, courtIds)` → number. Calcula precio del slot del schedule más cercano × duración (en horas) × cantidad de canchas. Default `0` si no se puede.

### Capa de API (`lib/`)
- **`lib/venues.ts`**:
  - `createBlockedSlot(...)`: aceptar nuevos campos `clientPhone` (opcional, omitir si vacío), `priceCOP` (calculado) e `isMonthly` (solo si recurrente). Mantener `reason` tal como está. Setear `status: "pending"`.
  - **Nueva**: `updateManualReservationStatus(venueId, slotId, newStatus)`. Usa `runTransaction` para atomicidad. Cualquier transición es válida.
  - **Nueva**: `updateManualReservation(venueId, slotId, { clientName?, clientPhone?, reason?, isMonthly? })`. `updateDoc` directo (no transacción — sin race condition para metadatos). Campos con valor `undefined` se borran de Firestore via `deleteField()` (Firestore no acepta `undefined` en `updateDoc`).

### Componentes UI (`app/`)
- Listado en sección 7. Sin nuevas páginas.

### Backward compatibility
- **Lectura**: `getBlockedSlotStatus()` aplica default `pending`. Cards/sheets que necesiten `clientPhone` o `priceCOP` muestran "—" si no existen. `reason` se sigue leyendo del mismo campo (solo cambia el label).
- **Escritura**: `createBlockedSlot()` siempre escribe `status: "pending"`, `priceCOP` (calculado), `clientName` (obligatorio). `clientPhone` solo si se ingresó. `reason` opcional como hoy.
- **Sin migración** de datos.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Crear una reserva manual sin `clientName` queda bloqueado: el botón "Reservar" está disabled y hay validación visible.
- [ ] Crear una reserva manual con `clientPhone` vacío funciona OK; con `clientPhone` mal formado queda bloqueado con mensaje inline.
- [ ] El precio se muestra en el form como display calculado en vivo (no input). Al persistir, queda guardado y no se puede editar después.
- [ ] El campo "Motivo" se ve como "Información adicional" en el form y en las cards. En Firestore sigue siendo `reason`.
- [ ] Cards de reserva manual muestran badge de status, nombre, teléfono (si hay), precio formateado (o "—") e info adicional.
- [ ] Quick button "Avanzar" en una card pasa por `Pendiente → Confirmado → Jugado → Pagado`. En `Pagado` el botón desaparece.
- [ ] Tap en el badge abre un popover con las 4 opciones; tap en cualquiera (incluyendo retrocesos o saltos) actualiza el estado.
- [ ] Si dos admins cambian el status en paralelo, gana el último write y la UI converge sin errores visibles.
- [ ] Quick button trash abre el `DeleteBlockedSlotSheet` existente, idéntico a tapear la card y elegir eliminar.
- [ ] Las cards y los quick buttons funcionan idénticos en `HourDetailDrawer` y en `AdminBookingCalendar`.
- [ ] Reservas viejas (sin status, sin phone, sin price, con `reason`) no rompen la UI: se renderizan con defaults.
- [ ] Eventos `manual_reservation_status_changed` (con prop `via: "quick" | "popover"`) y `manual_reservation_quick_delete_opened` se disparan correctamente.
- [ ] Tap en card sigue abriendo el flow existente (no rompe la interacción del card en sí).

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Tipos `ManualReservationStatus`, helpers `getBlockedSlotStatus/getNextStatus/statusBadge`, campos nuevos en `BlockedSlot` |
| `lib/domain/manual-reservation-pricing.ts` | **Nuevo** — helper `calculateManualReservationPrice()` |
| `lib/venues.ts` | `createBlockedSlot()` extendido (acepta `clientPhone` opcional + `priceCOP` calculado); nueva `updateManualReservationStatus()` con `runTransaction` |
| `lib/analytics.ts` | Eventos nuevos `manual_reservation_status_changed` (con `via: "quick" \| "popover"`), `manual_reservation_quick_delete_opened`; props extra en `blocked_slot_created` |
| `components/booking/BlockedSlotForm.tsx` | Input `clientName` (obligatorio), `clientPhone` (opcional), display de `priceCOP` (solo lectura, calculado); relabel `Motivo` → `Información adicional` (sin cambiar el nombre del campo); reordering |
| `components/booking/AdminBlockCard.tsx` | Layout nuevo con badge, teléfono, precio, info adicional, dos quick buttons |
| `components/booking/HourDetailDrawer.tsx` | Pasa handlers; CTA deshabilitado si todas las canchas están ocupadas |
| `components/booking/AdminBookingCalendar.tsx` | Pasa handlers; realtime subscription para blocks; botón "Crear reserva manual" por día |
| `app/venues/admin/[id]/page.tsx` | Orquesta handlers; `occupiedCourtIds` pasados al form desde `HourDetailDrawer` |
| `firestore.rules` | Verificar que update de `BlockedSlot` siga restricto a admin de la sede; sin cambios mecánicos |
| `scripts/backfill-manual-reservation-prices.js` | **Nuevo** — migración one-time de `priceCOP` en docs existentes |
| `components/booking/EditManualReservationSheet.tsx` | **Nuevo** — sheet de edición de `clientName`, `clientPhone`, `reason`, `isMonthly` (solo recurrentes) |
| `functions/src/blocked-slots.ts` | Acepta `isMonthly` en `CreateInput`; persiste solo cuando `normalizedRecurrence` existe |

---

## 12. FUERA DE SCOPE

- Audit log de cambios de status (quién y cuándo lo movió).
- Restringir el rollback de `paid` cuando exista un sistema real de cobros (hoy `paid` es solo un marcador manual, así que retroceder no rompe nada).
- Status "Cancelado" como estado terminal alternativo a "Pagado". Hoy cancelar = eliminar. Si después se quiere conservar el registro de canceladas para reportería, se agrega.
- Notificación al cliente vía SMS/WhatsApp con el celular registrado (sería una feature aparte que justifica su propio SDD).
- Reportería de ingresos por status (cuánta plata en `paid` vs `played` pendiente). Se agrega cuando se necesite.
- Migración de docs viejos. Se queda con backward compat en lectura.
- Aplicar status a `Booking` online (ya tienen su propio modelo).
- Forzar a nivel `firestore.rules` que el status solo avance. Lo enforzamos solo en código por simplicidad — si se detecta abuso, se agrega.
