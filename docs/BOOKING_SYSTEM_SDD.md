# Feature: Sistema de Reservas de Canchas

## 📋 Specification-Driven Development (SDD)

Permite a dueños de sedes publicar horarios disponibles y a jugadores reservar canchas en pocos taps, con asignación automática inteligente que preserva combinaciones de canchas grandes.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Resolver el problema de reservar canchas deportivas de forma rápida, eliminando la fricción de coordinación manual por WhatsApp. El sistema debe:

- Permitir a admins de sede configurar canchas físicas, sus combinaciones válidas y horarios disponibles
- Permitir a jugadores reservar en máximo 3 taps (seleccionar formato → elegir horario → confirmar)
- Asignar automáticamente la cancha física óptima para preservar disponibilidad de combinaciones grandes
- Opcionalmente requerir pago anticipado vía wallet existente

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-01 | Una sede tiene N canchas físicas ("courts") que pueden combinarse en "formatos" (6v6, 9v9, 11v11) según configuración del admin | Admin configura courts y combos en settings de sede |
| RN-02 | La asignación de court es automática: el sistema elige la cancha que menos impacta la disponibilidad de combos grandes | Jugador NO ve ni elige court físico — solo ve formato y horario |
| RN-03 | Dos reservas no pueden solaparse en el mismo court físico | Slot desaparece de la UI si ya no está disponible |
| RN-04 | El admin configura si requiere depósito anticipado vía wallet: elige un porcentaje entre 20% y 50% del precio total. El resto se paga en sede. Si el porcentaje es 0% o el toggle está OFF, no hay pago anticipado | Modal de confirmación muestra: precio total, % depósito, valor del depósito en COP, saldo wallet, y "Resto a pagar en sede: $X" |
| RN-05 | Reservas tienen estados: `pending_payment` → `confirmed` → `completed` / `cancelled` / `no_show` | Badges de color por estado en lista de reservas |
| RN-06 | Cancelación con reembolso solo si faltan > 24h para el slot (misma regla que depósitos de partidos) | Advertencia clara en modal de cancelación |
| RN-07 | Admin puede bloquear slots manualmente (mantenimiento, evento privado) | Slots bloqueados aparecen tachados en el calendario admin |
| RN-11 | Cambios de horario semanal solo aplican hacia adelante — no afectan reservas existentes. Para cancelar un slot ya reservado, el admin usa bloqueo manual + cancelación individual (con reembolso automático del depósito) | Toast al guardar horario: "Los cambios aplican a partir de hoy. Las reservas existentes no se ven afectadas" |
| RN-12 | El usuario puede reservar slots consecutivos en un solo paso (ej: 18:00-20:00 = 2 slots de 1h). El sistema valida que el mismo court esté disponible en todos los slots. El precio se multiplica por la cantidad de slots y el depósito se calcula sobre el total | Selección múltiple en SlotList: tap primer slot, luego extender tocando el siguiente consecutivo. Desglose en confirmación muestra "2h × $80.000 = $160.000" |
| RN-08 | Reserva sin pago expira en 15 minutos si el admin configuró pago obligatorio | Timer visible en la reserva pendiente |
| RN-09 | El módulo es independiente de matches: no crea ni modifica partidos | Navegación separada, sin side-effects en matches |
| RN-13 | El módulo completo está detrás de un feature flag `bookingEnabled` en el perfil del usuario (mismo patrón que `walletEnabled`). Si `false`, no aparece la tab "Reservas" en BottomNav ni las rutas `/venues` y `/bookings` son accesibles. Super Admin puede activarlo por usuario o globalmente | Tab de reservas solo visible si `profile.bookingEnabled === true`. Rutas protegidas con redirect a home si el flag está off |
| RN-10 | Futuro: una reserva podrá convertirse en un match (v2, fuera de alcance) | Se incluye `matchId?: string` en el modelo para forward-compatibility |

---

## 2. ESCALABILIDAD

### Volumen esperado
- **Fase inicial**: 5-20 sedes, 1-4 canchas por sede, ~50 reservas/semana
- **Fase crecimiento**: 50-100 sedes, hasta 8 canchas por sede, ~500 reservas/semana
- **Pico**: Viernes y sábados 17:00-21:00 concentran ~60% de reservas

### Colecciones Firestore

| Colección | Documentos estimados (año 1) | Crecimiento |
|-----------|------------------------------|-------------|
| `venues` | 50-100 | Lento |
| `venues/{id}/courts` | 200-800 | Proporcional a venues |
| `venues/{id}/court_combos` | 100-400 | Proporcional a courts |
| `bookings` | ~25,000 | ~500/semana |
| `venues/{id}/schedules` | 350-700 (1 por día por venue activo) | Rotativo |

### Índices Firestore requeridos

