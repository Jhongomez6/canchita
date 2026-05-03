# Feature: Cancelación de Reservas con Motivo

## 📋 Specification-Driven Development (SDD)

Capturar siempre el motivo cuando se cancela una reserva (jugador o admin) y permitir al admin de sede cancelar reservas de jugadores y eliminar reservas manuales (incluido instancias puntuales de bloqueos recurrentes).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy [cancelBooking](functions/src/bookings.ts) cancela sin pedir motivo y solo el dueño puede dispararlo desde UI; el location_admin no tiene flujo claro para cancelar reservas de jugadores ni para eliminar reservas manuales que él mismo creó. Esta feature:
1. Hace obligatorio el motivo de cancelación (jugador y admin) con sugerencias rápidas para reducir fricción.
2. Da al admin un punto de entrada explícito para cancelar reservas de jugadores con notificación al jugador.
3. Permite al admin eliminar reservas manuales (bloqueos puntuales o instancias de recurrentes vía `exceptDates`, o eliminar la recurrencia entera).

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-1 | Toda cancelación de booking requiere `cancellationReason` no vacío (mínimo 5 caracteres). | El CTA "Cancelar reserva" no envía hasta que haya motivo. |
| RN-2 | Se ofrecen sugerencias rápidas (chips clickeables) para acelerar el flujo. Al tocar una se rellena el textarea (editable). El usuario puede escribir libre. | Chips arriba del textarea. |
| RN-3 | Sugerencias del **jugador**: "No puedo asistir", "Cambio de planes", "Encontré otro horario", "Lesión/enfermedad", "Otro" (sin precarga). | 4 chips fijos + textarea. |
| RN-4 | Sugerencias del **admin** cancelando booking de jugador: "Mantenimiento de la cancha", "Evento privado", "Cancha no disponible", "Solicitud del cliente", "Otro". | 4 chips + textarea, motivo visible al jugador. |
| RN-5 | **Política de reembolso**: (a) admin cancela → siempre reembolso a wallet (si paymentMethod=wallet_deposit y depositCOP>0); (b) jugador cancela ≥24h antes → reembolso; (c) jugador cancela <24h antes → sin reembolso. | El modal muestra el resumen del reembolso antes de confirmar. |
| RN-6 | Cuando el admin cancela un booking de jugador, se envía push notification al jugador (`booking_cancelled_by_admin`) con el motivo en el body. El motivo queda visible en `/bookings/[id]`. | Push + sección "Cancelada por admin" en detalle. |
| RN-7 | El admin puede **eliminar** una reserva manual puntual (`BlockedSlot` sin `recurrence`) → elimina el documento. No requiere reembolso ni notificación. | CTA "Eliminar" en detalle del bloqueo + confirmación con motivo opcional. |
| RN-8 | El admin puede cancelar **una instancia** de un bloqueo recurrente → agrega la fecha a `exceptDates` (no elimina el documento). La recurrencia sigue activa para las demás fechas. | CTA "Cancelar solo este día" en instancia expandida. |
| RN-9 | El admin puede **terminar la recurrencia** → se setea `endDate = ayer` (truncamiento). Las instancias pasadas se preservan para auditoría/reportes; las futuras desaparecen. No se borra el documento. | CTA "Terminar recurrencia" con confirmación reforzada. |
| RN-10 | Solo puede cancelar un booking: (a) el dueño de la reserva, (b) super_admin, (c) location_admin asignado al venue. La validación se hace server-side en la Cloud Function. | Cliente no expone CTAs para usuarios sin permiso. |
| RN-11 | El motivo se guarda en `cancellationReason` y `cancelledByRole` (`"player" \| "admin"`) para auditoría y futura segmentación de analytics. | Campos nuevos en `Booking`. |
| RN-12 | Una reserva ya `cancelled`/`expired`/`completed` no se puede volver a cancelar (idempotencia). | Server retorna `failed-precondition`; UI oculta CTA. |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Cancelaciones diarias: ~2–5 por sede activa. Volumen bajo.
- Push notifications: 1 por cancelación admin → < 50/día en estado estable.
- Reads adicionales: cada cancelación admin lee `users/{ownerUid}` para resolver tokens FCM (1 read extra).

### Índices Firestore requeridos
Ningún índice nuevo. Las queries existentes (`bookings` por `venueId+date`, `blocked_slots` por `date`) ya cubren los casos.

### Paginación
N/A.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

