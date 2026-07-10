# Feature: Comprobante Previo — La Aprobación del Admin Crea la Reserva

## 📋 Specification-Driven Development (SDD)

Invierte el flujo de reserva con abono: el jugador **paga y sube el comprobante ANTES** de enviar la reserva. La reserva nace como *solicitud* (`pending_approval`) **sin bloquear el slot**, y solo cuando un admin la aprueba se crea la reserva real (se asigna y bloquea el slot → `confirmed`).

> **Revisa y modifica**: [docs/RESERVAS_PAGO_EXTERNO_SDD.md](RESERVAS_PAGO_EXTERNO_SDD.md). Ese SDD introdujo el flujo `pending_payment → sube comprobante → pending_approval → deposit_confirmed → confirmed`. Este SDD lo **reemplaza** por `paga+sube comprobante → pending_approval (sin slot) → admin aprueba abono → deposit_confirmed (crea+bloquea slot) → confirmar asistencia → confirmed`. Las reglas superadas se listan en §12.

> **Alcance — qué reservas afecta**:
> - ✅ **Aplica**: Reservas de jugador vía `createBooking` en sedes con `depositRequired = true`.
> - ❌ **NO aplica**: Sedes con `depositRequired = false` (siguen yendo directo a `confirmed`, sin comprobante). Reservas manuales del admin (`blocked_slots`). Reservas legacy ya existentes en `pending_payment`/`deposit_confirmed` (se respetan hasta cerrarse; ver §12 migración).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Hoy el jugador reserva primero (el slot se bloquea en `pending_payment`) y **después** paga y sube el comprobante. Esto permite que un jugador "aparte" el slot sin haber pagado, tenga que gestionarse un TTL de expiración, y obliga al admin a distinguir entre reservas "sin comprobante" y "por aprobar".

El nuevo modelo trata la intención del jugador como una **solicitud de reserva**: paga por el canal externo (Nequi/transferencia/QR), sube el comprobante, y **solo entonces** puede enviar la solicitud. El slot **no se bloquea** mientras la solicitud está pendiente. La reserva "real" existe únicamente cuando un admin verifica el pago y la aprueba: ahí se asigna la cancha, se bloquea el slot y se confirma.

**Beneficios**:
- No hay slots "apartados" sin pago → menos no-shows y menos slots fantasma.
- El admin ve una sola cola homogénea (todas con comprobante) → decisión más simple.
- Desaparece el estado/tab "SIN COMPROBANTE" y su TTL de "sube antes de que expire".

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-01 | En sedes con `depositRequired = true`, **no se puede enviar la reserva sin haber subido un comprobante**. El comprobante es requisito previo. | CTA "Enviar solicitud" deshabilitado hasta subir comprobante |
| RN-02 | Al enviar, la reserva nace en `pending_approval` con el comprobante adjunto. **No bloquea el slot**: otros jugadores pueden seguir viendo y solicitando ese mismo horario. | Toast "Solicitud enviada · en revisión". Slot sigue disponible en el picker |
| RN-03 | Sedes con `depositRequired = false` → sin cambios: reserva directa a `confirmed`, sin comprobante. | Igual que hoy |
| RN-04 | Al crear la solicitud se notifica (push + in-app) a **todos los admins de la sede** (super admin + location admins asignados): "Nueva solicitud de reserva". | Notificación con deep-link a `/venues/admin/{id}?tab=pending` |
| RN-05 | La solicitud aparece en el tab **"Reservas pendientes"** del panel admin. **Ya no hay sub-tab "Sin comprobante"**: una sola lista, todas con comprobante. | Lista única de solicitudes `pending_approval` |
| RN-06 | Un admin **aprueba el abono** de la solicitud → se **revalida la disponibilidad del slot**, se asigna la cancha, se **bloquea el slot** y la reserva pasa a `deposit_confirmed` (abono confirmado). Se notifica al jugador "Abono confirmado". Luego el admin **confirma asistencia** (`deposit_confirmed → confirmed`) con el flujo existente. | Card sale de pendientes + push; la reserva aparece bloqueando el slot en el calendario |
| RN-07 | Si al aprobar el slot **ya no está disponible** (otra reserva se confirmó antes, o se creó un bloqueo), la aprobación **falla** con "El horario ya no está disponible". La solicitud queda pendiente para que el admin la rechace/cancele. | Toast de error en la card; la solicitud no cambia de estado |
| RN-08 | Como el slot no se bloquea, pueden coexistir **varias solicitudes pendientes para el mismo horario**. El admin decide manualmente cuál aprobar. Al aprobar una y confirmarse el slot, las demás del mismo horario **fallarán al aprobarse** (RN-07); el admin las rechaza. | Sin auto-rechazo. Card muestra hint "Puede haber otras solicitudes para este horario" si detecta solapamiento |
| RN-09 | Un admin **rechaza** la solicitud (motivo obligatorio, 5-500 chars) → la solicitud pasa a `cancelled` con el motivo visible. **No hay reintentos**: si el jugador quiere, crea una solicitud nueva desde cero. | Sheet de rechazo con motivo; card se desvanece; push al jugador con el motivo |
| RN-10 | Un jugador puede **cancelar su propia solicitud** mientras esté `pending_approval` (ej. se arrepintió / pagó de más). Pasa a `cancelled`. El abono se restituye fuera del app (igual que hoy, sin wallet). | Botón "Cancelar solicitud" en `/bookings/{id}` |
| RN-11 | El jugador **no puede** tener dos solicitudes `pending_approval` para el mismo `venue + fecha + horario` simultáneamente (evita duplicados por doble-tap o reintento accidental). | Segundo intento → error "Ya tienes una solicitud pendiente para ese horario" |
| RN-12 | Las solicitudes `pending_approval` **no expiran por ahora**: `expiresAt = null`. Permanecen en la cola hasta que un admin las apruebe/rechace o el jugador las cancele. No hay TTL ni cron de vencimiento para el flujo nuevo. (Reservible en el futuro si la cola se ensucia; el campo `expiresAt` y el cron legacy se conservan.) | La solicitud vive hasta acción manual |
| RN-13 | El comprobante se comprime cliente-side (max 1024px, JPEG 0.7, ≤ 200KB target, hard-limit 500KB) — igual que hoy. Solo `image/*`. | Spinner de compresión + preview |
| RN-14 | Los métodos de pago de la sede (Nequi/Bancolombia/QR…) se muestran **dentro del sheet de reserva**, antes de subir el comprobante (el jugador necesita a quién pagarle). Configuración de métodos: sin cambios (solo Super Admin edita). | Bloque "Paga con" + copy/QR dentro del `BookingConfirmSheet` |
| RN-15 | Si la sede con `depositRequired = true` **no tiene métodos de pago configurados**, se bloquea la creación de la solicitud: "Esta sede aún no configuró sus métodos de pago". | Estado bloqueado en el sheet |
| RN-16 | Se elimina del flujo nuevo `pending_payment`. La aprobación pasa a `deposit_confirmed` (abono confirmado) y bloquea el slot; **se conserva** el paso "Confirmar asistencia" (`deposit_confirmed → confirmed`) con el flujo existente. | Card "Abono confirmado · asistencia por confirmar" + botón "Confirmar asistencia" |