```
// Buscar slots disponibles por venue + fecha
bookings: [venueId ASC, date ASC, status ASC]

// Historial de reservas del usuario
bookings: [bookedBy ASC, date DESC]

// Reservas pendientes de pago (para expiración)
bookings: [status ASC, expiresAt ASC]

// Reservas de un court específico en una fecha (para validar solapamiento)
bookings: [venueId ASC, courtIds ARRAY_CONTAINS, date ASC]
```

### Paginación
- **Lista de reservas del jugador**: cursor por `date` DESC, limit 20
- **Calendario admin**: query por rango de fecha (semana), sin paginación (max ~200 slots/semana por venue)
- **Explorar sedes**: cursor por `name` ASC, limit 20

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

#### 3.1 Crear reserva (`createBooking`)
```
Escenario: Dos usuarios intentan reservar el mismo slot de 6v6 a las 18:00.
Solo queda 1 court disponible para ese formato.

Sin transacción: Ambos leen "disponible", ambos crean reserva → doble booking.

Con transacción:
1. READ: todas las bookings del venue para esa fecha/hora
2. VALIDATE: correr algoritmo de asignación → ¿hay court disponible?
3. WRITE: crear booking con courtIds asignados

El segundo usuario recibe error "Horario ya no disponible" porque la tx
relee y el court ya está ocupado.
```

#### 3.2 Cancelar reserva con reembolso (`cancelBooking`)
```
Escenario: Usuario cancela mientras admin también cancela manualmente.

Sin transacción: Doble reembolso.

Con transacción:
1. READ: booking actual + wallet
2. VALIDATE: status === "confirmed", no ya cancelada
3. WRITE: booking.status = "cancelled" + acreditar wallet

Solo una de las dos operaciones concurrentes ve status "confirmed".
```

#### 3.3 Confirmar pago pendiente (`confirmBookingPayment`)
```
Escenario: Timer de 15min expira al mismo tiempo que el usuario paga.

Sin transacción: Booking marcada como expired pero wallet debitada.

Con transacción:
1. READ: booking + wallet
2. VALIDATE: status === "pending_payment" AND NOT expirada
3. WRITE: booking.status = "confirmed" + debitar wallet
```

### Operaciones seguras sin transacción
- **Leer slots disponibles**: Solo lectura, eventual consistency aceptable (se revalida al crear)
- **Actualizar configuración de venue/courts**: Admin único, no concurrente
- **Bloquear slot**: Admin único por venue, idempotente

---

## 4. SEGURIDAD

### Autenticación y autorización

| Acción | Quién puede | Cómo se valida |
|--------|-------------|----------------|
| Ver sedes públicas | Cualquier usuario autenticado | `request.auth != null` |
| Crear/editar venue | Super Admin o Location Admin asignado | `isSuperAdmin() \|\| isLocationAdmin(venueId)` |
| Configurar courts/combos | Admin de esa sede | `isVenueAdmin(venueId)` |
| Ver slots disponibles | Cualquier usuario autenticado | `request.auth != null` |
| Crear reserva | Cualquier usuario autenticado | `request.auth != null` (pago se valida server-side) |
| Cancelar reserva propia | El usuario que reservó | `resource.data.bookedBy == request.auth.uid` |
| Cancelar cualquier reserva | Admin de esa sede | `isVenueAdmin(resource.data.venueId)` |
| Ver todas las reservas de un venue | Admin de esa sede | Server-side en Cloud Function |

### Firestore Rules requeridas

```javascript
// ===== VENUES =====
match /venues/{venueId} {
  allow read: if request.auth != null;
  allow create: if isSuperAdmin();
  allow update: if isSuperAdmin() || isLocationAdminOf(venueId);
  allow delete: if false;

  // Sub-colección: courts
  match /courts/{courtId} {
    allow read: if request.auth != null;
    allow write: if isSuperAdmin() || isLocationAdminOf(venueId);
  }

  // Sub-colección: court_combos
  match /court_combos/{comboId} {
    allow read: if request.auth != null;
    allow write: if isSuperAdmin() || isLocationAdminOf(venueId);
  }

  // Sub-colección: schedules (horarios semanales)
  match /schedules/{scheduleId} {
    allow read: if request.auth != null;
    allow write: if isSuperAdmin() || isLocationAdminOf(venueId);
  }
}

// ===== BOOKINGS =====
match /bookings/{bookingId} {
  allow read: if request.auth != null &&
    (resource.data.bookedBy == request.auth.uid || isVenueAdmin(resource.data.venueId));
  allow create: if false;  // Solo Cloud Functions (para validar disponibilidad)
  allow update: if false;  // Solo Cloud Functions
  allow delete: if false;
}
```

### Validaciones de input

| Campo | Validación | Dónde |
|-------|-----------|-------|
| `venueId` | Existe y está activo | Cloud Function |
| `date` | Formato YYYY-MM-DD, no en el pasado, dentro del rango publicado | Client + Server |
| `startTime` / `endTime` | Formato HH:mm, dentro del schedule del venue | Client + Server |
| `format` | Uno de los formatos configurados en el venue | Cloud Function |
| `amountCOP` | Coincide con el precio configurado para ese formato/horario | Cloud Function (nunca confiar en el cliente) |

