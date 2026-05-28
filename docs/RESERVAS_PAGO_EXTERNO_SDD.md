# Feature: Reservas con Pago Externo y Aprobación de Admin

## 📋 Specification-Driven Development (SDD)

Permite al jugador crear una reserva sin pago digital inmediato; el depósito se paga en un canal externo (Nequi/transferencia/QR) y el location admin la aprueba tras verificar el comprobante.

> **Cambio de paradigma**: Reemplaza el flujo `createBooking → debita wallet → confirmed` por `createBooking → pending_payment → upload comprobante → pending_approval → admin aprueba → confirmed`. La wallet/Wompi se mantiene activa para otros usos pero deja de participar del booking flow.

> **Alcance — qué reservas afecta este SDD**:
> - ✅ **Aplica**: Reservas creadas por jugadores vía `createBooking` (colección `bookings`). Son las que tienen `depositRequired`, `paymentMethod`, etc.
> - ❌ **NO aplica**: Reservas manuales creadas por admins (colección `blocked_slots` con `clientName`/`clientPhone`/`priceCOP`). Esas viven en otro modelo, usan los estados `pending | confirmed | played | paid | no_show | free` y el admin las gestiona/cobra manualmente. Este SDD no toca su flujo.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Eliminar la barrera de pago digital en reservas: muchas sedes prefieren cobrar el depósito vía Nequi/Bancolombia/efectivo y no quieren obligar al usuario a recargar wallet con Wompi. Hoy el flujo `wallet_deposit` debita Wompi en la transacción de creación, lo cual:

- Excluye usuarios sin wallet recargada
- Bloquea reservas si la wallet no responde
- Asume que toda sede acepta pagos digitales

El nuevo flujo deja la reserva en `pending_payment`, le da al jugador los datos de pago (Nequi, cuenta bancaria, QR), recibe el comprobante en el app, notifica al admin, y la reserva queda `confirmed` cuando el admin verifica el pago.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-01 | Toda reserva nueva con depósito requerido inicia en estado `pending_payment`. La cancha queda asignada y bloqueada durante el TTL configurado | Badge amarillo "Pendiente de pago" + countdown |
| RN-02 | Si la sede tiene `depositRequired=false`, la reserva inicia directamente en `confirmed` (idéntico al flujo actual sin depósito) | Sin cambios |
| RN-03 | **Solo el Super Admin** puede configurar los métodos de pago de la sede: lista de tarjetas con tipo (Nequi/Bancolombia/Daviplata/Transferencia/Otro), titular, identificador (teléfono o número de cuenta), y un QR opcional por método. Los location admins pueden ver los métodos pero no editarlos (datos bancarios sensibles del dueño del negocio) | Editor en tab "Pagos" visible solo a Super Admin. Location admin ve los métodos en read-only con helper "Solo el Super Admin puede modificar los métodos de pago" |
| RN-04 | El location admin (o super admin) configura `pendingApprovalTTLHours` (1-24h, default 24). Si el jugador no sube comprobante en ese tiempo, la reserva pasa a `expired` y la cancha se libera automáticamente | Slider/input en panel admin de sede |
| RN-05 | El jugador puede subir un comprobante de pago (imagen) directamente en la reserva pendiente. Al subirlo, la reserva pasa a `pending_approval` y el TTL deja de correr (queda en manos del admin) | Botón grande "Subir comprobante" + preview tras upload |
| RN-06 | Adicionalmente al upload, el jugador puede tocar "Avisar por WhatsApp" que abre un deep-link `wa.me/<numero>` con un mensaje pre-llenado con los datos de la reserva. El número WhatsApp es opcional en la configuración de la sede | Botón secundario "Avisar al admin por WhatsApp", visible solo si la sede configuró número |
| RN-07 | El admin recibe push notification cuando una reserva entra a `pending_payment` ("Nueva reserva pendiente de pago") y otra cuando entra a `pending_approval` ("Comprobante listo para revisar") | Notificaciones en Centro de Notificaciones del app |
| RN-08 | Desde el panel admin del venue, el admin tiene una vista "Reservas pendientes" con dos pestañas: "Por confirmar pago" (sin comprobante) y "Por aprobar" (con comprobante). Cada card muestra: jugador, fecha/hora, formato, monto depósito, y acciones contextuales | Nueva tab/sección en `/venues/admin/[id]` |
| RN-09 | El admin puede: **Aprobar abono** (de `pending_approval` pasa a `deposit_confirmed`), **Rechazar el comprobante** (vuelve a `pending_payment` con motivo visible y nuevo TTL), o **Cancelar la reserva** (motivo obligatorio, pasa a `cancelled`) | Botones inline en cada card |
| RN-09b | Tras `deposit_confirmed`, el admin **confirma asistencia** con el cliente (típicamente cerca del slot, por llamada o WhatsApp). Al marcar "Confirmar asistencia" la reserva pasa a `confirmed`. Esto evita marcar como confirmada una reserva pagada con días de anticipación cuya asistencia aún no se validó. La acción es 100% manual: no hay cron de recordatorio — el admin gestiona desde la card del calendario o la vista de pendientes en su rutina | Botón "Confirmar asistencia" en card admin |
| RN-09c | Tras el slot (post-juego), el admin avanza manualmente el ciclo financiero: `confirmed → played → paid`, o marca `no_show` si el cliente no asistió. Mismo patrón que las reservas manuales ([AdminBlockCard.tsx](components/booking/AdminBlockCard.tsx)) — botón "Avanzar estado" en la card | Reusa el flujo de avance + RegisterPaymentSheet existente para el paso a `paid` |
| RN-10 | El comprobante se comprime cliente-side antes de subir: max 1024px lado largo, JPEG calidad 0.7, target ≤ 200KB. Solo se acepta `image/*`. Tras compresión, el archivo no puede superar 500KB | Spinner durante compresión + error si el archivo no se puede reducir |
| RN-11 | Los comprobantes en Firebase Storage tienen lifecycle rule de 3 meses (90 días). Pasado ese tiempo, se borran automáticamente. La booking conserva la metadata (fecha de subida, quién aprobó) pero la imagen ya no es accesible | Card de booking pasada muestra "Comprobante archivado" en vez del thumbnail |
| RN-12 | Un comprobante rechazado se mueve a `paymentProofHistory` (subcolección o array). El jugador puede reintentar subiendo otro. Máximo 3 intentos por reserva — al 4to, la reserva se marca `expired` y libera la cancha | Banner rojo con motivo del rechazo + botón "Subir otro" |
| RN-13 | Las reservas creadas antes de este cambio (`paymentMethod === "wallet_deposit"`) siguen funcionando sin cambios: visualización del histórico intacta. El flujo nuevo NO emite `paymentMethod === "wallet_deposit"` | Histórico legacy renderizado igual; nuevas reservas con `paymentMethod === "external_deposit"` |
| RN-14 | La wallet sigue activa para recargas y otros usos. NO se debita ni acredita en el nuevo flujo de booking. El reembolso por cancelación con > 24h ya no aplica (no hay nada que reembolsar) — la reserva simplemente se cancela | Modal de cancelación: ya no muestra "Se reembolsará tu depósito" |
| RN-15 | Si el admin del venue es Super Admin o Location Admin asignado, recibe la notificación. Si hay múltiples admins, todos reciben la notificación | Fanout en Cloud Function al crear/actualizar booking |
| RN-16 | **Visual de origen**: toda card de reserva (jugador y admin) debe indicar claramente si fue creada por jugador vía web (`bookings`) o creada manualmente por admin (`blocked_slots`). Player bookings: badge "🌐 Reserva web" + avatar del jugador. Manual: badge "✏️ Reserva manual" + nombre del cliente walk-in | Badge superior izquierdo en cada card; usar [SportBadge.tsx](components/booking/SportBadge.tsx) como patrón |
| RN-17 | **Visual del abono**: en toda reserva con `deposit_confirmed` o posterior, mostrar prominente `depositCOP` con label "Abono pagado: $X" y `remainingCOP` con "Resto en sede: $Y". El jugador ve el desglose en su detalle de reserva; el admin lo ve en la card del calendario y en la vista pendientes | Bloque destacado con fondo verde tenue + iconos 💰 |