---

## 2. ESCALABILIDAD

### Volumen esperado

- Sedes activas fase inicial: 5-20. Solicitudes/sede/día: 5-30.
- Solicitudes pendientes vivas por sede en cualquier momento: típicamente < 20.
- Comprobante promedio tras compresión: ~150KB. Retención Storage: 90 días (lifecycle existente).
- El cambio **reduce** escrituras vs. el flujo actual: se elimina la transición `pending_payment → pending_approval` (un `update` menos por reserva) y el ciclo de rechazo→reintento.

### Índices Firestore requeridos

```
// Cola de solicitudes pendientes de un venue (vista admin) — YA EXISTE del SDD previo
bookings: [venueId ASC, status ASC, createdAt DESC]

// (El índice [status ASC, expiresAt ASC] del cron legacy se conserva pero NO se usa
//  para el flujo nuevo — las solicitudes no expiran, ver RN-12.)

// Detección de solicitud duplicada del mismo jugador (RN-11)
// Se resuelve dentro de la query de overlap por venue+date de createBooking (ya se lee esa lista),
// filtrando por bookedBy === uid en memoria. NO requiere índice nuevo.
```

No se agregan índices nuevos respecto al SDD previo.

### Paginación

- Vista admin "Reservas pendientes": normalmente < 20 ítems; se mantiene el `subscribeToPendingBookings` con snapshot en vivo (sin cursor). Si una sede superara ~50 pendientes, se agrega `limit(50)` + orden `createdAt DESC`.

---

## 3. CONCURRENCIA SEGURA

### 3.1 `createBooking` (solicitud, sin bloquear slot)

```
Escenario: Dos jugadores solicitan el mismo horario a la vez.

1. READ venue (depositRequired, TTL, paymentMethods).
2. VALIDATE: proofURL presente (si depositRequired).
3. runTransaction:
   a. Query bookings del venue+fecha con status ∈ SLOT_BLOCKING (confirmed, played) + blocked_slots.
   b. Validar que EXISTE una asignación de cancha posible (allocateCourts) contra
      lo que YA está bloqueado. Las otras solicitudes pending_approval NO cuentan como ocupado.
   c. Validar RN-11: el mismo bookedBy no tiene otra pending_approval para ese slot.
   d. WRITE booking status="pending_approval", courtIds=tentativos, proofURL,
      expiresAt=null (no expira, RN-12). NO bloquea el slot (pending_approval ∉ SLOT_BLOCKING).

Resultado: ambas solicitudes se crean sin conflicto (es correcto: son solo solicitudes).
El slot se disputa recién en la aprobación (3.2).
```