### Datos sensibles
- `bookings.amountCOP` y `bookings.paymentTxId`: visibles solo al usuario que reservó y al admin del venue
- Datos de wallet: ya protegidos por reglas existentes (`wallets/{uid}` solo lectura propia)

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Firestore offline | Sin conexión a internet | Banner "Sin conexión" + slots cacheados en última lectura. Botón reservar deshabilitado |
| Slot no disponible (race condition) | Otro usuario reservó mientras veía | Toast "Este horario acaba de ser reservado" + refresh automático de slots |
| Saldo insuficiente | Balance < depósito requerido | Mostrar diferencia + CTA "Recargar $X" que abre WompiWidget con monto pre-llenado |
| Pago expirado (15min timeout) | Usuario no completó pago a tiempo | Toast "Tu reserva expiró" + opción de reintentar si slot sigue disponible |
| Cloud Function timeout | Carga alta del servidor | Toast "Error al procesar, intenta de nuevo" + botón retry |
| Venue no encontrado | URL inválido o venue desactivado | Página 404 con CTA "Explorar sedes" |
| Permiso denegado | Token expirado o regla de seguridad | Redirect a login con return URL |

### Retry strategy
- **createBooking**: NO retry automático (el slot puede ya no existir). Mostrar error + botón manual
- **cancelBooking**: 1 retry automático tras 2s (operación idempotente por status check)
- **Lectura de slots**: Retry automático con backoff (1s, 2s, 4s) — máx 3 intentos

### Degradación elegante
- Si no se puede cargar el schedule del venue: mostrar skeleton + mensaje "Cargando horarios..."
- Si la wallet no responde: permitir ver slots pero deshabilitar reserva con pago. Mostrar "Billetera temporalmente no disponible"
- Si analytics falla: silenciar error, no bloquear flujo de reserva

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal: Reservar cancha (3 taps)

```
TAP 1: Seleccionar formato
┌─────────────────────────────┐
│  🏟️ Sede Los Pinos          │
│  📍 Cra 7 #45-12            │
│                              │
│  ¿Qué formato buscas?       │
│                              │
│  ┌──────┐ ┌──────┐ ┌──────┐│
│  │ 6v6  │ │ 9v9  │ │11v11 ││
│  │ $80k │ │$120k │ │$180k ││
│  └──────┘ └──────┘ └──────┘│
│                              │
│  📅 Hoy  Mañana  Vie  Sáb  │
└─────────────────────────────┘

TAP 2: Seleccionar horario
┌─────────────────────────────┐
│  ← 6v6 · Viernes 18 Abr    │
│                              │
│  Horarios disponibles        │
│                              │
│  ┌─────────────────────────┐│
│  │ 🟢 17:00 - 18:00  $80k ││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 🟢 18:00 - 19:00  $80k ││  ← usuario toca este
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 🔴 19:00 - 20:00       ││  (ocupado, no tocable)
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 🟢 20:00 - 21:00  $80k ││
│  └─────────────────────────┘│
└─────────────────────────────┘

TAP 3: Confirmar reserva (bottom sheet)
┌─────────────────────────────┐
│  Confirmar reserva           │
│                              │
│  📅 Vie 18 Abr · 18:00-19:00│
│  ⚽ 6v6 · Sede Los Pinos    │
│                              │
│  💰 Precio cancha: $80.000   │
│  ─────────────────────────── │
│  🔒 Depósito (30%): $24.000  │
│  💳 Tu saldo: $95.000        │
│  💵 Resto en sede: $56.000   │
│                              │
│  ┌─────────────────────────┐│
│  │  ✓ Pagar depósito $24k  ││
│  └─────────────────────────┘│
│                              │
│  Cancelación gratis hasta    │
│  24h antes del horario       │
└─────────────────────────────┘
```

### Flujo alternativo: Saldo insuficiente

```
TAP 3 (variante):
┌─────────────────────────────┐
│  Confirmar reserva           │
│                              │
│  📅 Vie 18 Abr · 18:00-19:00│
│  ⚽ 6v6 · Sede Los Pinos    │
│                              │
│  💰 Precio cancha: $80.000   │
│  ─────────────────────────── │
│  🔒 Depósito (30%): $24.000  │
│  💳 Tu saldo: $10.000        │
│  ⚠️ Te faltan $14.000        │
│                              │
│  ┌─────────────────────────┐│
│  │   Recargar billetera    ││  ← abre WompiWidget con $20k preseleccionado
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │  ✓ Pagar depósito $24k  ││  (deshabilitado)
│  └─────────────────────────┘│
└─────────────────────────────┘
```

### Flujo: Reserva sin depósito (sede lo permite)