---

## 2. ESCALABILIDAD

### Volumen esperado

- **Pagos por mes (fase inicial)**: 100-500
- **Pagos por mes (escala)**: 1,000-5,000
- **Tamaño promedio de comprobante**: ~150KB (tras compresión cliente)
- **Retención**: 90 días (lifecycle rule de Firebase Storage)

### Costos Firebase Storage (proyección)

Con compresión cliente-side a 150KB/imagen y retención de 90 días:

| Volumen/mes | Storage acumulado (90 días) | Costo año 1 |
|-------------|------------------------------|-------------|
| 500 | 67 MB | < $0.02 |
| 2,000 | 270 MB | ~$0.10 |
| 5,000 | 675 MB | ~$0.25 |
| 10,000 | 1.35 GB | ~$0.50 |

Egress (descargas de comprobantes para revisión admin): cada admin descarga ~1 vez por aprobación → mismo orden de magnitud, despreciable.

### Colecciones Firestore — Cambios

| Colección/Campo | Cambio | Costo aproximado |
|-----------------|--------|------------------|
| `bookings/{id}.status` | Nuevos valores: `pending_approval` | Sin costo extra |
| `bookings/{id}.paymentProofURL` | Nuevo campo opcional | Sin costo extra |
| `bookings/{id}.paymentProofUploadedAt` | Nuevo campo opcional | Sin costo extra |
| `bookings/{id}.paymentProofHistory` | Array de intentos rechazados (max 3) | < 1KB por booking |
| `bookings/{id}.approvedBy` | Nuevo campo opcional (uid admin) | Sin costo extra |
| `bookings/{id}.approvedAt` | Nuevo campo opcional ISO | Sin costo extra |
| `venues/{id}.paymentMethods` | Array de hasta ~5 métodos | < 2KB por venue |
| `venues/{id}.pendingApprovalTTLHours` | Nuevo número (1-24) | Sin costo extra |
| `venues/{id}.whatsappNotificationNumber` | Nuevo string opcional E.164 | Sin costo extra |

### Índices Firestore requeridos

```
// Reservas pendientes de pago/aprobación de un venue (para vista admin)
bookings: [venueId ASC, status ASC, createdAt DESC]

// Reservas pendientes de pago que pueden expirar (job programado)
bookings: [status ASC, expiresAt ASC]

// Reservas de un jugador con estado pendiente (badge en home)
bookings: [bookedBy ASC, status ASC, date ASC]
```

### Paginación

- **Vista admin "Reservas pendientes"**: cursor por `createdAt` DESC, limit 50 (normalmente caben todas en una sola página)
- **Lista del jugador**: cursor existente por `date` DESC (sin cambios)

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

#### 3.1 `createBooking` — sin debitar wallet
```
Escenario: Dos usuarios reservan el mismo slot simultáneamente.

1. READ: bookings existentes para venue+date+overlap
2. READ: venue (depósito requerido + TTL + pricing)
3. VALIDATE: court disponible vía allocateCourts()
4. WRITE: crear booking con status="pending_payment", expiresAt=now+TTLHours

No hay debit de wallet. La cancha queda bloqueada por el campo
status ∈ ("pending_payment", "pending_approval", "confirmed").
```

#### 3.2 `uploadPaymentProof` (nueva onCall)
```
Escenario: Jugador sube comprobante mientras TTL está expirando o admin
ya canceló la reserva.

1. READ: booking actual
2. VALIDATE:
   - bookedBy === uid
   - status === "pending_payment"
   - expiresAt > now
   - paymentProofHistory.length < 3
3. WRITE: status = "pending_approval", paymentProofURL, paymentProofUploadedAt
   expiresAt = null (queda en manos del admin, ya no expira solo)

Si en paralelo el cron de expiración corre, una de las dos operaciones
re-lee y aborta. La transacción garantiza que el comprobante no quede
huérfano en Storage sin booking que lo referencie.
```

#### 3.3 `approveBooking` (nueva onCall, admin-only)
```
Escenario: Dos admins del mismo venue aprueban a la vez.

1. READ: booking + verificar admin permisos
2. VALIDATE:
   - admin del venue (assignedLocationIds o super_admin)
   - status === "pending_approval"
3. WRITE: status = "confirmed", approvedBy = adminUid, approvedAt = now

La transacción asegura que solo un admin "gana" — el segundo recibe
"failed-precondition" porque ya no está en pending_approval.
```

#### 3.4 `rejectPaymentProof` (nueva onCall, admin-only)
```
Escenario: Admin rechaza mientras jugador sube nuevo comprobante.

1. READ: booking
2. VALIDATE:
   - admin del venue
   - status === "pending_approval"
   - rejectionReason length >= 5
3. WRITE:
   - status = "pending_payment"
   - expiresAt = now + venue.pendingApprovalTTLHours (nuevo ciclo)
   - paymentProofHistory ← push { url, uploadedAt, rejectedAt, rejectionReason }
   - paymentProofURL = null, paymentProofUploadedAt = null

Si paymentProofHistory.length >= 3 después del push → status = "expired"
y liberación de cancha.
```

#### 3.5 `expirePendingBookings` (scheduled, cada 5min)
```
Escenario: TTL expira al mismo tiempo que jugador sube comprobante.

1. Query: bookings where status="pending_payment" AND expiresAt <= now
2. Para cada uno, runTransaction:
   - Re-leer booking
   - Si sigue en pending_payment y expirada → status = "expired"
   - Si ya cambió → skip

Idempotente: si la booking ya pasó a pending_approval o cancelled,
el cron no la toca.
```

### Operaciones seguras sin transacción

- **Listar reservas pendientes en panel admin**: Solo lectura
- **Notificaciones push al admin**: Best-effort, fuera de transacción
- **Lifecycle de Storage**: Lo maneja Firebase automáticamente

---

## 4. SEGURIDAD

### Autenticación y autorización

| Acción | Quién puede | Cómo se valida |
|--------|-------------|----------------|
| Crear reserva pendiente | Cualquier usuario autenticado | Cloud Function valida `request.auth` |
| Subir comprobante | Solo el dueño de la reserva | Storage Rule + Cloud Function `bookedBy === uid` |
| Ver comprobante de una reserva | Dueño de la reserva o admin del venue | Storage Rule custom |
| Aprobar/rechazar comprobante | Admin del venue (super_admin o location_admin asignado) | Cloud Function valida `user.adminType` + `assignedLocationIds.includes(venueId)` |
| Configurar métodos de pago de venue (`paymentMethods`) | **Solo Super Admin** | Firestore Rule + field-level check sobre `venues/{id}` |
| Configurar TTL y WhatsApp del venue | Super Admin o Location Admin asignado | Firestore Rule existente sobre `venues/{id}` |
| Ver listado de reservas pendientes | Admin del venue | Query con `where venueId == X` + Firestore Rule |