> **Nota**: la asignación de cancha en creación es **tentativa** (para UX y para rechazar solicitar un horario ya confirmado/bloqueado). La asignación **vinculante** ocurre en la aprobación.

### 3.2 `approveBooking` (aprobación crea+bloquea la reserva) — **operación crítica**

```
Escenario: Admin aprueba una solicitud para un horario que otra reserva ya tomó.

1. runTransaction:
   a. READ booking; assertVenueAdmin; status === "pending_approval".
   b. Query bookings del venue+fecha con status ∈ SLOT_BLOCKING (confirmed, played) + blocked_slots.
   c. allocateCourts() contra lo ocupado FRESCO.
      - Si NO hay asignación → HttpsError("failed-precondition", "El horario ya no está disponible").
   d. WRITE status="confirmed", courtIds/courtNames = asignación fresca, approvedBy/At,
      attendanceConfirmedBy/At = admin, expiresAt=null.

La transacción relee el estado fresco → la segunda aprobación del mismo slot ve la
cancha ocupada por la primera confirmada y falla (RN-07).
```

> **Límite conocido (phantom write)**: si **dos admins aprueban dos solicitudes distintas del mismo slot en el mismísimo instante**, las queries de ambas transacciones pueden no "ver" la escritura de la otra (Firestore no bloquea documentos que aún no existen). Es el **mismo riesgo pre-existente** de `createBooking` en el SDD previo y se acepta por el bajísimo nivel de concurrencia (aprobación es acción manual, rara vez simultánea entre dos admins sobre el mismo horario). Mitigación futura si se vuelve real: lock determinístico por slot (`slot_locks/{venueId}_{date}_{start}`), leído+escrito en la transacción. **Fuera de alcance de este SDD.**

### 3.3 `rejectBookingRequest` (rechazo → cancelled)

```
1. runTransaction:
   a. READ booking; assertVenueAdmin; status === "pending_approval".
   b. WRITE status="cancelled", cancellationReason=motivo, cancelledByRole="admin",
      lastRejectionReason=motivo, lastRejectionAt=now.
No toca slots (no había nada bloqueado). Idempotente vía guard de status.
```

### 3.4 `expirePendingBookings` (cron legacy) — sin cambios para el flujo nuevo

```
Las solicitudes nuevas (pending_approval, expiresAt=null) NO expiran (RN-12).
El cron sigue existiendo solo para reservas LEGACY (pending_payment con expiresAt),
que mantiene su comportamiento actual. No se le agrega pending_approval al filtro.
```

### Operaciones seguras sin transacción

- Listar solicitudes pendientes (solo lectura, snapshot en vivo).
- Push/in-app notifications (best-effort, fuera de transacción).

---

## 4. SEGURIDAD

### Autenticación y autorización

| Acción | Quién | Validación |
|--------|-------|------------|
| Crear solicitud (con comprobante) | Usuario autenticado | Cloud Function `request.auth` + `bookedBy = uid` |
| Cancelar la propia solicitud | Dueño | `booking.bookedBy === uid` |
| Aprobar / rechazar solicitud | Super admin o location admin asignado | `assertVenueAdmin(uid, venueId)` |
| Ver comprobante de una solicitud | Dueño o admin del venue | Lectura de `bookings` restringida por Firestore Rule; URL con token |
| Configurar métodos de pago | Solo Super Admin | Sin cambios (SDD previo) |

### Firestore Rules

Sin cambios respecto al SDD previo — `bookings` sigue siendo **write-only por Cloud Functions**:

```javascript
match /bookings/{bookingId} {
  allow read: if request.auth != null &&
    (resource.data.bookedBy == request.auth.uid || isVenueAdmin(resource.data.venueId));
  allow create, update, delete: if false; // solo Cloud Functions
}
```

Storage Rules de `payment_proofs/**`: **sin cambios** (write autenticado + `image/*` + ≤ 500KB; validación real de dueño/estado en la Cloud Function). Ver SDD previo §4.

> **Cambio de path de comprobante**: como ahora el comprobante se sube **antes** de que exista el `bookingId`, el path pasa de `payment_proofs/{venueId}/{bookingId}_{ts}.jpg` a `payment_proofs/{venueId}/{uid}_{ts}.jpg`. Los comprobantes huérfanos (subidos sin llegar a crear solicitud) se limpian con el lifecycle de 90 días. Sin impacto en las reglas (el glob es `{fileName}`).

### Validaciones de input (Cloud Function `createBooking`)