```
TAP 3 (sin depósito):
┌─────────────────────────────┐
│  Confirmar reserva           │
│                              │
│  📅 Vie 18 Abr · 18:00-19:00│
│  ⚽ 6v6 · Sede Los Pinos    │
│                              │
│  💵 Pago en sede: $80.000    │
│                              │
│  ┌─────────────────────────┐│
│  │     ✓ Reservar          ││
│  └─────────────────────────┘│
│                              │
│  Cancelación gratis hasta    │
│  24h antes del horario       │
└─────────────────────────────┘
```

### Flujo: Cancelar reserva

```
1. Mis Reservas → tap en reserva activa
2. Botón "Cancelar reserva"
3. Bottom sheet de confirmación:
   - Si > 24h: "Se reembolsará tu depósito de $24.000 a tu billetera"
   - Si < 24h: "⚠️ No se reembolsará el depósito (faltan menos de 24h)"
4. Confirmar → toast "Reserva cancelada" / "Reserva cancelada · Depósito de $24.000 reembolsado"
```

### Flujo admin: Configurar sede

```
1. Admin → Sedes → "Nueva sede" o editar existente
2. Tab "Canchas": agregar canchas físicas (nombre, formato base)
   - Ej: "Cancha 1" (6v6), "Cancha 2" (6v6), "Cancha 3" (6v6), "Cancha 4" (6v6)
3. Tab "Combinaciones": definir combos válidos
   - Ej: "Cancha Grande A" = Cancha 1 + Cancha 2 → 9v9
   - Ej: "Cancha Grande B" = Cancha 3 + Cancha 4 → 9v9
   - Ej: "Cancha Completa" = Cancha 1 + 2 + 3 + 4 → 11v11
4. Tab "Horarios": definir disponibilidad semanal
   - Por día de la semana: hora inicio, hora fin, duración de slot
   - Precio por formato (6v6: $80k, 9v9: $120k, 11v11: $180k)
5. Tab "Pagos":
   - Toggle "Requerir depósito anticipado" ON/OFF
   - Si ON: slider 20%-50% con preview del valor en COP
     Ej: slider en 30% → "Depósito: $24.000 de $80.000 (6v6)"
   - Muestra tabla resumen de depósito por formato
```

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando venue | Skeleton con 3 cards de formato + 4 líneas de horario |
| Sin horarios hoy | Empty state: "No hay horarios disponibles para hoy" + selector de otro día |
| Todo ocupado | Todos los slots en rojo con texto "Ocupado" — CTA "Ver otro día" |
| Error cargando | Toast "Error al cargar horarios" + botón retry |
| Reserva exitosa | Toast "¡Reserva confirmada!" + navegación a detalle de reserva |
| Reserva pendiente pago | Card amarilla con timer "Paga en 14:32 min" |
| Sin reservas | Empty state: "Aún no tienes reservas" + CTA "Explorar sedes" |

### Consideraciones mobile-first
- Bottom sheet para confirmación (no modal centrado) — más accesible al pulgar
- Cards de formato con touch target mínimo 48x48px
- Slots horarios con altura mínima 56px para facilidad de tap
- Scroll horizontal para selector de días (carrusel tipo date picker)
- `pb-24` en todo el contenido para bottom nav
- Inputs con `text-base` mínimo (prevenir zoom iOS)

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Propósito | Props principales |
|------------|-----------|-------------------|
| `VenueCard` | Card de sede en lista de exploración | `venue: Venue`, `onSelect` |
| `FormatSelector` | Chips de formato (6v6, 9v9, 11v11) con precio | `formats: Format[]`, `selected`, `onSelect` |
| `DateCarousel` | Selector horizontal de fechas (hoy → +14 días) | `selectedDate`, `onSelect`, `disabledDates?` |
| `SlotList` | Lista de horarios disponibles/ocupados | `slots: Slot[]`, `onSelect` |
| `SlotCard` | Card individual de horario | `slot: Slot`, `available: boolean`, `onTap` |
| `BookingConfirmSheet` | Bottom sheet de confirmación con desglose depósito/resto | `slot`, `venue`, `totalPriceCOP`, `depositPercent`, `depositCOP`, `walletBalance` |
| `BookingDetailCard` | Detalle de reserva con estado y acciones | `booking: Booking` |
| `BookingTimer` | Countdown de expiración para pending_payment | `expiresAt: string` |
| `VenueAdminPanel` | Panel de configuración de sede | `venue: Venue` |
| `CourtConfigEditor` | Editor de canchas y combinaciones | `courts: Court[]`, `combos: CourtCombo[]` |
| `ScheduleEditor` | Editor de horarios semanales | `schedule: WeekSchedule` |
| `AdminBookingCalendar` | Vista calendario de reservas para admin | `bookings: Booking[]`, `venue: Venue` |

### Animaciones (Framer Motion)

