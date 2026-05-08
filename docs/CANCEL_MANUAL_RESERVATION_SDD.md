# Feature: Cancelación de Reservas Manuales con Historial

## 📋 Specification-Driven Development (SDD)

Reemplazar la eliminación permanente de reservas manuales por una cancelación con motivo, conservando el registro en Firestore y mostrándolo visualmente como cancelado en las vistas de admin.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy el admin elimina una reserva manual y el registro desaparece para siempre — no hay forma de saber que existió, quién la canceló, o por qué. Con esta feature la reserva queda en Firestore con `status: "cancelled"` y un `cancellationReason`, y se sigue mostrando en las listas (tachada/atenuada) como historial operativo.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | `"cancelled"` se agrega a `ManualReservationStatus`. Es un estado terminal: no aparece en la ruta de avance lineal del quick button, ni como opción en el popover del badge (para evitar que se "re-active" accidentalmente). | Badge gris oscuro "Cancelada" en la card |
| 2 | Al cancelar, el admin puede escribir un motivo (opcional). Se persiste en `cancellationReason: string`. Si está vacío se omite del doc. | Input en el sheet de cancelación |
| 3 | El campo `cancelledAt: string` (ISO timestamp) se escribe automáticamente. | No visible en UI v1 |
| 4 | Cards canceladas aparecen en la lista del slot (hourly y calendario) con estilo atenuado: opacity reducida, nombre del cliente tachado. No se muestran los quick buttons de avanzar ni cancelar en una card ya cancelada. | Estilo `opacity-50 line-through` en cliente/hora |
| 5 | Las cards canceladas se ubican **al final** de la lista del slot (debajo de las activas), ordenadas por startTime. | Reordenamiento en HourDetailDrawer y AdminBookingCalendar |
| 6 | El botón quick "Eliminar" (trash) de `AdminBlockCard` se reemplaza por "Cancelar" (ícono `Ban`). Tap abre un sheet con input de motivo y botón "Cancelar reserva". | Ícono y texto del botón cambian |
| 7 | **Slots recurrentes — alcance de cancelación**: tres opciones con comportamientos distintos. *Solo esta fecha*: agrega la fecha a `exceptDates` (el recurrente no muestra ese día) **y** crea un doc one-off `cancelled` para esa fecha → aparece en el historial. *Esta fecha y futuras*: fija `recurrence.endDate` al día anterior + crea doc one-off `cancelled` para la fecha target. *Toda la recurrencia*: **hard delete** del doc principal con doble confirmación — el recurrente desaparece completamente. | Selector de scope con aviso de peligro en "Toda la recurrencia" + segunda pantalla de confirmación |
| 8 | Desde el popover del badge **no** se puede ir a `cancelled` directamente — se accede solo mediante el botón "Cancelar" con su sheet de confirmación y motivo. Esto previene cancelaciones accidentales por mis-tap. | `cancelled` excluido del `MANUAL_RESERVATION_STATUS_ORDER` del popover |
| 9 | No se puede cancelar una reserva que ya está `cancelled` (el botón no aparece). | Condición en `AdminBlockCard` |
| 10 | **Hard delete** queda disponible solo para `super_admin` (botón Trash rojo separado, fuera del flujo de cancelación normal). Los `location_admin` solo ven el botón "Cancelar". | Condición por rol en `AdminBlockCard` |

### No-objetivos
- No restaurar una reserva cancelada de vuelta a activa (si se necesita, el admin crea una nueva).
- No mostrar instancias futuras de un recurrente como canceladas individualmente cuando se usa scope "Esta fecha y futuras" — solo se acorta la recurrencia.
- No notificar al cliente por SMS/WhatsApp al cancelar.
- No agregar `cancelled` como opción del popover del badge.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Los docs cancelados se acumulan en `blocked_slots`. Para venues con muchas reservas manuales, la colección crece con el tiempo. Sin índice nuevo, esto no afecta las queries actuales (filtradas por fecha o recurrencia, no por status).

### Paginación
- No aplica en V1 — se muestran todos los slots del día seleccionado.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- `cancelManualReservation(venueId, slotId, reason)`: read + update dentro de transaction para garantizar que el doc exista al momento de cancelar.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Solo `super_admin` o `location_admin` asignado a la sede pueden cancelar — mismas reglas que el update actual de `blocked_slots`.

### Validaciones de input
- `cancellationReason`: trim, máx 300 chars, **opcional**.

---

## 5. TOLERANCIA A FALLOS

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Cancelación falla | Red, doc ya cancelado/eliminado en paralelo | Toast de error, sin cambio visual |
| Doc no encontrado | Otro admin lo eliminó mientras este veía el sheet | Toast "Reserva no encontrada", sheet se cierra |

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal — Cancelar una reserva manual
1. Admin ve una card activa con botón `Ban` "Cancelar".
2. Tap → abre `CancelManualReservationSheet` (bottom sheet).
3. Sheet muestra: resumen de la reserva (cliente + horario), input de motivo (opcional), botón "Cancelar reserva" (rojo) y "Volver".
4. Si la reserva es **recurrente**: aparece selector de scope (Solo esta / Esta y futuras / Todas).
5. Admin escribe motivo (o no) y confirma.
6. Firestore actualiza `status: "cancelled"`, `cancellationReason`, `cancelledAt`.
7. La card pasa a estilo cancelado (atenuada, tachada) y se mueve al final de la lista.