| Campo | Validación |
|-------|-----------|
| `proofURL` | Requerido si `depositRequired`. String, `startsWith("http")`, prefijo del bucket propio `payment_proofs/{venueId}/`. |
| `venueId/format/date/startTime/endTime` | Igual que hoy (regex fecha/hora, no pasado, dentro del schedule). |
| Solicitud duplicada (RN-11) | No existe otra `pending_approval` del mismo `bookedBy` para ese slot. |

### Datos sensibles

- Comprobantes: datos bancarios del jugador → solo dueño + admin del venue. Nunca listados públicamente.

---

## 5. TOLERANCIA A FALLOS

| Error | Causa | Fallback UI |
|-------|-------|-------------|
| Compresión falla | Imagen corrupta / navegador viejo | Toast "No pudimos preparar la imagen, intenta otra foto"; CTA sigue deshabilitado |
| Upload Storage falla | Sin conexión / > 500KB | Toast "Error al subir comprobante" + botón reintentar; CTA deshabilitado |
| `createBooking` falla tras subir comprobante | Slot ya confirmado / duplicado / red | Toast con mensaje del server; el comprobante ya subido queda huérfano (lifecycle lo limpia); el jugador puede reintentar |
| Aprobación falla por slot no disponible (RN-07) | Otra reserva se confirmó antes | Toast "El horario ya no está disponible"; admin rechaza la solicitud |
| Sede sin métodos de pago (RN-15) | Config incompleta | Sheet muestra estado bloqueado, sin uploader |
| Push al jugador/admin falla | FCM token muerto | Se conserva la notificación in-app (Centro de Notificaciones); el estado en Firestore es la fuente de verdad |
| Cron de expiración falla | Timeout de Functions | Reintenta en el siguiente ciclo (5 min). Idempotente |

### Degradación elegante

- Storage caído → deshabilitar uploader con banner "Servicio de comprobantes no disponible, intenta más tarde". No se puede enviar solicitud (el comprobante es requisito).
- Real-time de la cola admin caído → skeleton/último snapshot; al reconectar, `onSnapshot` re-emite.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (jugador)

```
PASO 1 — BookingConfirmSheet (ahora con pago + comprobante)
┌─────────────────────────────────────┐
│  Solicitar reserva                   │
│  📅 Vie 5 Jun · 18:00–19:00 · 6v6    │
│  💰 Precio: $80.000                   │
│  🔒 Abono (30%): $24.000              │
│  💵 Resto en sede: $56.000            │
│                                      │
│  ── Paga tu abono a: ──              │
│  💜 Nequi · María García             │
│     311 234 5678         [Copiar][QR]│
│  🏦 Bancolombia · 1234-5678  [Copiar]│
│                                      │
│  ── Sube tu comprobante ──  (requisito)│
│  ┌────────────────────────────────┐ │
│  │ 📷 Subir comprobante            │ │
│  └────────────────────────────────┘ │
│  (tras subir: preview + ✓)           │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Enviar solicitud   (disabled   │ │
│  │  hasta subir comprobante)       │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘

PASO 2 — Solicitud enviada (redirect a /bookings/{id})
"Solicitud enviada · en revisión"
Estado 🟠 "En revisión" + thumbnail comprobante + "El admin verificará tu pago"
[Cancelar solicitud]

PASO 3 — Admin aprueba → push "¡Reserva confirmada!" → card pasa a 🟢 Confirmada
   (o) Admin rechaza → push "Solicitud rechazada: <motivo>" → 🔴 Cancelada
```

### Flujo admin (aprobar/rechazar)

```
1. Push "Nueva solicitud de reserva" → /venues/admin/{id}?tab=pending
2. Lista única "Reservas pendientes" (todas con comprobante):
   ┌────────────────────────────────────┐
   │ 👤 Juan Pérez · 📅 Vie 5 Jun 18:00  │
   │ ⚽ 6v6 · 💰 $24.000                  │
   │ [thumbnail comprobante → fullscreen]│
   │ ⚠️ Puede haber otras solicitudes    │
   │    para este horario (si solapa)    │
   │ [Aprobar]        [Rechazar]         │
   └────────────────────────────────────┘
3. Aprobar → revalida slot → confirmed → card se desvanece → push jugador.
   Rechazar → sheet motivo → cancelled → card se desvanece → push jugador.
```

### Estados de UI

| Estado | Jugador `/bookings/[id]` | Card admin "Reservas pendientes" | Calendario admin (lista por hora) |
|--------|--------------------------|----------------------------------|-----------------------------------|
| `pending_approval` (nuevo) | 🟠 "En revisión" · comprobante · botón cancelar | Card con comprobante + Aprobar/Rechazar | **NO aparece** (no bloquea slot) |
| `confirmed` | 🟢 "Confirmada" · abono pagado · resto en sede | No aparece | 🟢 aparece, bloquea slot, avanzar estado |
| `cancelled` (rechazada/cancelada) | 🔴 "Cancelada" + motivo | No aparece | No aparece |
| `expired` (solo legacy) | ⚪ "Solicitud vencida" | No aparece | No aparece |
| `played` / `paid` / `no_show` | Igual que hoy | No aparece | Según hoy |