**`cancelBooking` (modificada)** — ya usa `runTransaction` actualmente. Se extiende para:
- Aceptar `reason` en el payload.
- Distinguir `cancelledByRole`: si `request.auth.uid !== booking.bookedBy` y el caller es admin → role=`admin`, sino role=`player`.
- Si role=`admin` y depositCOP > 0 y paymentMethod=`wallet_deposit` → reembolso completo (ignorar regla 24h).
- Si role=`player`: regla 24h existente.

**`deleteBlockedSlot` (nueva onCall)** — opera sobre un `BlockedSlot` con tres modos:
- `mode=oneoff` → bloqueo puntual sin recurrencia: elimina el documento.
- `mode=instance` → instancia única de un recurrente: agrega la fecha a `exceptDates[]` con `runTransaction` para evitar lost-update si el admin agrega varias excepciones rápido.
- `mode=recurrence` → terminar recurrencia: setea `endDate = (targetDate - 1 día)` para que las instancias pasadas se preserven y las futuras desaparezcan. Si la recurrencia ya tenía `endDate` previo y el nuevo es posterior, no se modifica (idempotente).

### Race conditions identificadas

| Escenario | Mitigación |
|-----------|------------|
| Admin cancela booking ↔ jugador completa pago simultáneo. | `cancelBooking` verifica `status === "confirmed" \| "pending_payment"` dentro de la transacción; si el jugador completó el pago entre lectura y escritura, la transacción se reintenta y el estado se revalida. |
| Admin termina recurrencia ↔ otro admin agrega `exceptDate` simultáneo. | Ambas son operaciones de `update` sobre el mismo doc; la transacción reintenta y el resultado final es consistente (endDate truncado + exceptDates extra para una fecha que ya cae fuera de rango — no afecta UX). |
| Dos admins cancelan la misma instancia recurrente. | `arrayUnion(date)` en `exceptDates` es idempotente. |
| Dos admins terminan la misma recurrencia. | `update` con `endDate=ayer` es idempotente; si llegan dos en el mismo día el resultado es el mismo. |

---

## 4. SEGURIDAD

### Autenticación y autorización
- `cancelBooking`: ya valida `request.auth` y dueño/admin. Sin cambios.
- `deleteBlockedSlot` (nueva): requiere `request.auth.uid` = super_admin o location_admin asignado al venue. Misma lógica de helper que `createBlockedSlot`.

### Firestore Rules requeridas

`bookings/{bookingId}`: las reglas existentes ya bloquean writes desde cliente (toda mutación pasa por Cloud Functions). Sin cambios.

`venues/{venueId}/blocked_slots/{id}`: las rules actuales restringen writes a super_admin / location_admin asignado al venue. La Cloud Function `deleteBlockedSlot` se agrega como **canal adicional** (mejor atomicidad y validación de modos), pero los helpers cliente existentes (`removeBlockedSlot`, `addBlockedSlotException`) siguen funcionando para el `BlockedSlotsEditor` del super_admin. **No se cambian las rules** en esta iteración — si en el futuro se quiere centralizar todas las mutaciones por CF, migrar primero los helpers existentes y luego endurecer las rules.

### Validaciones de input
- `reason`: trim, length entre 5 y 500 caracteres. Sanitizar HTML básico (no ejecutar — solo se muestra como texto).
- `mode` (deleteBlockedSlot): `"oneoff" | "instance" | "recurrence"`. `instance` y `recurrence` requieren `targetDate` válida (YYYY-MM-DD).

### Datos sensibles
- `cancellationReason` del jugador es visible al admin del venue (audit). El motivo del admin es visible al jugador (RN-6).
- No se exponen los reasons en queries públicas (`bookings` ya está limitado por user en rules).

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `permission-denied` | Sesión expiró o usuario no es admin del venue | Toast "No tienes permiso para cancelar esta reserva" |
| `failed-precondition` | Booking ya está `cancelled`/`expired`/`completed` | Toast "La reserva ya no se puede cancelar" + cerrar modal |
| `not-found` | bookingId/blockedSlotId borrado | Toast "La reserva ya no existe" + redirect a /bookings |
| Push notification falla (token inválido) | Jugador desinstaló app o revocó permisos | La cancelación se completa igual; se logea warning sin bloquear flujo |
| Network offline al cancelar | Sin conexión | Toast "Sin conexión, intenta de nuevo" + mantener modal abierto con motivo capturado |