| Elemento | Tipo | Detalles |
|----------|------|----------|
| `BookingConfirmSheet` | Bottom sheet slide-up | `initial: { y: "100%" }`, `animate: { y: 0 }`, `transition: { type: "spring", damping: 25 }` |
| `SlotCard` al seleccionar | Scale + color | `whileTap: { scale: 0.97 }`, background transition 200ms |
| `FormatSelector` chips | Layout animation | `layout` prop para reflow suave al cambiar selección |
| `BookingTimer` al expirar | Fade out + slide | `exit: { opacity: 0, y: -20 }`, duración 300ms |
| `SlotList` al cambiar fecha | Fade + slide lateral | `AnimatePresence mode="wait"`, slide en dirección del swipe |
| Toast de confirmación | Spring entry | Consistente con toasts existentes del proyecto |
| Transición entre pasos | Shared layout | `layoutId` en card seleccionada para transición fluida entre selección y confirmación |

### Responsive

| Breakpoint | Diseño |
|------------|--------|
| Mobile (< md) | Stack vertical: formato → fecha → slots. Bottom sheet para confirmación. 1 columna de slots |
| Desktop (md+) | Layout de 2 columnas: izq calendario/slots, der detalle/confirmación. Modal en lugar de bottom sheet. Grid 2 cols para slots |

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_viewed` | Usuario abre detalle de sede | `venue_id`, `venue_name`, `source` ("explore" \| "direct_link") |
| `booking_format_selected` | Tap en chip de formato | `venue_id`, `format` ("6v6" \| "9v9" \| "11v11") |
| `booking_slot_selected` | Tap en horario disponible | `venue_id`, `format`, `date`, `start_time` |
| `booking_confirmed` | Reserva creada exitosamente | `venue_id`, `booking_id`, `format`, `date`, `start_time`, `amount_cop`, `payment_method` ("wallet" \| "on_site" \| "free") |
| `booking_cancelled` | Reserva cancelada | `venue_id`, `booking_id`, `refunded`, `hours_before_start` |
| `booking_payment_expired` | Timer de 15min expiró | `venue_id`, `booking_id`, `format` |
| `booking_recharge_prompted` | Usuario ve "saldo insuficiente" | `venue_id`, `amount_required`, `current_balance`, `deficit` |
| `venue_admin_court_configured` | Admin guarda configuración de courts | `venue_id`, `courts_count`, `combos_count` |
| `venue_admin_schedule_updated` | Admin actualiza horarios | `venue_id`, `day_of_week`, `slots_count` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// ===== VENUE (Sede) =====
// Colección: venues/{venueId}
interface Venue {
  id: string;
  name: string;                    // "Sede Los Pinos"
  address: string;
  placeId: string;                 // Google Places ID
  lat: number;
  lng: number;
  locationId?: string;             // Referencia a Location existente (bridge para migración)
  createdBy: string;               // uid del admin
  active: boolean;
  depositRequired: boolean;        // ¿Requiere depósito anticipado vía wallet?
  depositPercent: number;           // 20-50 (porcentaje del precio total). Solo aplica si depositRequired=true
  imageURL?: string;               // Foto de la sede
  phone?: string;                  // Contacto
  description?: string;            // Descripción corta
  createdAt: string;               // ISO
  updatedAt: string;               // ISO
}

// ===== COURT (Cancha física) =====
// Sub-colección: venues/{venueId}/courts/{courtId}
interface Court {
  id: string;
  name: string;                    // "Cancha 1"
  baseFormat: CourtFormat;         // "6v6" — formato cuando se usa sola
  active: boolean;
  sortOrder: number;               // Para ordenar en UI admin
}

type CourtFormat = "5v5" | "6v6" | "7v7" | "8v8" | "9v9" | "10v10" | "11v11";

// ===== COURT COMBO (Combinación de canchas) =====
// Sub-colección: venues/{venueId}/court_combos/{comboId}
interface CourtCombo {
  id: string;
  name: string;                    // "Cancha Grande A"
  courtIds: string[];              // ["court1", "court2"] — courts que la componen
  resultingFormat: CourtFormat;    // "9v9"
  active: boolean;
}

// ===== SCHEDULE (Horario semanal) =====
// Sub-colección: venues/{venueId}/schedules/{dayOfWeek}
// dayOfWeek: "monday" | "tuesday" | ... | "sunday"
interface DaySchedule {
  dayOfWeek: DayOfWeek;
  enabled: boolean;                // ¿Abierto este día?
  slots: ScheduleSlot[];           // Bloques horarios del día
}

interface ScheduleSlot {
  startTime: string;               // "17:00"
  endTime: string;                 // "18:00"
  formats: FormatPricing[];        // Formatos disponibles en este bloque
}

interface FormatPricing {
  format: CourtFormat;             // "6v6"
  priceCOP: number;                // Centavos: 8000000 = $80.000
}

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

// ===== BOOKING (Reserva) =====
// Colección raíz: bookings/{bookingId}
interface Booking {
  id: string;
  venueId: string;
  venueName: string;               // Snapshot para mostrar sin JOIN
  venueAddress: string;            // Snapshot
  bookedBy: string;                // uid del usuario que reserva
  bookedByName: string;            // Snapshot del nombre
  bookedByPhotoURL?: string;       // Snapshot
  format: CourtFormat;             // "6v6"
  date: string;                    // "2026-04-18"
  startTime: string;               // "18:00"
  endTime: string;                 // "19:00"
  courtIds: string[];              // Courts asignados automáticamente ["court2"]
  courtNames: string[];            // Snapshot: ["Cancha 2"]
  status: BookingStatus;
  totalPriceCOP: number;            // Centavos — precio total de la cancha
  depositPercent: number;           // 20-50 (snapshot del % al momento de reservar)
  depositCOP: number;               // Centavos — monto del depósito (totalPriceCOP * depositPercent / 100)
  remainingCOP: number;             // Centavos — resto a pagar en sede (totalPriceCOP - depositCOP)
  paymentMethod: "wallet_deposit" | "on_site" | "free";  // wallet_deposit = depósito vía wallet, resto en sede
  paymentTxId?: string;             // ID de wallet_transaction del depósito
  expiresAt?: string;              // ISO — solo para pending_payment (15min TTL)
  cancelledBy?: string;            // uid de quien canceló (user o admin)
  cancelledAt?: string;            // ISO
  refundTxId?: string;             // ID de wallet_transaction del reembolso
  matchId?: string;                // Forward-compatibility: reserva → partido (v2)
  createdAt: string;               // ISO
  updatedAt: string;               // ISO
}

type BookingStatus =
  | "pending_payment"              // Creada, esperando pago (TTL 15min)
  | "confirmed"                    // Pagada o sin pago requerido
  | "completed"                    // Hora del slot ya pasó
  | "cancelled"                    // Cancelada por usuario o admin
  | "expired"                      // pending_payment expiró sin pago
  | "no_show";                     // Admin marcó como no-show

// ===== BLOCKED SLOT (Bloqueo manual) =====
// Sub-colección: venues/{venueId}/blocked_slots/{slotId}
interface BlockedSlot {
  id: string;
  date: string;                    // "2026-04-20"
  startTime: string;               // "18:00"
  endTime: string;                 // "19:00"
  courtIds: string[];              // Courts bloqueados (vacío = todos)
  reason?: string;                 // "Mantenimiento"
  createdBy: string;
  createdAt: string;
}
```