### Estados de carga / vacío / error

- **Sheet cargando métodos de pago**: skeleton de 2 filas.
- **Sheet subiendo comprobante**: progress + CTA deshabilitado.
- **Cola admin vacía**: empty state `Inbox` "Sin solicitudes pendientes · Cuando un jugador envíe una solicitud con comprobante, aparecerá acá".
- **Cola admin cargando**: skeleton existente.

### Mobile-first

- Uploader full-width ≥ 56px; preview con aspect-ratio; tap → fullscreen con zoom.
- Métodos de pago con tap-to-copy y tap-to-view-QR dentro del sheet (scroll interno `max-h-[90vh]`).
- `pb-24 md:pb-0`; inputs `text-base` (16px+).

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes

| Componente | Cambio | Notas |
|------------|--------|-------|
| `BookingConfirmSheet` | **MODIFICAR** | Integrar `PaymentMethodList` + `PaymentProofUploader`; CTA "Enviar solicitud" gated por `proofURL`; texto TTL → "El admin revisará tu comprobante" |
| `PaymentProofUploader` | **REUSAR** | Ya existe; se mueve del detalle de reserva al sheet; sube a `payment_proofs/{venueId}/{uid}_{ts}.jpg` y devuelve URL |
| `PaymentMethodList` / `PaymentMethodCard` | **REUSAR** | Ya existen; se renderizan dentro del sheet |
| `PendingBookingsAdminView` | **MODIFICAR** | Quitar sub-tabs; una sola lista `pending_approval`; empty state nuevo |
| `PendingBookingAdminCard` | **MODIFICAR** | Botón principal "Aprobar" → `approveBooking` (a `confirmed`); "Rechazar" → cancelled; hint de solapamiento (RN-08) |
| `RejectProofSheet` | **REUSAR/renombrar** | Ahora rechaza → `cancelled` (no reintento). Copy: "Rechazar solicitud" |
| `app/bookings/[id]/page.tsx` | **MODIFICAR** | `pending_approval` = "En revisión" (sin uploader; ya se subió al crear) + botón "Cancelar solicitud" |
| `BookingExpirationTimer` | **REUSAR** | Opcional en la card admin para mostrar cuánto falta para vencer la solicitud |

### Animaciones (Framer Motion)

| Elemento | Tipo | Detalle |
|----------|------|---------|
| Comprobante recién subido (sheet) | Fade + scale-in | `initial {opacity:0, scale:0.9}` → `animate {opacity:1, scale:1}` |
| Card admin tras aprobar/rechazar | Slide-out + fade | `exit {x:300, opacity:0}` dentro de `AnimatePresence` |
| CTA "Enviar solicitud" al habilitarse | Cross-fade de color 200ms | de `bg-slate-200` a `bg-[#1f7a4f]` |
| Cambio de estado del booking | Color cross-fade badge 300ms | patrón existente |

### Responsive

- Mobile (< md): bottom sheet, lista 1 col, thumbnail 100%.
- Desktop (md+): sheet como modal centrado; cola admin en grid 2 col; thumbnail max 320px.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `booking_request_created` | Solicitud creada con comprobante | `venue_id`, `booking_id`, `format`, `deposit_cop` |
| `payment_proof_uploaded` | Comprobante subido en el sheet (pre-solicitud) | `venue_id`, `file_size_kb` |
| `payment_proof_upload_failed` | Falla compresión/upload | `venue_id`, `reason` |
| `booking_request_approved` | Admin aprueba → confirmed | `venue_id`, `booking_id`, `time_to_approve_minutes` |
| `booking_request_rejected` | Admin rechaza → cancelled | `venue_id`, `booking_id`, `reason_category` |
| `booking_request_self_cancelled` | Jugador cancela su solicitud | `venue_id`, `booking_id` |

> Mantener `snake_case` y `initAnalytics()` lazy. Deprecar (dejar de emitir) `booking_pending_created`, `booking_approved` (paso deposit), `booking_proof_rejected` del flujo viejo.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos — cambios

```typescript
// BookingStatus: se agrega "free" (Gratis) como cierre alternativo post-juego (cortesía,
// espeja el "free" de reservas manuales; badge morado). En el flujo NUEVO se emiten:
//   pending_approval → deposit_confirmed → confirmed → played → paid | free | no_show | cancelled | expired
// Se DEJA DE EMITIR (queda solo para legacy): pending_payment.
// Nota: el metric analytics "canchas gratis" hoy solo cuenta reservas MANUALES
// (blocked_slots); las online marcadas "free" aún no se agregan a ese cálculo.

// Booking: campos existentes suficientes. paymentProofURL/paymentProofUploadedAt
// ahora se setean EN LA CREACIÓN (no en un update posterior).
// courtIds/courtNames en pending_approval son TENTATIVOS; se re-asignan al aprobar.
```