### Retry strategy
- `cancelBooking`: retry automático ya existe (1 retry tras 2s, idempotente por status check).
- `deleteBlockedSlot`: idempotente por naturaleza (delete + arrayUnion). 1 retry automático.
- Push notification: best-effort, sin retry (no bloquear cancelación).

### Degradación elegante
- Si push falla → la UI del jugador igual mostrará el estado `cancelled` con el motivo en próximo refresh/snapshot.
- Si el wallet refund falla dentro de la transacción → toda la transacción rolls back, nada queda inconsistente.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo A: Jugador cancela su reserva
1. Jugador en `/bookings/[id]` toca "Cancelar reserva".
2. Sheet `CancelBookingSheet` se abre con:
   - Resumen: fecha, horario, sede.
   - Política de reembolso visible (`>24h: reembolso completo` / `<24h: sin reembolso`) calculada con `isBookingRefundable()`.
   - 4 chips de sugerencia + textarea (placeholder "Cuéntanos brevemente por qué cancelas").
   - Validación: chips opcionales, textarea obligatorio (≥5 chars).
   - CTA "Confirmar cancelación" (deshabilitado hasta validar).
3. Confirma → llamada a `cancelBooking({ bookingId, reason })`.
4. Server cancela + reembolsa según política. Toast éxito + redirect a `/bookings`.

### Flujo B: Admin cancela reserva de jugador
1. Admin en `/venues/admin/[id]` tab "Reservas" (vista calendario o por hora) toca una reserva existente.
2. Card del booking se expande / abre detalle con CTA "Cancelar reserva".
3. Sheet `CancelBookingSheet` con variante `mode="admin"`:
   - Resumen: fecha, horario, jugador.
   - Aviso: "Se devolverá ${depositCOP} a la billetera del jugador" (siempre, regla RN-5a).
   - 4 chips de sugerencias del admin + textarea.
   - Aviso: "El jugador recibirá una notificación con este motivo".
4. Confirma → `cancelBooking({ bookingId, reason })`. Server detecta caller != owner → marca `cancelledByRole=admin`, fuerza reembolso, dispara push.
5. Toast éxito.

### Flujo C: Admin elimina reserva manual (bloqueo puntual)
1. Admin en vista calendario o por hora abre detalle del bloqueo.
2. Sheet con info del bloqueo + CTA "Eliminar reserva manual".
3. Confirmación simple (motivo opcional para audit, sin push). 
4. `deleteBlockedSlot({ blockedSlotId, mode: "oneoff" })`.

### Flujo D: Admin cancela una instancia de recurrente
1. Vista por hora muestra bloqueo recurrente expandido para ese día.
2. Detalle ofrece dos CTAs: "Cancelar solo este día" y "Terminar recurrencia (mantener historial)".
3. "Solo este día" → `deleteBlockedSlot({ blockedSlotId, mode: "instance", targetDate })`.
4. "Terminar" → confirmación reforzada (modal warning) → `mode: "recurrence"` (setea `endDate=targetDate-1`).

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando (durante request) | Spinner en CTA + textarea/chips deshabilitados |
| Validation error (motivo corto) | Helper text "Debe tener al menos 5 caracteres" debajo del textarea |
| Conflict (booking ya cancelado) | Toast + auto-cierre del sheet + refresh del detalle |
| Éxito | Toast verde "Reserva cancelada" + redirect/cierre |
| Vista del jugador post-cancelación admin | Card con badge rojo "Cancelada por admin" + sección "Motivo: {reason}" |

### Consideraciones mobile-first
- Sheets bottom-aligned con `safe-area-inset-bottom`.
- Touch targets ≥44px para chips.
- `pb-24 md:pb-0` para librar bottom nav.
- Inputs con `text-base` (≥16px) para evitar zoom iOS.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

- **`CancelBookingSheet`** ([components/booking/CancelBookingSheet.tsx](components/booking/CancelBookingSheet.tsx))
  - Props: `open`, `onClose`, `onConfirm(reason: string)`, `mode: "player" | "admin"`, `bookingSummary` (date, startTime, endTime, venueName, ownerName?), `refundCOP?: number`.
  - Layout: `motion.div` bottom sheet con header, summary, refund notice, chips de sugerencia, textarea, footer con "Cancelar / Confirmar cancelación".
  - Animación: `initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}` (spring 25/300, igual al drawer existente).