### Firestore Rules requeridas

```javascript
match /bookings/{bookingId} {
  // Lectura: dueño o admin del venue (sin cambios)
  allow read: if request.auth != null &&
    (resource.data.bookedBy == request.auth.uid || isVenueAdmin(resource.data.venueId));

  // Escritura: solo Cloud Functions (sin cambios)
  allow create: if false;
  allow update: if false;
  allow delete: if false;
}

match /venues/{venueId} {
  // Lectura: cualquier usuario autenticado (sin cambios)
  // Escritura general (TTL, WhatsApp, info venue): super admin o location admin asignado
  // Escritura de paymentMethods: SOLO super admin (datos bancarios sensibles del dueño)
  allow update: if isSuperAdmin() || (
    isLocationAdminOf(venueId) &&
    // Location admin no puede tocar paymentMethods
    !request.resource.data.diff(resource.data).affectedKeys().hasAny(['paymentMethods'])
  );
}
```

### Storage Rules

```javascript
// firebase.storage rules
service firebase.storage {
  match /b/{bucket}/o {
    match /payment_proofs/{venueId}/{fileName} {
      // Lectura: dueño de la reserva o admin del venue
      allow read: if request.auth != null &&
        (
          // Match {bookingId}_{ts}.{ext} → resolver booking
          isPaymentProofOwner(venueId, fileName) ||
          isVenueAdmin(venueId)
        );

      // Escritura: solo el dueño de la reserva, max 500KB, solo imagen
      allow write: if request.auth != null &&
        request.resource.size <= 500 * 1024 &&
        request.resource.contentType.matches('image/.*') &&
        isPaymentProofOwner(venueId, fileName);
    }
  }

  function isVenueAdmin(venueId) {
    let userDoc = firestore.get(/databases/(default)/documents/users/$(request.auth.uid));
    return userDoc.data.adminType == 'super_admin' ||
      (userDoc.data.adminType == 'location_admin' &&
       userDoc.data.assignedLocationIds.hasAny([venueId]));
  }

  function isPaymentProofOwner(venueId, fileName) {
    // Convención: bookingId es el prefijo del fileName, antes del primer "_"
    let bookingId = fileName.split('_')[0];
    let bookingDoc = firestore.get(/databases/(default)/documents/bookings/$(bookingId));
    return bookingDoc.data.bookedBy == request.auth.uid;
  }
}
```

### Validaciones de input

| Campo | Validación | Dónde |
|-------|-----------|-------|
| `paymentProofURL` | URL válida del bucket propio, max 500KB | Storage Rule + Cloud Function valida prefijo |
| `paymentMethods[].accountIdentifier` | String 1-50 chars | Client + Cloud Function |
| `paymentMethods[].qrImageURL` | Si presente, URL del bucket de venue assets | Cloud Function |
| `pendingApprovalTTLHours` | Integer 1-24 | Client + Cloud Function |
| `whatsappNotificationNumber` | E.164 opcional (`^\+?[0-9]{8,15}$`) | Client + Cloud Function |
| `rejectionReason` | 5-500 chars | Cloud Function |

### Datos sensibles

- **Comprobantes en Storage**: contienen datos bancarios del usuario (número de Nequi, screenshot del banco). Acceso restringido a dueño + admin del venue. **Nunca** listados públicamente.
- **paymentMethods del venue**: datos bancarios del owner del venue, visibles solo a usuarios autenticados que entran a hacer la reserva (no listados en API pública).

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Compresión cliente falla | Imagen corrupta o navegador antiguo | Toast "No pudimos preparar la imagen, intenta otra foto" |
| Upload Storage falla | Sin conexión, archivo > 500KB tras compresión | Toast "Error al subir comprobante" + retry button |
| TTL expiró durante upload | Tardanza del usuario | Toast "Tu reserva expiró. Si quieres, intenta de nuevo desde la sede" + redirect a `/venues` |
| Admin rechaza y jugador no se entera | Push falla, jugador no entra al app | Banner persistente en card de booking + Centro de Notificaciones |
| Admin no aprueba en mucho tiempo | Admin inactivo | Card de booking muestra "En revisión hace X días" + botón "Avisar al admin" (WhatsApp si disponible) |
| Múltiples comprobantes rechazados | Comprobantes ilegibles / pagos no recibidos | A los 3 rechazos, reserva → `expired`, slot liberado, toast "Reserva cancelada por múltiples rechazos" |
| Cron de expiración falla | Cloud Functions timeout | Re-corre en siguiente ciclo (5min). Idempotente. |

### Retry strategy

- **uploadPaymentProof**: 1 retry automático tras 3s (idempotente — sobrescribe `paymentProofURL`)
- **approveBooking / rejectPaymentProof**: NO retry automático (acción explícita del admin). Toast con botón retry manual.
- **Compresión cliente**: Sin retry (síncrona). Mostrar error directo.

### Degradación elegante

- Si Storage no responde: deshabilitar botón "Subir comprobante" + banner "Servicio de upload temporalmente no disponible. Intenta avisar por WhatsApp"
- Si el venue no tiene `whatsappNotificationNumber` configurado: ocultar botón WhatsApp (no mostrar disabled — confunde)
- Si el venue no tiene `paymentMethods` configurados: bloquear la creación de reservas con depósito y mostrar al jugador "Esta sede aún no configuró sus métodos de pago, contacta directamente"

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal: Reservar y pagar externamente

```
PASO 1: Confirmación de reserva (BookingConfirmSheet)
┌─────────────────────────────────┐
│  Confirmar reserva               │
│                                  │
│  📅 Vie 5 Jun · 18:00–19:00     │
│  ⚽ 6v6 · Sede Los Pinos        │
│                                  │
│  💰 Precio cancha: $80.000       │
│  🔒 Depósito (30%): $24.000      │
│  💵 Resto en sede: $56.000       │
│                                  │
│  ⏱ Tendrás 24h para enviar      │
│     el comprobante de pago       │
│                                  │
│  ┌────────────────────────────┐ │
│  │  ✓ Reservar y pagar luego  │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘

PASO 2: Detalle reserva pendiente (auto-redirect)
┌─────────────────────────────────┐
│  Reserva pendiente de pago       │
│  ⏱ Quedan 23h 47min              │
│                                  │
│  📅 Vie 5 Jun · 18:00–19:00     │
│  🔒 Depósito a pagar: $24.000    │
│                                  │
│  📋 Métodos de pago               │
│  ┌────────────────────────────┐ │
│  │ 💜 Nequi                    │ │
│  │ María García                │ │
│  │ 311 234 5678         [Copiar]│ │
│  │           [Ver QR]          │ │
│  └────────────────────────────┘ │
│  ┌────────────────────────────┐ │
│  │ 🏦 Bancolombia              │ │
│  │ Sede Los Pinos S.A.S.       │ │
│  │ 1234-5678-9012       [Copiar]│ │
│  └────────────────────────────┘ │
│                                  │
│  ─── ¿Ya pagaste? ───            │
│  ┌────────────────────────────┐ │
│  │ 📷 Subir comprobante       │ │
│  └────────────────────────────┘ │
│  ┌────────────────────────────┐ │
│  │ 💬 Avisar por WhatsApp     │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘

PASO 3: Tras upload — Reserva en revisión
┌─────────────────────────────────┐
│  En revisión                     │
│                                  │
│  ⌛ El admin está verificando    │
│     tu pago                      │
│                                  │
│  [thumbnail comprobante]         │
│  Subido hoy 14:23                │
│                                  │
│  Te avisaremos cuando            │
│  sea aprobada                    │
└─────────────────────────────────┘

PASO 4: Admin aprueba → push al jugador
"¡Reserva confirmada! Vie 5 Jun · 18:00"
Card pasa a verde "Confirmada"
```