### Capa de dominio (`lib/domain/booking.ts`)

| Cambio | Detalle |
|--------|---------|
| `SLOT_BLOCKING_STATUSES` | **QUITAR** `pending_payment`, `pending_approval`. Queda `["deposit_confirmed", "confirmed", "played"]`. **← cambio central**: las solicitudes `pending_approval` no bloquean; el slot se bloquea al aprobar el abono (`deposit_confirmed`) |
| `PRE_GAME_ACTIVE_STATUSES` | Revisar usos; `pending_approval` sigue siendo "pre-juego" para el jugador pero NO bloqueante |
| `canApproveBookingDeposit` → `canApproveBookingRequest` | Sigue: `status === "pending_approval"` |
| `canRejectPaymentProof` → `canRejectBookingRequest` | Sigue: `status === "pending_approval"` (ahora → cancelled) |
| `canUploadPaymentProof`, `canConfirmAttendance`, `hasRemainingProofAttempts`, `MAX_PAYMENT_PROOF_ATTEMPTS` | Quedan para **legacy**; no se usan en el flujo nuevo |
| Tests | Actualizar `lib/domain/booking` tests para el nuevo `SLOT_BLOCKING_STATUSES` |

### Capa de API (`lib/bookings.ts`, `lib/storage.ts`)

| Cambio | Detalle |
|--------|---------|
| `createBooking(input)` | Agregar `proofURL?: string` al input; el cliente lo envía cuando `depositRequired` |
| Helper de upload | Reusar `lib/storage.ts` con path `payment_proofs/{venueId}/{uid}_{ts}.jpg` (sube antes de crear el booking) |
| `subscribeToPendingBookings(venueId)` | Query pasa a `status == "pending_approval"` (una sola). Mantener compat leyendo legacy `pending_payment` si se decide mostrarlos aparte |
| `approveBookingRequest(bookingId)` | Wrapper del onCall renombrado |
| `rejectBookingRequest(bookingId, reason)` | Wrapper del onCall |

### Cloud Functions (`functions/src/bookings.ts`)

| Función | Cambio |
|---------|--------|
| `createBooking` | **MODIFICAR**: si `depositRequired` → exigir `proofURL`; `initialStatus = "pending_approval"`; setear `paymentProofURL`/`paymentProofUploadedAt`; NO contar pending como ocupado (usar `SLOT_BLOCKING` = confirmed/played); validar RN-11 (no duplicada); notificar admins "Nueva solicitud de reserva" y jugador "Solicitud enviada" |
| `approveBookingDeposit` | **MODIFICAR**: `pending_approval → deposit_confirmed`; **re-allocate courts** contra estado fresco (bloquea slot); si no hay slot → `failed-precondition` (RN-07); setear `approvedBy/At`; notificar jugador "Abono confirmado" |
| `confirmBookingAttendance` | **ACTIVA**: `deposit_confirmed → confirmed` (paso de confirmar asistencia, flujo existente) |
| `rejectPaymentProof` → **`rejectBookingRequest`** | **MODIFICAR**: `pending_approval → cancelled` con motivo (sin history/reintentos); notificar jugador con motivo |
| `uploadPaymentProof` | **DEPRECAR** (solo legacy `pending_payment`); el comprobante nuevo se sube en el cliente antes de `createBooking` |
| `expirePendingBookings` | **SIN CAMBIOS**: solo maneja legacy `pending_payment`. Las solicitudes nuevas no expiran (RN-12) |
| `cancelBooking` | Sin cambios estructurales; `pending_approval` ya está en `cancellableStates` |

### Componentes UI

Ver tabla §7. Archivos: `components/booking/BookingConfirmSheet.tsx`, `PendingBookingsAdminView.tsx`, `PendingBookingAdminCard.tsx`, `RejectProofSheet.tsx`, `app/bookings/[id]/page.tsx`, `app/venues/[id]/page.tsx` (handler que sube comprobante + llama `createBooking`).

---

## 10. CRITERIOS DE ACEPTACIÓN