- **`DeleteBlockedSlotSheet`** ([components/booking/DeleteBlockedSlotSheet.tsx](components/booking/DeleteBlockedSlotSheet.tsx))
  - Props: `open`, `onClose`, `slot: BlockedSlot`, `targetDate: string`, `onDeleted()`.
  - Si `slot.recurrence` → muestra dos opciones: "Solo {dia}" (mode=instance) / "Terminar recurrencia" (mode=recurrence, con nota explicativa "Las fechas pasadas se mantienen para tu historial").
  - Si no recurrencia → un solo botón "Eliminar" (mode=oneoff).

### Reutilización
- `BookingDetailCard` (en admin views) ya muestra info; agregar prop `onCancel?: () => void` para abrir el sheet.
- `AdminBookingCalendar` y `AdminSlotPicker`: las cards/rows de reserva/bloqueo se vuelven clickables → abren el sheet apropiado.

### Animaciones (Framer Motion)
- Sheet: spring estándar (damping 25, stiffness 300).
- Chips: `whileTap={{scale:0.95}}` para feedback táctil.
- Toast de éxito: `react-hot-toast` standard.

### Responsive
- Mobile: sheet full width, max-h `90vh`.
- Desktop (md+): sheet centrado max-w-md.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `booking_cancellation_started` | Usuario abre `CancelBookingSheet` | `booking_id`, `venue_id`, `actor_role` (`player` \| `admin`) |
| `booking_cancellation_reason_picked` | Usuario toca un chip de sugerencia | `booking_id`, `actor_role`, `suggestion_label` |
| `booking_cancelled` (modificado) | Server completa cancelación | `venue_id`, `booking_id`, `refunded`, `hours_before_start`, `actor_role`, `reason_length` |
| `blocked_slot_deleted` | Server completa operación | `venue_id`, `blocked_slot_id`, `mode` (`oneoff` \| `instance` \| `recurrence`), `is_recurring` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/booking.ts — extender Booking
export interface Booking {
    // ...campos existentes
    cancelledBy?: string;
    cancelledAt?: string;
    cancelledByRole?: "player" | "admin"; // nuevo
    cancellationReason?: string;          // nuevo
    refundTxId?: string;
}
```

`BlockedSlot` no requiere cambios — `exceptDates: string[]` ya existe.

### Capa de dominio (`lib/domain/`)
- `booking.ts`: helper `validateCancellationReason(reason: string): void` (length 5–500, throw `ValidationError`).
- `booking.ts`: nuevas constantes para sugerencias `PLAYER_CANCEL_SUGGESTIONS`, `ADMIN_CANCEL_SUGGESTIONS`.

### Capa de API (`lib/`)
- `lib/bookings.ts`: `cancelBooking(bookingId, reason)` — payload extendido.
- `lib/venues.ts`: `deleteBlockedSlot(venueId, slotId, mode, targetDate?)` — wrapper de la nueva onCall.

### Cloud Functions
- `functions/src/bookings.ts`: `cancelBooking` extendida → recibe `reason`, valida, escribe `cancellationReason` y `cancelledByRole`. Si role=admin → forzar reembolso. Si role=admin → enviar push.
- `functions/src/blocked-slots.ts`: nueva `deleteBlockedSlot`.
- `functions/src/notifications.ts` (existente): helper `sendBookingCancelledByAdminPush(uid, payload)`.

### Componentes UI (`app/`, `components/`)
- `app/bookings/[id]/page.tsx`: reemplazar confirmación inline por `CancelBookingSheet` (mode="player").
- `app/venues/admin/[id]/page.tsx`: rows de booking en `AdminBookingCalendar` y `AdminSlotPicker` se vuelven clickables → abrir `CancelBookingSheet` (mode="admin"). Rows de bloqueo → `DeleteBlockedSlotSheet`.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Jugador no puede cancelar sin escribir motivo (≥5 chars).
- [ ] Admin cancelando booking de jugador siempre dispara reembolso a wallet (sin importar regla 24h).
- [ ] Push notification con motivo llega al jugador cuando admin cancela.
- [ ] Detalle `/bookings/[id]` muestra el motivo y `cancelledByRole=admin` con UI distintiva.
- [ ] Admin puede eliminar bloqueo puntual (delete del doc).
- [ ] Admin puede cancelar instancia de recurrente sin afectar las demás (`exceptDates`).
- [ ] Admin puede terminar recurrencia con confirmación reforzada → instancias futuras desaparecen, pasadas se mantienen para historial.
- [ ] Una reserva ya cancelada no muestra CTA de cancelar (idempotencia visual).
- [ ] Tests de Cloud Functions cubren: cancelación admin con reembolso, cancelación player sin reembolso (<24h), cancelación instancia recurrente, eliminación recurrencia.
- [ ] Firestore Rules bloquean writes/deletes directos en `blocked_slots`.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| [lib/domain/booking.ts](lib/domain/booking.ts) | **Modificar** — agregar `cancelledByRole`, `cancellationReason` a `Booking`; helper `validateCancellationReason`; constantes `PLAYER_CANCEL_SUGGESTIONS`, `ADMIN_CANCEL_SUGGESTIONS` |
| [lib/bookings.ts](lib/bookings.ts) | **Modificar** — `cancelBooking(bookingId, reason)` |
| [lib/venues.ts](lib/venues.ts) | **Modificar** — agregar `deleteBlockedSlot(venueId, slotId, mode, exceptDate?)` |
| [functions/src/bookings.ts](functions/src/bookings.ts) | **Modificar** — extender `cancelBooking` (reason, role, reembolso forzado admin, push) |
| [functions/src/blocked-slots.ts](functions/src/blocked-slots.ts) | **Modificar** — agregar `deleteBlockedSlot` onCall |
| [functions/src/index.ts](functions/src/index.ts) | **Modificar** — exportar `deleteBlockedSlot` |
| [components/booking/CancelBookingSheet.tsx](components/booking/CancelBookingSheet.tsx) | **Nuevo** — bottom sheet con chips + textarea |
| [components/booking/DeleteBlockedSlotSheet.tsx](components/booking/DeleteBlockedSlotSheet.tsx) | **Nuevo** — confirmación de delete (puntual/instancia/recurrencia) |
| [app/bookings/[id]/page.tsx](app/bookings/[id]/page.tsx) | **Modificar** — usar `CancelBookingSheet`; mostrar motivo + actor cuando `cancelled` |
| [app/venues/admin/[id]/page.tsx](app/venues/admin/[id]/page.tsx) | **Modificar** — wiring de sheets en clicks de rows |
| [components/booking/AdminBookingCalendar.tsx](components/booking/AdminBookingCalendar.tsx) | **Modificar** — rows clickables, callback `onBookingClick` / `onBlockClick` |
| [components/booking/AdminSlotPicker.tsx](components/booking/AdminSlotPicker.tsx) | **Modificar** — al tocar slot ocupado abrir sheet apropiado en lugar de no hacer nada |
| [lib/analytics.ts](lib/analytics.ts) | **Modificar** — eventos nuevos y actualización de `booking_cancelled` |
| [firestore.rules](firestore.rules) | **Modificar** — bloquear write/delete directo en `blocked_slots` |

---

## ⚠️ Decisiones de Diseño Clave

Antes de implementar, confirma:

1. **Motivo obligatorio sin "Otro" preformateado**: el chip "Otro" no rellena el textarea (a diferencia de los demás), forzando al usuario a explicar. Alternativa rechazada: dejar "Otro" como atajo sin motivo (vacío) — pierde el valor de capturar contexto.

2. **Reembolso del admin ignora la regla 24h**: si admin cancela <24h antes, el jugador igual recibe reembolso completo a wallet. Justificación: no es culpa del jugador. Si esto resulta abusable (admins cancelando para "compensar" off-app), revisar.

3. **Bloqueos manuales sin notificación**: cuando admin elimina su propio bloqueo, no se notifica a nadie (no hay jugador). Si en el futuro se permite que el jugador "vea" reservas manuales con cliente nombrado, habría que notificar al cliente fuera del sistema (manual).

4. **Push notification es best-effort, no transaccional**: la cancelación se completa aunque el push falle. El jugador verá el cambio en su próximo open de app vía snapshot listener. Tradeoff: simplicidad y atomicidad vs. garantía de notificación.

5. **"Terminar recurrencia" preserva historial vía truncamiento de `endDate`**: en lugar de borrar el documento padre, se setea `endDate=ayer`. Las instancias pasadas siguen expandiéndose dentro del rango `[startDate, endDate]` para reportes/auditoría; las futuras quedan automáticamente fuera. No se necesita campo nuevo ni filtro adicional en `expandBlockedSlotsForDate`. Tradeoff: si en el futuro se quiere "reactivar" una recurrencia terminada, hay que editar el `endDate` manualmente — aceptable porque el caso de uso es raro y la UI puede exponer "Reactivar" si surge.