### Algoritmo de asignación automática de canchas

```typescript
// lib/domain/court-allocation.ts — LÓGICA PURA, sin Firebase

/**
 * Asigna el mejor conjunto de courts para una reserva, priorizando
 * preservar la disponibilidad de combinaciones grandes.
 *
 * Estrategia: "Smallest Fit First"
 * 1. Obtener courts libres en el horario solicitado
 * 2. Filtrar combos que pueden satisfacer el formato pedido
 * 3. Ordenar opciones por "impacto" ascendente:
 *    - Preferir courts sueltos sobre courts que son parte de combos grandes
 *    - Si solo hay courts de combos, preferir el combo que bloquea MENOS combos grandes
 * 4. Retornar courtIds asignados o null si no hay disponibilidad
 */

interface AllocationInput {
  requestedFormat: CourtFormat;
  courts: Court[];
  combos: CourtCombo[];
  occupiedCourtIds: string[];      // Courts ya reservados en ese horario
  blockedCourtIds: string[];       // Courts bloqueados manualmente
}

interface AllocationResult {
  courtIds: string[];              // Courts asignados
  courtNames: string[];            // Para snapshot en booking
  comboUsed?: string;              // ID del combo usado (si aplica)
}

function allocateCourts(input: AllocationInput): AllocationResult | null;

/**
 * EJEMPLO CONCRETO:
 *
 * Sede "Los Pinos" tiene 4 canchas de 6v6:
 *   C1, C2, C3, C4
 *
 * Combos configurados:
 *   ComboA: C1+C2 → 9v9
 *   ComboB: C3+C4 → 9v9
 *   ComboFull: C1+C2+C3+C4 → 11v11
 *
 * Escenario: Llega reserva de 6v6 a las 18:00. Todas las canchas libres.
 *
 * Análisis de impacto por court:
 *   C1: participa en ComboA (9v9) + ComboFull (11v11) → impacto = 2
 *   C2: participa en ComboA (9v9) + ComboFull (11v11) → impacto = 2
 *   C3: participa en ComboB (9v9) + ComboFull (11v11) → impacto = 2
 *   C4: participa en ComboB (9v9) + ComboFull (11v11) → impacto = 2
 *
 * Todas iguales → desempate: preservar un combo completo.
 * Heurística: agrupar asignaciones en un mismo lado.
 *
 * Si C1 ya está ocupada (otra reserva de 6v6):
 *   - ComboA ya no es viable → C2 tiene impacto reducido (solo ComboFull, que tampoco es viable)
 *   - Asignar C2 (su combo ya está roto, no pierde nada más)
 *
 * Si se pide 9v9 y C1 está ocupada:
 *   - ComboA no viable (falta C1)
 *   - ComboB viable (C3+C4 libres) → asignar ComboB
 *
 * Si se pide 11v11 y C1 está ocupada:
 *   - ComboFull no viable → retornar null ("No hay disponibilidad para 11v11")
 */

// Cálculo de impacto de un court
function courtImpactScore(
  courtId: string,
  combos: CourtCombo[],
  occupiedCourtIds: string[]
): number {
  // Contar cuántos combos VIABLES (con todos sus courts libres) perderían
  // viabilidad si este court se ocupa
  return combos.filter(combo => {
    const isViable = combo.courtIds.every(id => !occupiedCourtIds.includes(id));
    const wouldBreak = combo.courtIds.includes(courtId);
    return isViable && wouldBreak;
  }).length;
}
```