### Flujo alternativo: Admin rechaza el comprobante

```
1. Admin tap "Rechazar" en card de pending_approval
2. Sheet: motivo (textarea, min 5 chars)
   Sugerencias: "Pago no recibido", "Monto incorrecto", "Comprobante ilegible"
3. Confirma → booking vuelve a pending_payment con nuevo TTL
4. Push al jugador: "Tu comprobante fue rechazado: <motivo>"
5. En card del jugador: banner rojo arriba + botón "Subir otro comprobante"
6. Si llega al 3er rechazo: card cambia a "Cancelada" con motivo "Múltiples rechazos"
```

### Flujo admin: Aprobar reservas pendientes

```
1. Admin tap notificación → /venues/admin/{id}?tab=pending
2. Vista con dos sub-tabs:
   - "Por aprobar" (X) — bookings con comprobante subido
   - "Sin comprobante" (Y) — bookings pending_payment esperando al jugador

3. Card de booking pending_approval:
   ┌────────────────────────────────────┐
   │ 👤 Juan Pérez                       │
   │ 📅 Vie 5 Jun · 18:00–19:00         │
   │ ⚽ 6v6  💰 $24.000                  │
   │                                     │
   │ [thumbnail comprobante - tap para  │
   │  ver pleno con zoom/descarga]       │
   │                                     │
   │ Subido hace 12min                   │
   │                                     │
   │ [Aprobar pago]  [Rechazar]          │
   └────────────────────────────────────┘

4. Tap "Aprobar pago" → toast "Reserva confirmada · Juan Pérez avisado"
   Card se desvanece, push enviado al jugador
```

### Flujo Super Admin: Configurar métodos de pago

```
1. Super Admin → /venues/admin/{id} → tab "Pagos"
   (Si un Location Admin entra, ve la sección en read-only con
   helper "Solo el Super Admin puede modificar los métodos de pago.
   Contacta al equipo si necesitas cambios")

2. Sección "Métodos de pago aceptados" (editable solo Super Admin):
   ┌────────────────────────────────────┐
   │ + Agregar método                    │
   ├────────────────────────────────────┤
   │ 💜 Nequi · María García             │
   │    311 234 5678                     │
   │    [Editar] [Eliminar]              │
   ├────────────────────────────────────┤
   │ 🏦 Bancolombia Ahorros              │
   │    Sede Los Pinos · 1234-5678-9012  │
   │    [Editar] [Eliminar]              │
   ├────────────────────────────────────┤
   │ 🔑 Llave Bancolombia                │
   │    Sede Los Pinos · 3001234567      │
   │    [Editar] [Eliminar]              │
   └────────────────────────────────────┘

3. "Agregar método":
   - Tipo: dropdown (Nequi / Bancolombia / Daviplata / Llave / Transferencia / Otro)
   - Nombre titular: input
   - Identificador (teléfono, número de cuenta, o llave): input
     · Si tipo = "Llave": el placeholder cambia a "Llave (teléfono, cédula o alias)"
       y el helper aclara "Llave registrada en Bancolombia/Nequi/Movii para
       transferencias instantáneas"
   - QR opcional: file picker (sube a Storage del venue)
   - Activo: toggle

4. Sección "Ventana de tiempo para pago" (editable por Location Admin y Super Admin):
   - Input numérico 1-24 horas
   - Default: 24
   - Helper: "Tiempo que tiene el jugador para subir comprobante antes
     de que la reserva se cancele automáticamente"

5. Sección "WhatsApp de avisos (opcional)":
   - Input: número en formato +57 311 234 5678
   - Helper: "Permite al jugador avisarte por WhatsApp tras pagar.
     Si lo dejas vacío, el botón no aparece"
```

### Estados de UI — bookings

| Estado | Card del jugador (`/bookings/[id]`) | Card en lista por hora del admin (calendario) | Card en vista "Reservas pendientes" del admin |
|--------|--------------------------------------|------------------------------------------------|------------------------------------------------|
| `pending_payment` | 🟡 Amarillo · "Pendiente de pago" · countdown TTL · CTAs upload + WhatsApp | 🟡 **Aparece** · amarillo · "Pendiente de pago" · bloquea slot · sin acciones inline | Tab "Sin comprobante" · helper "Esperando comprobante del jugador" |
| `pending_approval` | 🟠 Naranja · "En revisión" · thumbnail comprobante | 🟠 **Aparece** · naranja · "Por aprobar pago" · thumbnail inline · botones rápidos Aprobar abono / Rechazar · bloquea slot | Tab "Por aprobar" · destacado · CTAs Aprobar abono / Rechazar |
| `deposit_confirmed` | 🔵 Azul · "Abono confirmado · asistencia por confirmar" · muestra monto abono pagado | 🔵 **Aparece** · azul · "Abono pagado" · botón "Confirmar asistencia" + "Avanzar estado" · bloquea slot | No aparece (abono ya cobrado, pasa a vista normal del calendario) |
| `confirmed` | 🟢 Verde · "Confirmada" · monto abono pagado visible · resto a pagar en sede | 🟢 **Aparece** · verde · "Confirmada" · botón "Avanzar estado" (→ played) · acciones de cancelación normales | No aparece |
| `played` | 🟦 Indigo · "Jugada" · resumen del partido | 🟦 **Aparece si fecha = hoy** · indigo · "Jugada" · botón "Cobrar resto" → RegisterPaymentSheet | No aparece |
| `paid` | 🟪 Púrpura · "Pagada · ciclo cerrado" · desglose completo | **No aparece** (slot pasado y cobrado) — visible en historial admin | No aparece |
| `no_show` | 🟧 Naranja-rojo · "No asistió" | **No aparece** en lista por hora — visible en historial admin | No aparece |
| `expired` | ⚪ Gris · "Reserva expirada" · sin acciones | **No aparece** (slot liberado) | No aparece |
| `cancelled` | 🔴 Rojo · "Cancelada" + motivo | **No aparece** (slot liberado) | No aparece |
| `completed` (legacy) | 🟦 Igual a `played` para reservas legacy | Solo si el slot es hoy y status venía del cron viejo | No aparece |