### Jugador
- [ ] En sede con depósito, NO puede enviar la reserva sin subir comprobante (CTA gated).
- [ ] Ve los métodos de pago dentro del sheet con copy/QR antes de subir.
- [ ] Al enviar, ve "Solicitud enviada · en revisión" y el estado 🟠 con thumbnail.
- [ ] El slot que solicitó **sigue apareciendo disponible** para otros (no se bloquea).
- [ ] Puede cancelar su propia solicitud mientras esté en revisión.
- [ ] Recibe push "Reserva confirmada" cuando el admin aprueba.
- [ ] Recibe push "Solicitud rechazada: <motivo>" cuando el admin rechaza.
- [ ] No puede crear dos solicitudes para el mismo horario.
- [ ] En sede sin depósito, reserva directo sin comprobante (sin cambios).

### Admin
- [ ] Recibe push "Nueva solicitud de reserva" al crearse.
- [ ] Ve una sola lista "Reservas pendientes" (sin sub-tab "Sin comprobante").
- [ ] Cada card muestra el comprobante (tap → fullscreen).
- [ ] "Aprobar abono" revalida el slot, lo bloquea y pasa la reserva a `deposit_confirmed`; luego "Confirmar asistencia" la pasa a `confirmed`.
- [ ] Si el slot ya no está disponible, "Aprobar" falla con mensaje claro.
- [ ] "Rechazar" con motivo obligatorio pasa la solicitud a `cancelled`.