### Capa de dominio (`lib/domain/`)

| Archivo | Funciones | Descripción |
|---------|-----------|-------------|
| `lib/domain/court-allocation.ts` | `allocateCourts()`, `courtImpactScore()`, `getViableCombos()`, `getAvailableFormats()` | Algoritmo de asignación puro |
| `lib/domain/booking.ts` | `isBookingRefundable()`, `isBookingExpired()`, `bookingStatusLabel()`, `calcDeposit()`, `calcRemaining()` | Helpers puros de reserva |
| `lib/domain/venue.ts` | `generateTimeSlots()`, `formatScheduleDisplay()`, `getAvailableSlotsForDate()` | Helpers de horarios y slots |
| `lib/domain/errors.ts` | `SlotUnavailableError`, `BookingExpiredError`, `VenueNotFoundError` | Nuevos errores tipados |

### Capa de API (`lib/`)

| Archivo | Funciones | Descripción |
|---------|-----------|-------------|
| `lib/venues.ts` | `getVenue()`, `getVenues()`, `getVenueCourts()`, `getVenueCombos()`, `getVenueSchedule()` | Lecturas Firestore de sedes |
| `lib/bookings.ts` | `getBookingsForSlot()`, `getUserBookings()`, `getVenueBookings()`, `subscribeToBooking()` | Lecturas y suscripciones de reservas |

### Cloud Functions nuevas (`functions/src/`)

| Función | Tipo | Descripción |
|---------|------|-------------|
| `createBooking` | `onCall` | Valida disponibilidad + asigna courts + debita depósito de wallet (si aplica) en una transacción |
| `cancelBooking` | `onCall` | Cancela reserva + reembolsa depósito si > 24h antes |
| `expirePendingBookings` | `onSchedule` | Cada 5min: marca como expired las bookings pending_payment con expiresAt < now |
| `completePassedBookings` | `onSchedule` | Cada 30min: marca como completed las bookings confirmed con fecha/hora pasada |

### Componentes UI (`app/`)

| Archivo | Cambio |
|---------|--------|
| `app/venues/page.tsx` | **Nuevo** — Explorar sedes |
| `app/venues/[id]/page.tsx` | **Nuevo** — Detalle de sede + selección de formato/horario |
| `app/venues/[id]/book/page.tsx` | **Nuevo** — Confirmación de reserva |
| `app/venues/admin/[id]/page.tsx` | **Nuevo** — Panel admin de sede |
| `app/bookings/page.tsx` | **Nuevo** — Mis reservas |
| `app/bookings/[id]/page.tsx` | **Nuevo** — Detalle de reserva |
| `components/booking/` | **Nuevo** — Todos los componentes listados en sección 7 |
| `components/skeletons/VenueSkeleton.tsx` | **Nuevo** — Skeleton de carga para sede |
| `components/skeletons/BookingsSkeleton.tsx` | **Nuevo** — Skeleton para lista de reservas |
| `components/BottomNav.tsx` | **Modificar** — Agregar tab "Reservas" o reestructurar navegación |
| `firestore.rules` | **Modificar** — Agregar reglas para venues, bookings, blocked_slots |
| `functions/src/bookings.ts` | **Nuevo** — Cloud Functions de reservas |

---

## 10. CRITERIOS DE ACEPTACIÓN

### Admin de sede
- [ ] Puede crear una sede con nombre, dirección (Google Places) y foto
- [ ] Puede agregar/editar/desactivar canchas físicas
- [ ] Puede definir combinaciones válidas de canchas con formato resultante
- [ ] Puede configurar horarios semanales con precios por formato
- [ ] Puede activar/desactivar pago anticipado vía wallet
- [ ] Puede bloquear slots específicos (mantenimiento, eventos)
- [ ] Puede ver calendario con todas las reservas del día/semana
- [ ] Puede cancelar reservas con reembolso automático