> **Importante**: La query actual de la lista por hora del admin ([lib/bookings.ts:66](lib/bookings.ts#L66)) pide `status in ["confirmed", "pending_payment"]`. Hay que **extenderla a**:
> ```typescript
> status in ["pending_payment", "pending_approval", "deposit_confirmed", "confirmed", "played"]
> ```
> Y agregar los nuevos labels/colores a `bookingStatusColor()` y `bookingStatusLabel()` en [lib/domain/booking.ts](lib/domain/booking.ts).
>
> **Coherencia con reservas manuales**: este ciclo `confirmed → played → paid → no_show` espeja exactamente el de reservas manuales (`blocked_slots`). El admin maneja ambos tipos con el mismo modelo mental.

### Cobro del resto en sede + integración del abono al `RegisterPaymentSheet`

Cuando el admin avanza una reserva de jugador a `paid`, se abre el [RegisterPaymentSheet](components/booking/RegisterPaymentSheet.tsx) existente. El comportamiento se ajusta así para reservas con abono:

**Pre-rellenado de inputs**:
- `transferCOP = depositCOP` (el abono ya pagado externamente se carga aquí — el medio principal del abono SIEMPRE es transferencia/Nequi/Bancolombia/Daviplata/Llave)
- `cashCOP = remainingCOP` (resto que el admin cobra en sede en efectivo, caso más común)
- Total resultante = `priceCOP` (cuadra exactamente)
- Diff badge compara contra `priceCOP` (igual que reservas manuales)

**Helper visual en el campo Transferencia** (solo si `depositCOP > 0`):
```
🏦 Transferencia            $ 24,000
   ℹ️ Incluye abono Nequi del 5 Jun · Ver comprobante
```
- Texto informativo debajo del input mencionando el método de pago original, fecha de aprobación, y link al comprobante
- El input sigue editable: el admin puede ajustar si en sede recibió transferencia adicional
- No bloqueamos modificación: confiamos en el admin (puede haber correcciones legítimas)

**Para reservas sin abono** (`depositCOP === 0`, sea porque venue no exige depósito o booking legacy):
- Pre-rellenado idéntico al actual: `cashCOP = priceCOP`, `transferCOP = 0`
- Helper visual no aparece

**No se inyecta nada al balance fuera del payment doc**: el balance diario sigue siendo single source of truth = `ManualReservationPayment`. El abono solo "aparece" en el balance cuando el admin registra el pago final (avance a `paid`) — porque queda incluido en `transferCOP` del payment doc. Si el partido nunca llega a `paid` (cancelado, no_show, etc.), el abono no aparece en el balance — y eso es lo correcto, porque el ciclo financiero no se cerró.

### Consideraciones mobile-first

- Botón "Subir comprobante" full-width, altura ≥ 56px
- Preview del comprobante: aspect-ratio mantenido, click → fullscreen viewer con zoom
- Métodos de pago: cards con tap-to-copy + tap-to-view-QR fluido
- `pb-24 md:pb-0` en todas las páginas nuevas
- Inputs con `text-base` (16px+) para evitar zoom iOS

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Propósito | Props principales |
|------------|-----------|-------------------|
| `PaymentMethodCard` | Card de método de pago con copy/QR | `method: PaymentMethod`, `onCopy`, `onShowQR` |
| `PaymentMethodList` | Lista de PaymentMethodCard | `methods: PaymentMethod[]` |
| `PaymentMethodEditor` | Editor de métodos de pago (admin) | `methods`, `onChange`, `onUpload` |
| `QRViewerModal` | Modal fullscreen con QR + descarga | `qrImageURL`, `onClose` |
| `PaymentProofUploader` | Upload con compresión cliente | `bookingId`, `onUploaded` |
| `PaymentProofPreview` | Thumbnail + tap-to-fullscreen | `url`, `uploadedAt` |
| `RejectionBanner` | Banner rojo con motivo de rechazo | `reason`, `onRetry` |
| `PendingBookingsAdminView` | Vista admin con tabs y lista | `venueId` |
| `PendingBookingAdminCard` | Card admin con acciones inline | `booking`, `onApprove`, `onReject` |
| `RejectProofSheet` | Bottom sheet con motivo de rechazo | `bookingId`, `onConfirm` |
| `WhatsAppNotifyButton` | Botón WhatsApp deep-link | `venuePhone`, `bookingSummary` |
| `BookingExpirationTimer` | Countdown legible | `expiresAt` |

### Animaciones (Framer Motion)

| Elemento | Tipo | Detalles |
|----------|------|----------|
| Upload progress | Progress bar animada | `motion.div width: ${pct}%`, transición 200ms |
| Comprobante recién subido | Fade + scale-in | `initial: { opacity: 0, scale: 0.9 }`, `animate: { opacity: 1, scale: 1 }` |
| Card admin tras aprobar | Slide-out + fade | `exit: { x: 300, opacity: 0 }`, AnimatePresence |
| Rejection banner | Slide-down al aparecer | `initial: { y: -20, opacity: 0 }`, spring damping 25 |
| QR viewer | Fade backdrop + scale modal | Pattern existente de modales |
| Status change badge | Color cross-fade 300ms | `transition: { duration: 0.3 }` |

### Responsive

| Breakpoint | Diseño |
|------------|--------|
| Mobile (< md) | Stack vertical · bottom sheets · 1 col · thumbnail comprobante 100% width |
| Desktop (md+) | Grid 2 col en admin pending view · modal en vez de bottom sheet · thumbnail max 320px |

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `booking_pending_created` | Reserva creada con depósito requerido (status pending_payment) | `venue_id`, `booking_id`, `format`, `deposit_cop`, `ttl_hours` |
| `payment_proof_uploaded` | Jugador sube comprobante exitosamente | `venue_id`, `booking_id`, `file_size_kb`, `attempt_number` (1, 2 o 3) |
| `payment_proof_upload_failed` | Falla compresión o upload | `venue_id`, `booking_id`, `reason` |
| `whatsapp_notify_tapped` | Jugador tap botón WhatsApp | `venue_id`, `booking_id` |
| `booking_approved` | Admin aprueba pago | `venue_id`, `booking_id`, `time_to_approve_minutes` |
| `booking_proof_rejected` | Admin rechaza comprobante | `venue_id`, `booking_id`, `attempt_number`, `reason_category` (free vs preset) |
| `booking_expired_no_payment` | TTL expiró sin upload | `venue_id`, `booking_id`, `ttl_hours` |
| `booking_expired_max_rejections` | 3 rechazos → expired | `venue_id`, `booking_id` |
| `venue_payment_methods_updated` | Admin guarda métodos de pago | `venue_id`, `methods_count`, `has_qr` (bool) |
| `venue_pending_ttl_updated` | Admin cambia TTL | `venue_id`, `old_hours`, `new_hours` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos — Cambios

```typescript
// ===== VENUE — campos nuevos =====
interface Venue {
  // ... campos existentes ...

  // NUEVO: métodos de pago externos
  paymentMethods?: PaymentMethod[];

  // NUEVO: TTL configurable para reservas pendientes (1-24)
  pendingApprovalTTLHours?: number;  // default 24

  // NUEVO: número WhatsApp para "Avisar al admin" (E.164)
  whatsappNotificationNumber?: string;
}

interface PaymentMethod {
  id: string;                          // uuid
  type: "nequi" | "bancolombia" | "daviplata" | "llave" | "transfer" | "other";
  label: string;                       // "Nequi", "Bancolombia Ahorros", "Llave Bancolombia"
  accountHolderName: string;           // "María García"
  accountIdentifier: string;           // "3112345678", "1234-5678-9012" o llave (alias, cédula, teléfono)
  qrImageURL?: string;                 // Storage URL del QR
  instructions?: string;               // Texto opcional ("Enviar a este número como Nequi normal")
  active: boolean;
  sortOrder: number;
}

// Notas sobre "llave":
// Es el alias registrado en Bancolombia/Nequi/Movii para transferencias
// instantáneas vía Transfiya. El accountIdentifier guarda el valor literal
// (teléfono, cédula o alias custom). La UI debe mostrar el icono 🔑 y
// helper específico "Llave registrada para transferencias instantáneas".

// ===== BOOKING — campos nuevos =====
interface Booking {
  // ... campos existentes ...

  status: BookingStatus;  // se amplía con "pending_approval"

  // NUEVO: comprobante actual
  paymentProofURL?: string | null;
  paymentProofUploadedAt?: string | null;  // ISO

  // NUEVO: historial de intentos rechazados (max 3)
  paymentProofHistory?: Array<{
    url: string;                        // Storage URL (puede ser inaccesible tras lifecycle)
    uploadedAt: string;
    rejectedAt: string;
    rejectionReason: string;
  }>;

  // NUEVO: trazabilidad de aprobación
  approvedBy?: string | null;          // uid del admin
  approvedAt?: string | null;          // ISO
  lastRejectionReason?: string | null;  // visible al jugador en pending_payment tras rechazo
  lastRejectionAt?: string | null;
}

type BookingStatus =
  // ── Estados pre-juego (gestión financiera) ──
  | "pending_payment"      // Creada, esperando que el jugador suba comprobante
  | "pending_approval"     // NUEVO: comprobante subido, esperando admin verifique
  | "deposit_confirmed"    // NUEVO: admin aprobó abono. Falta confirmar asistencia con cliente
  | "confirmed"            // Asistencia confirmada (24h antes), lista para jugarse

  // ── Estados post-juego (lifecycle financiero igual a reservas manuales) ──
  | "played"               // NUEVO: el partido se jugó (admin lo marca)
  | "paid"                 // NUEVO: admin cobró el resto en sede (cierra ciclo financiero)

  // ── Terminales negativos ──
  | "no_show"              // Confirmó asistencia pero no asistió (admin lo marca)
  | "cancelled"            // Cancelada por jugador o admin (motivo obligatorio)
  | "expired"              // pending_payment expirado por TTL o 3 rechazos

  // ── LEGACY (bookings creadas antes de este SDD) ──
  | "completed";           // Estado terminal automático del cron viejo (no se emite en nuevas reservas)

type BookingPaymentMethod =
  | "wallet_deposit"   // LEGACY: bookings pre-cambio (solo lectura, no se crean nuevas)
  | "external_deposit" // NUEVO: pago externo verificado por admin
  | "on_site"          // Sin depósito requerido
  | "free";
```

### Capa de dominio (`lib/domain/`)

| Archivo | Funciones nuevas/modificadas |
|---------|------------------------------|
| `lib/domain/booking.ts` | + `canUploadPaymentProof()`, `canApproveBooking()`, `canRejectPaymentProof()`, `getPaymentProofAttemptCount()`, `MAX_PAYMENT_PROOF_ATTEMPTS = 3` |
| `lib/domain/venue.ts` | + `validatePaymentMethod()`, `validatePendingApprovalTTL()`, `validateWhatsAppNumber()`, `formatWhatsAppNotifyMessage()` |
| `lib/domain/errors.ts` | + `PaymentProofRejectedError`, `MaxRejectionsReachedError`, `BookingNotPendingError` |
| `lib/utils/imageCompression.ts` | **NUEVO** — `compressPaymentProof(file): Promise<Blob>` usando canvas o `browser-image-compression` |

### Capa de API (`lib/`)

| Archivo | Funciones nuevas/modificadas |
|---------|------------------------------|
| `lib/bookings.ts` | + `uploadPaymentProof()`, `getPendingBookingsForVenue()`, `subscribeToPendingBookings()` |
| `lib/venues.ts` | + `updatePaymentMethods()`, `updatePendingTTL()`, `updateWhatsAppNumber()` |
| `lib/storage.ts` | Helper para compresión + upload a `payment_proofs/{venueId}/{bookingId}_{ts}.jpg` |

### Cloud Functions (`functions/src/bookings.ts`)

| Función | Cambio | Descripción |
|---------|--------|-------------|
| `createBooking` | **MODIFICAR** | Eliminar debit wallet. Si depósito requerido: status = "pending_payment", expiresAt = now + venue.pendingApprovalTTLHours. paymentMethod = "external_deposit". Notificar a admins del venue. |
| `cancelBooking` | **MODIFICAR** | Eliminar refund wallet para nuevas bookings. Reservas legacy (paymentMethod=wallet_deposit) mantienen flujo de reembolso. |
| `uploadPaymentProof` | **NUEVO onCall** | Validar dueño + status pending_payment + intentos < 3. Marcar como pending_approval. Notificar admins del venue. |
| `approveBookingDeposit` | **NUEVO onCall** | Validar admin + status pending_approval. Marcar `deposit_confirmed` (NO confirmed). Notificar jugador "Tu abono fue verificado". |
| `confirmBookingAttendance` | **NUEVO onCall** | Validar admin + status deposit_confirmed. Marcar `confirmed`. Notificar jugador "Tu reserva está lista". |
| `advanceBookingStatus` | **NUEVO onCall** | Avanzar `confirmed → played` o `played → paid` o cualquier status → `no_show`. Reusar pattern de `advanceManualReservationStatus` para reservas manuales. Validar admin del venue + transición legal. |
| `rejectPaymentProof` | **NUEVO onCall** | Validar admin + status pending_approval + reason. Push proof actual a history, status → pending_payment, nuevo expiresAt. Si history.length >= 3 → expired. Notificar jugador. |
| `expirePendingBookings` | **MODIFICAR** | Buscar también las que están en `pending_payment` con expiresAt vencido (no solo wallet_deposit legacy). |
| `notifyVenueAdmins` (interno) | **NUEVO** | Resolver admins del venue (super_admin + location_admin asignados) y mandar push. |

### Storage (`firebase.storage`)

```
payment_proofs/
└── {venueId}/
    └── {bookingId}_{timestamp}.jpg

venue_payment_qrs/
└── {venueId}/
    └── {paymentMethodId}.jpg
```

### Lifecycle rules — Firebase Storage

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 90,
          "matchesPrefix": ["payment_proofs/"]
        }
      }
    ]
  }
}
```

### Componentes UI (`app/`, `components/`)

| Archivo | Cambio |
|---------|--------|
| `app/bookings/[id]/page.tsx` | **MODIFICAR** — Render condicional según status: payment methods + upload UI si pending_payment, preview si pending_approval, banner rejection si aplica |
| `app/venues/admin/[id]/page.tsx` | **MODIFICAR** — Agregar tab "Reservas pendientes" + sub-tabs |
| `app/venues/admin/[id]/page.tsx` | **MODIFICAR** — En tab "Pagos": editor de paymentMethods, TTL, WhatsApp |
| `components/booking/BookingConfirmSheet.tsx` | **MODIFICAR** — Quitar lógica de wallet balance / recarga. Mostrar "Tendrás Xh para enviar el comprobante" |
| `components/booking/PaymentMethodCard.tsx` | **NUEVO** |
| `components/booking/PaymentMethodList.tsx` | **NUEVO** |
| `components/booking/PaymentMethodEditor.tsx` | **NUEVO** |
| `components/booking/QRViewerModal.tsx` | **NUEVO** |
| `components/booking/PaymentProofUploader.tsx` | **NUEVO** |
| `components/booking/PaymentProofPreview.tsx` | **NUEVO** |
| `components/booking/RejectionBanner.tsx` | **NUEVO** |
| `components/booking/PendingBookingsAdminView.tsx` | **NUEVO** |
| `components/booking/PendingBookingAdminCard.tsx` | **NUEVO** |
| `components/booking/RejectProofSheet.tsx` | **NUEVO** |
| `components/booking/WhatsAppNotifyButton.tsx` | **NUEVO** |
| `components/booking/BookingExpirationTimer.tsx` | **NUEVO** (usar formato 24h max, ej. "23h 47min") |
| `components/skeletons/PendingBookingsSkeleton.tsx` | **NUEVO** |
| `lib/utils/imageCompression.ts` | **NUEVO** |
| `lib/storage.ts` | **MODIFICAR** o **NUEVO** — helper de upload con path estructurado |
| `firestore.rules` | **MODIFICAR** — `paymentMethods` write solo Super Admin (field-level check); TTL/WhatsApp write Location Admin asignado o Super Admin |
| `firestore.indexes.json` | **MODIFICAR** — nuevo índice [venueId, status, createdAt DESC] |
| `storage.rules` | **MODIFICAR** o **NUEVO** — reglas para payment_proofs y venue_payment_qrs |
| `firebase.json` | **MODIFICAR** — lifecycle rule de 90 días para payment_proofs |
| `functions/src/bookings.ts` | **MODIFICAR** según tabla arriba |
| `functions/src/index.ts` | **MODIFICAR** — exportar uploadPaymentProof, approveBooking, rejectPaymentProof |

---

## 10. CRITERIOS DE ACEPTACIÓN

### Jugador

- [ ] Puede crear una reserva sin saldo en wallet
- [ ] Tras crear, ve los métodos de pago de la sede con copy-to-clipboard
- [ ] Puede ver/descargar el QR de un método si está configurado
- [ ] Puede subir un comprobante de imagen (cámara o galería)
- [ ] El comprobante se comprime y queda ≤ 200KB típico
- [ ] Tras subir, ve estado "En revisión" y un thumbnail del comprobante
- [ ] Recibe push cuando admin aprueba abono ("Tu abono fue verificado")
- [ ] Recibe push cuando admin confirma asistencia ("Tu reserva está lista")
- [ ] Recibe push si admin rechaza, con motivo visible
- [ ] Puede reintentar subir comprobante hasta 3 veces
- [ ] Si su reserva expira (no subió a tiempo), ve estado "Expirada"
- [ ] Si su sede tiene WhatsApp configurado, ve botón "Avisar por WhatsApp" con mensaje pre-llenado
- [ ] Si la sede no tiene WhatsApp, el botón no aparece (no se ve disabled)
- [ ] Una vez en `deposit_confirmed` ve "Abono pagado: $X · Resto en sede: $Y" prominente
- [ ] El detalle de su reserva muestra el estado actual del ciclo (abono confirmado → confirmada → jugada → pagada)

### Super Admin

- [ ] Puede configurar 1+ métodos de pago en cualquier sede (Nequi / Bancolombia / Daviplata / Llave / Transferencia / Otro)
- [ ] Cada método puede tener QR opcional
- [ ] Puede crear método tipo "Llave" con identificador alfanumérico (alias, teléfono, cédula)
- [ ] Hereda todas las capacidades de Location Admin

### Location Admin (y Super Admin)

- [ ] Puede ajustar `pendingApprovalTTLHours` entre 1 y 24 en su sede
- [ ] Puede configurar WhatsApp opcional de la sede
- [ ] Ve los métodos de pago configurados pero NO puede editarlos (tooltip "Solo el Super Admin puede modificar los métodos de pago")
- [ ] Recibe push cuando se crea reserva pendiente en su sede
- [ ] Recibe push cuando un jugador sube comprobante
- [ ] Ve una vista "Reservas pendientes" con tabs ("Sin comprobante" / "Por aprobar")
- [ ] Puede aprobar abono con 1 tap → reserva pasa a `deposit_confirmed`
- [ ] Puede rechazar un comprobante con motivo obligatorio
- [ ] Puede ver el comprobante en fullscreen con zoom
- [ ] Puede cancelar una reserva pendiente (motivo obligatorio)
- [ ] Puede marcar "Confirmar asistencia" (`deposit_confirmed → confirmed`) tras validar con el cliente. La acción es manual desde la card del calendario o vista de pendientes — sin recordatorio automático
- [ ] Puede avanzar el ciclo financiero post-juego (`confirmed → played → paid`) con botón "Avanzar estado" en la card del calendario, reusando el patrón de reservas manuales
- [ ] Puede marcar `no_show` desde cualquier estado activo
- [ ] Al avanzar a `paid` se abre `RegisterPaymentSheet` con: `transferCOP` pre-rellenado con `depositCOP` (abono ya pagado) + `cashCOP` pre-rellenado con `remainingCOP` (resto a cobrar en sede), helper visual en transferencia mencionando el origen del abono y link al comprobante
- [ ] El balance diario solo muestra lo registrado vía `RegisterPaymentSheet` — el abono aparece en el balance únicamente cuando la reserva llega a `paid` (porque entonces queda incluido en `transferCOP` del payment doc). Si la reserva nunca cierra ciclo (cancelled/no_show/expired), el abono no aparece en el balance
- [ ] En toda card ve un badge visual de origen ("🌐 Reserva web" para player bookings vs "✏️ Reserva manual" para `blocked_slots`)
- [ ] En toda card con `deposit_confirmed` o posterior ve el monto del abono pagado y el resto pendiente prominente

### Sistema

- [ ] Reservas pre-existentes con `paymentMethod === "wallet_deposit"` siguen visibles y funcionales (lectura)
- [ ] Reservas nuevas con depósito usan `paymentMethod === "external_deposit"`
- [ ] Wallet/Wompi sigue funcional para recargas (no participa en booking)
- [ ] Cron de expiración corre cada 5min y marca expiradas las reservas sin pago
- [ ] Storage tiene lifecycle de 90 días para `payment_proofs/`
- [ ] Comprobante de < 500KB se acepta; > 500KB tras compresión se rechaza con mensaje claro
- [ ] No se permite subir archivos no-imagen (PDF, video, etc.)
- [ ] Aprobar/rechazar es transaccional: dos admins no pueden actuar a la vez sin error claro
- [ ] Push notifications a admins son fanout (todos los admins de la sede)

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/booking.ts` | **Modificar** — Nuevos helpers + estado `pending_approval` |
| `lib/domain/venue.ts` | **Modificar** — Validators de PaymentMethod, TTL, WhatsApp |
| `lib/domain/errors.ts` | **Modificar** — Nuevos errores tipados |
| `lib/utils/imageCompression.ts` | **Nuevo** — Compresión canvas/browser-image-compression |
| `lib/storage.ts` | **Modificar/Nuevo** — Upload helper estructurado |
| `lib/bookings.ts` | **Modificar** — `uploadPaymentProof`, `getPendingBookingsForVenue` |
| `lib/venues.ts` | **Modificar** — `updatePaymentMethods`, `updatePendingTTL`, `updateWhatsAppNumber` |
| `app/bookings/[id]/page.tsx` | **Modificar** — UI por estado + upload + métodos de pago |
| `app/venues/admin/[id]/page.tsx` | **Modificar** — Tab "Reservas pendientes" + tab "Pagos" extendido |
| `components/booking/BookingConfirmSheet.tsx` | **Modificar** — Quitar wallet, mostrar TTL |
| `components/booking/PaymentMethodCard.tsx` | **Nuevo** |
| `components/booking/PaymentMethodList.tsx` | **Nuevo** |
| `components/booking/PaymentMethodEditor.tsx` | **Nuevo** |
| `components/booking/QRViewerModal.tsx` | **Nuevo** |
| `components/booking/PaymentProofUploader.tsx` | **Nuevo** |
| `components/booking/PaymentProofPreview.tsx` | **Nuevo** |
| `components/booking/RejectionBanner.tsx` | **Nuevo** |
| `components/booking/PendingBookingsAdminView.tsx` | **Nuevo** |
| `components/booking/PendingBookingAdminCard.tsx` | **Nuevo** |
| `components/booking/RejectProofSheet.tsx` | **Nuevo** |
| `components/booking/WhatsAppNotifyButton.tsx` | **Nuevo** |
| `components/booking/BookingExpirationTimer.tsx` | **Nuevo** |
| `components/booking/BookingOriginBadge.tsx` | **Nuevo** — Badge "🌐 Reserva web" / "✏️ Reserva manual" |
| `components/booking/DepositSummary.tsx` | **Nuevo** — Bloque "Abono pagado: $X · Resto en sede: $Y" (visible en card del jugador y en card admin, NO en RegisterPaymentSheet) |
| `components/booking/ConfirmAttendanceSheet.tsx` | **Nuevo** — Sheet para `deposit_confirmed → confirmed` |
| `components/booking/AdminBookingCard.tsx` | **Modificar** — Botón "Avanzar estado" (`confirmed→played→paid`, `no_show`), integración con `RegisterPaymentSheet` (con props nuevas `depositCOP`, `paymentProofURL`, `paymentMethodLabel`, `paymentVerifiedAt`), mostrar `BookingOriginBadge` y `DepositSummary` |
| `components/booking/RegisterPaymentSheet.tsx` | **Modificar** — Aceptar props opcionales `depositCOP`, `paymentProofURL`, `paymentMethodLabel`, `paymentVerifiedAt`. Si `depositCOP > 0`: pre-rellenar `transferCOP = depositCOP`, `cashCOP = priceCOP - depositCOP`, mostrar helper "Incluye abono [tipo] del [fecha] · Ver comprobante" debajo del input transferencia |
| `components/skeletons/PendingBookingsSkeleton.tsx` | **Nuevo** |
| `functions/src/bookings.ts` | **Modificar** — Nuevas onCall: `approveBookingDeposit`, `confirmBookingAttendance`, `advanceBookingStatus`, `rejectPaymentProof`, `uploadPaymentProof` |
| `functions/src/index.ts` | **Modificar** — Exportar nuevas Cloud Functions |
| `firestore.rules` | **Modificar** — `paymentMethods` write solo Super Admin (field-level diff check); resto de campos venue editables por Location Admin asignado |
| `firestore.indexes.json` | **Modificar** — Índice [venueId, status, createdAt DESC] |
| `storage.rules` | **Modificar/Nuevo** — Reglas payment_proofs + venue_payment_qrs |
| `firebase.json` | **Modificar** — Lifecycle 90 días |