### Estados de UI de una card cancelada
- Fondo: `bg-slate-50/30` (más tenue que una activa)
- Header hora: `text-slate-400` (sin negrita)
- Nombre cliente: `line-through text-slate-400`
- Badge: `bg-slate-100 text-slate-500` con label "Cancelada"
- Quick buttons: **ninguno** (ni avanzar ni cancelar de nuevo)
- Motivo de cancelación: se muestra si existe, en itálica gris

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- **`CancelManualReservationSheet`** — bottom sheet con input de motivo + selector de scope si es recurrente. Reutiliza el patrón visual del `CancelBookingSheet` existente.

### Componentes modificados
- **`AdminBlockCard`**:
  - Botón quick `Trash2` → `Ban` (ícono) con label/aria "Cancelar".
  - Si `status === "cancelled"`: aplica estilos atenuados, oculta quick buttons, muestra `cancellationReason` si existe.
- **`HourDetailDrawer`** / **`AdminBookingCalendar`**: ordenar cards poniendo las canceladas al final.
- **`lib/domain/venue.ts`**: agregar `"cancelled"` al tipo pero **excluirlo** de `MANUAL_RESERVATION_STATUS_ORDER` (popover).

### Colores
- Badge `cancelled`: `bg-slate-100 text-slate-500`

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `manual_reservation_cancelled` | Confirmación del sheet | `venueId`, `slotId`, `hadReason: boolean`, `scope: "single"\|"future"\|"all"\|"non_recurring"`, `wasRecurring: boolean` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
```typescript
// Tipo actualizado
export type ManualReservationStatus =
    "pending" | "confirmed" | "played" | "paid" | "no_show" | "free" | "cancelled";

// Campos nuevos en BlockedSlot
cancellationReason?: string;  // motivo de cancelación (opcional)
cancelledAt?: string;         // ISO timestamp de cuándo se canceló
```

### Capa de dominio (`lib/domain/venue.ts`)
- Agregar `"cancelled"` al tipo.
- `statusBadge("cancelled")` → `{ label: "Cancelada", classes: "bg-slate-100 text-slate-500" }`.
- `MANUAL_RESERVATION_STATUS_ORDER` **no** incluye `"cancelled"` (no aparece en el popover).
- Helper `isCancelled(slot): boolean` → `slot.status === "cancelled"`.

### Capa de API (`lib/venues.ts`)
```typescript
export async function cancelManualReservation(
    venueId: string,
    slotId: string,
    reason: string | undefined,
    scope: "single" | "future" | "all",
    targetDate: string,   // para recurring scope "single" y "future"
): Promise<void>
```
- **No recurrente**: `runTransaction` → `status: "cancelled"`, `cancellationReason`, `cancelledAt`.
- `scope === "single"` (recurrente): agrega `targetDate` a `exceptDates` **+** crea doc one-off con mismos datos + `status: "cancelled"`, `date: targetDate`, `cancellationReason`, `cancelledAt`.
- `scope === "future"` (recurrente): fija `recurrence.endDate = targetDate - 1 día` **+** crea doc one-off cancelado para `targetDate`.
- `scope === "all"` (recurrente): **hard delete** del doc. La UI pide doble confirmación antes de llamar esta función.

### Componentes UI
Ver sección 7.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Tap en "Cancelar" (ícono Ban) abre el sheet con input de motivo.
- [ ] Slot recurrente → sheet muestra selector de scope.
- [ ] Confirmar cancelación → card pasa a estilo atenuado/tachado y se ubica al final de la lista.
- [ ] Card cancelada no muestra quick buttons.
- [ ] Card cancelada muestra el motivo de cancelación si se ingresó.
- [ ] No se puede re-cancelar una card ya cancelada.
- [ ] `cancelled` no aparece en el popover del badge (no se puede asignar por ahí).
- [ ] Evento `manual_reservation_cancelled` se dispara al confirmar.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Agrega `"cancelled"` al tipo; `statusBadge`; helper `isCancelled`; excluir de popover order |
| `lib/venues.ts` | Nueva función `cancelManualReservation()` con `runTransaction` |
| `lib/analytics.ts` | Nuevo evento `manual_reservation_cancelled` |
| `components/booking/AdminBlockCard.tsx` | Botón Ban en lugar de Trash; estilos de card cancelada |
| `components/booking/CancelManualReservationSheet.tsx` | **Nuevo** — sheet con motivo + scope |
| `components/booking/HourDetailDrawer.tsx` | Prop `onCancelBlock`; ordenar canceladas al final |
| `components/booking/AdminBookingCalendar.tsx` | Prop `onCancelBlock`; ordenar canceladas al final |
| `app/venues/admin/[id]/page.tsx` | Handler `handleCancelBlock`; estado `cancelManualTarget` |