### Jugador
- [ ] Puede explorar sedes disponibles
- [ ] Puede seleccionar formato → fecha → horario en 3 taps
- [ ] Ve solo horarios disponibles (ocupados aparecen deshabilitados)
- [ ] Si pago requerido: ve precio, saldo y puede recargar inline
- [ ] Si pago requerido y saldo insuficiente: CTA de recarga con monto sugerido
- [ ] Si pago no requerido: reserva directa con un tap
- [ ] Reserva pendiente de pago expira en 15 minutos con timer visible
- [ ] Puede cancelar reserva con reembolso si > 24h antes
- [ ] Puede cancelar reserva sin reembolso si < 24h (con advertencia)
- [ ] Ve historial de reservas (próximas y pasadas)

### Sistema
- [ ] Asignación automática de canchas preserva combinaciones grandes
- [ ] No se permiten reservas solapadas en el mismo court físico
- [ ] Dos usuarios concurrentes no pueden reservar el mismo slot (transacción)
- [ ] Reservas pending_payment se expiran automáticamente tras 15 minutos
- [ ] Reservas confirmed se marcan como completed cuando pasa la hora
- [ ] Wallet se debita/acredita atómicamente con la reserva
- [ ] El módulo funciona independiente de matches (sin side-effects)

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/court-allocation.ts` | **Nuevo** — Algoritmo de asignación puro |
| `lib/domain/booking.ts` | **Nuevo** — Helpers de estado y validación |
| `lib/domain/venue.ts` | **Nuevo** — Helpers de horarios y slots |
| `lib/domain/errors.ts` | **Modificar** — Agregar SlotUnavailableError, BookingExpiredError, VenueNotFoundError |
| `lib/venues.ts` | **Nuevo** — API Firestore para sedes |
| `lib/bookings.ts` | **Nuevo** — API Firestore para reservas |
| `app/venues/page.tsx` | **Nuevo** — Explorar sedes |
| `app/venues/[id]/page.tsx` | **Nuevo** — Detalle sede + booking flow |
| `app/venues/[id]/book/page.tsx` | **Nuevo** — Confirmación |
| `app/venues/admin/[id]/page.tsx` | **Nuevo** — Panel admin |
| `app/bookings/page.tsx` | **Nuevo** — Mis reservas |
| `app/bookings/[id]/page.tsx` | **Nuevo** — Detalle reserva |
| `components/booking/FormatSelector.tsx` | **Nuevo** |
| `components/booking/DateCarousel.tsx` | **Nuevo** |
| `components/booking/SlotList.tsx` | **Nuevo** |
| `components/booking/SlotCard.tsx` | **Nuevo** |
| `components/booking/BookingConfirmSheet.tsx` | **Nuevo** |
| `components/booking/BookingDetailCard.tsx` | **Nuevo** |
| `components/booking/BookingTimer.tsx` | **Nuevo** |
| `components/booking/VenueCard.tsx` | **Nuevo** |
| `components/booking/AdminBookingCalendar.tsx` | **Nuevo** |
| `components/booking/CourtConfigEditor.tsx` | **Nuevo** |
| `components/booking/ScheduleEditor.tsx` | **Nuevo** |
| `components/skeletons/VenueSkeleton.tsx` | **Nuevo** |
| `components/skeletons/BookingsSkeleton.tsx` | **Nuevo** |
| `components/BottomNav.tsx` | **Modificar** — Agregar navegación a reservas |
| `functions/src/bookings.ts` | **Nuevo** — Cloud Functions |
| `firestore.rules` | **Modificar** — Reglas para venues, courts, bookings |
| `firestore.indexes.json` | **Modificar** — Índices compuestos |

---

## ⚠️ Decisiones de Diseño Clave — APROBADAS

### 1. ✅ Venue como entidad separada de Location
`Venue` es una entidad nueva independiente de `Location`. Location es un punto geográfico simple para partidos; Venue es la infraestructura completa de una sede (courts, combos, schedules, pagos). Se conectan con `venue.locationId` opcional para bridge futuro.

### 2. ✅ Cancha invisible para el jugador — Algoritmo "Smallest Fit First"
El jugador solo elige formato y horario. El sistema asigna la cancha física automáticamente priorizando preservar combinaciones grandes. El court asignado no se muestra en la UI del jugador.

### 3. ✅ Bookings como colección raíz
`bookings/{id}` en raíz de Firestore para facilitar queries globales ("mis reservas", expiración automática). Se filtra por `venueId` para queries por sede.

### 4. ✅ Depósito parcial configurable (20%-50%)
El admin configura un porcentaje de depósito entre 20% y 50% del precio total. La UI muestra el desglose: precio total, depósito en COP, y resto a pagar en sede. Si el admin desactiva el depósito, la reserva es gratuita con pago completo en sede. El reembolso por cancelación (>24h) devuelve solo el depósito.

### 5. ✅ Módulo 100% independiente de matches (v1)
Cero integración con partidos. El campo `matchId` existe en Booking como forward-compatibility para v2 donde una reserva podrá convertirse en partido.