---

## ⚠️ Decisiones de Diseño Clave — APROBADAS

### 1. ✅ Upload in-app + botón WhatsApp opcional
Upload de comprobante es el camino principal con compresión cliente (1024px, JPEG 0.7, ≤200KB típico). Botón WhatsApp es secundario y solo aparece si el venue configuró el número.

### 2. ✅ Lifecycle de 90 días en Storage
Comprobantes se borran automáticamente a los 3 meses. La booking conserva metadata. Reduce costos a < $0.50/año a 5k pagos/mes.

### 3. ✅ TTL configurable 1-24h por venue
`pendingApprovalTTLHours`: input numérico entero, default 24, max 24. Recordatorio push al jugador al 75% del tiempo.

### 4. ✅ Lista de métodos de pago + QR opcional por método — Solo Super Admin
**Solo el Super Admin** configura los PaymentMethod estructurados (tipo, titular, identificador, QR). Tipos soportados: Nequi / Bancolombia / Daviplata / Llave (Transfiya) / Transferencia / Otro. Los location admins ven los métodos en read-only. Justificación: datos bancarios sensibles del dueño del negocio.

### 5. ✅ Wallet/Wompi se mantiene para otros usos
Reservas legacy con `paymentMethod === "wallet_deposit"` siguen funcionales (lectura + reembolso histórico). Nuevas reservas con `paymentMethod === "external_deposit"`.