### Sistema
- [ ] `SLOT_BLOCKING_STATUSES` = `["deposit_confirmed", "confirmed", "played"]`; las solicitudes `pending_approval` no bloquean el slot.
- [ ] Las solicitudes `pending_approval` nacen con `expiresAt = null` y no expiran.
- [ ] Reservas legacy (`pending_payment`/`deposit_confirmed`) siguen visibles/gestionables.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/booking.ts` | `SLOT_BLOCKING_STATUSES` → `["deposit_confirmed","confirmed","played"]`; renombres de helpers; docs |
| `lib/domain/booking.test.ts` (o equivalente) | Actualizar tests de blocking/transiciones |
| `lib/bookings.ts` | `createBooking` acepta `proofURL`; `subscribe` a `pending_approval`; wrappers approve/reject |
| `lib/storage.ts` | Upload de comprobante pre-booking (`{uid}_{ts}`) |
| `functions/src/bookings.ts` | `createBooking`, `approveBooking`, `rejectBookingRequest`, `expirePendingBookings`; deprecar `uploadPaymentProof`/`confirmBookingAttendance` |
| `functions/src/index.ts` | Exportar funciones renombradas (mantener alias legacy si hay clientes viejos desplegados) |
| `components/booking/BookingConfirmSheet.tsx` | Integrar métodos de pago + uploader; CTA gated |
| `components/booking/PendingBookingsAdminView.tsx` | Quitar sub-tabs; lista única |
| `components/booking/PendingBookingAdminCard.tsx` | Aprobar→confirmed; hint solapamiento |
| `components/booking/RejectProofSheet.tsx` | Rechazo → cancelled |
| `app/bookings/[id]/page.tsx` | `pending_approval` = "En revisión" + cancelar solicitud |
| `app/venues/[id]/page.tsx` | Handler: subir comprobante → `createBooking({..., proofURL})` |
| `lib/analytics.ts` | Nuevos eventos `booking_request_*` |

---

## 12. RELACIÓN CON EL SDD PREVIO — REGLAS SUPERADAS

De [RESERVAS_PAGO_EXTERNO_SDD.md](RESERVAS_PAGO_EXTERNO_SDD.md):

| Regla previa | Estado |
|--------------|--------|
| RN-01 (reserva nace en `pending_payment`, slot bloqueado, countdown) | **Superada**: nace en `pending_approval`, slot NO bloqueado |
| RN-05 (jugador sube comprobante DESPUÉS, en la reserva pendiente) | **Superada**: sube ANTES, en el sheet |
| RN-08 (dos sub-tabs "Por confirmar pago" / "Por aprobar") | **Superada**: una sola lista |
| RN-09 / RN-09b (aprobar abono → `deposit_confirmed` → confirmar asistencia → `confirmed`) | **Se conserva**: aprobar abono lleva a `deposit_confirmed` (ahora bloquea slot) y luego confirmar asistencia → `confirmed` |
| RN-12 (rechazo → vuelve a `pending_payment`, hasta 3 intentos) | **Superada**: rechazo → `cancelled`, sin reintentos |
| Estado `pending_payment` | **Legacy-only**: no se emite en el flujo nuevo, se conserva para datos existentes |

### Migración

- No se requiere backfill de datos. Las reservas existentes en `pending_payment`/`deposit_confirmed` siguen su ciclo con las funciones legacy (`uploadPaymentProof`, `confirmBookingAttendance`) hasta cerrarse.
- Deploy de functions + rules (proyecto `canchita-16772`) manual; frontend auto-deploy en push a `main`.

---

## 13. POLÍTICAS DE RESERVA (aceptación previa)

Antes de reservar, el jugador debe leer y **aceptar las políticas de la sede** (guayos, llegada 5 min antes, no reembolso, llave Bre-B, etc.).

### Reglas
| # | Regla | Impacto |
|---|-------|---------|
| POL-01 | Las políticas son **configurables por sede** (`venue.bookingPolicies: string[]`), editables por el location admin o super admin desde el panel. | Editor en el tab de configuración de la sede |
| POL-02 | Si la sede no configuró políticas (`bookingPolicies === undefined`), se muestran unas **por defecto** (`DEFAULT_BOOKING_POLICIES`). Un array **vacío** `[]` significa explícitamente "sin políticas" (no se pide aceptación). | `getEffectiveBookingPolicies(venue)` |
| POL-03 | En el `BookingConfirmSheet`, las políticas se muestran como lista + un **checkbox obligatorio** "He leído y acepto las políticas" que **bloquea el CTA** hasta marcarse (junto con el comprobante en sedes con depósito). | Checkbox gating |
| POL-04 | Al reservar se registra `booking.policiesAcceptedAt` (ISO). El server (`createBooking`) valida `policiesAccepted === true` si la sede tiene políticas efectivas. | Trazabilidad ante disputas (ej. no-reembolso) |
| POL-05 | Aplica a reservas con y sin depósito: si la sede tiene políticas, se piden siempre. | — |

### Modelo de datos
```typescript
// Venue
bookingPolicies?: string[];   // undefined ⇒ DEFAULT_BOOKING_POLICIES; [] ⇒ sin políticas
// Booking
policiesAcceptedAt?: string | null;
```

### Archivos
| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | + `bookingPolicies`, `DEFAULT_BOOKING_POLICIES`, `getEffectiveBookingPolicies()`, `validateBookingPolicies()` |
| `lib/domain/booking.ts` | + `policiesAcceptedAt` |
| `lib/venues.ts` | `updateVenueSettings` acepta `bookingPolicies` (valida) |
| `functions/src/bookings.ts` | `createBooking` valida `policiesAccepted` y guarda `policiesAcceptedAt` |
| `components/booking/BookingConfirmSheet.tsx` | Lista de políticas + checkbox gating |
| `components/booking/BookingPoliciesEditor.tsx` | **NUEVO** — editor (una política por línea + "usar sugeridas") |
| `app/venues/admin/[id]/page.tsx` | Render del editor en config + estado + payload |

> **Nota de implementación (analytics)**: para minimizar churn, el código reusa las funciones de logging existentes (`logBookingConfirmed`, `logBookingDepositApproved`, `logBookingProofRejected`, `logPaymentProof*`) en vez de emitir los nombres `booking_request_*` de §8. Los tipos de notificación in-app sí usan los nombres nuevos (`booking_request_created`, `booking_admin_request_created`, `booking_request_rejected`).

---

## ⚠️ Decisiones de Diseño Clave (revisar antes de implementar)

1. **El slot NO se bloquea mientras la solicitud está pendiente** — se bloquea recién al aprobar. Consecuencia deliberada (confirmada): pueden coexistir varias solicitudes por el mismo horario; el admin decide manual y al aprobar una, las demás fallarán al intentar aprobarse (RN-07/RN-08). No hay auto-rechazo.

2. **Aprobación en dos pasos**: el admin **aprueba el abono** (`pending_approval → deposit_confirmed`), lo que ya **bloquea el slot**, y luego **confirma asistencia** (`deposit_confirmed → confirmed`) con el flujo existente. (Iteración sobre la decisión original de un solo paso — se prefiere separar "verifiqué el pago" de "confirmé asistencia".)

3. **Rechazo = solicitud cancelada, sin reintentos**: el jugador que quiera reintentar crea una solicitud nueva desde cero (vuelve a pagar/subir). Se elimina el ciclo de 3 intentos.

4. **Comprobante se sube antes de existir el `bookingId`** → path `payment_proofs/{venueId}/{uid}_{ts}.jpg`. Comprobantes huérfanos (subió pero no envió solicitud, o `createBooking` falló) se limpian con el lifecycle de 90 días.

5. **Límite de concurrencia aceptado**: dos admins aprobando dos solicitudes del mismo slot en el mismísimo instante podrían generar doble booking (phantom write de Firestore). Se acepta por baja concurrencia real, igual que el `createBooking` actual. Mitigación futura documentada (lock por slot), fuera de alcance.

6. **Las solicitudes NO expiran** (decisión del usuario): `expiresAt = null`, sin cron de vencimiento. Viven hasta que el admin apruebe/rechace o el jugador cancele. Reservible en el futuro reactivando el TTL/cron legacy.

7. **Políticas configurables por sede + aceptación registrada** (decisión del usuario): `venue.bookingPolicies` editable por el admin (default = lista sugerida). Checkbox obligatorio en el sheet que registra `booking.policiesAcceptedAt`. Ver §13.