### 6. ✅ Máximo 3 intentos de comprobante por reserva
Tras 3 rechazos consecutivos, la reserva pasa a `expired` y libera la cancha. Previene loops infinitos de comprobantes ilegibles.

### 7. ✅ Admin aprobaciones manuales y atómicas
Aprobar/rechazar son onCall transaccionales — no scheduled. Dos admins simultáneos: el segundo recibe error "ya gestionada".

### 8. ✅ Ciclo de vida granular alineado con reservas manuales
La reserva de jugador atraviesa: `pending_payment → pending_approval → deposit_confirmed → confirmed → played → paid` con terminales `no_show / cancelled / expired`. **El estado `deposit_confirmed` es clave**: separa "abono cobrado" de "asistencia confirmada con el cliente" — crítico para reservas pagadas con días de anticipación donde el admin valida asistencia 24h antes. El admin avanza manualmente los estados post-juego con el mismo patrón que las reservas manuales (`blocked_slots`).

### 9. ✅ Origen visual + abono visible en toda card
Toda reserva muestra badge de origen (web vs manual) y, cuando aplica, el desglose "Abono pagado: $X · Resto en sede: $Y". Garantiza claridad operacional para el admin sin importar quién creó la reserva.

### 11. ✅ Abono se pre-carga en `transferCOP` del `RegisterPaymentSheet`, no se inyecta al balance fuera del payment doc
Al cerrar ciclo (`played → paid`), el `RegisterPaymentSheet` pre-rellena el campo "Transferencia" con el monto del abono (que siempre es transferencia/Nequi/Bancolombia/etc.) y el campo "Efectivo" con el resto. El admin puede ajustar. El balance diario sigue siendo **single source of truth = `ManualReservationPayment`**, sin inyecciones cruzadas desde bookings. Consecuencia: el abono solo aparece en el balance cuando el partido cierra ciclo financiero (llegó a `paid`); si nunca cierra, no aparece — coherente con que el ciclo no se completó.

### 10. ✅ Confirmación de asistencia 100% manual (sin cron de recordatorio)
El admin marca `deposit_confirmed → confirmed` cuando él decide (típicamente tras llamar al cliente). No hay scheduled function que mande push 24h antes. Las reservas en `deposit_confirmed` son visibles en el calendario por hora y en la vista de pendientes, de modo que el admin las gestiona en su rutina diaria sin interrupciones automáticas.
