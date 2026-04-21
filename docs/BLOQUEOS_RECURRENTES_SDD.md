# Feature: Bloqueos Recurrentes con Excepciones

## 📋 Specification-Driven Development (SDD)

Permitir al admin de sede bloquear un mismo horario semanal (ej. "Lunes 7–9 PM, cliente fijo Juan Pérez") sin tener que crear un bloqueo por fecha, y cancelar instancias puntuales sin perder la recurrencia.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Los admins de sede reciben clientes recurrentes ("fijos") que reservan el mismo slot todas las semanas. Hoy el admin debe crear manualmente un bloqueo por cada fecha, lo cual es tedioso y propenso a olvidos. Esta feature agrega recurrencia semanal a `BlockedSlot` junto con un campo `clientName` visible, y permite excepciones puntuales (ej. "este lunes Juan no viene") sin eliminar la recurrencia.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-1 | Un bloqueo puede ser **puntual** (una sola fecha) o **recurrente** con frecuencia: `daily`, `weekly`, `biweekly` (cada 2 semanas) o `monthly` (mismo día del mes). | Toggle "Se repite" + dropdown de frecuencia en formulario. |
| RN-2 | Un bloqueo recurrente requiere `startDate` obligatorio y `endDate` opcional. Si `endDate` está vacío, aplica indefinidamente. | Date pickers con validación. |
| RN-3 | El admin puede agregar `clientName` opcional (ej. "Juan Pérez") y `reason` opcional. **`clientName` solo lo ve el admin**, no es visible para jugadores (se filtra en la API antes de devolver al cliente no-admin). `reason` tampoco se expone al jugador. | Input opcional. Badge en card del admin. Jugador ve "Ocupado" sin detalle. |
| RN-4 | Para cancelar una instancia puntual de un bloqueo recurrente, el admin agrega la fecha a `exceptDates`. La recurrencia continúa activa para las demás fechas. | Botón "Cancelar solo este día" en instancia expandida. |
| RN-5 | Para eliminar la recurrencia completa, el admin borra el documento padre. Las instancias desaparecen de fechas futuras. | Botón "Eliminar recurrencia" con confirmación. |
| RN-6 | Un bloqueo recurrente puede tener `endDate` modificable (ej. "hasta fin de año"). Cambiar `endDate` solo afecta instancias futuras; el pasado no se re-escribe. | Input editable en modal de edición. |
| RN-7 | La validación de solapamiento con bookings existentes al crear/expandir un bloqueo se hace **server-side** (Cloud Function `createBooking` expande recurrencias al validar disponibilidad). | El jugador ve el slot como "Ocupado" sin motivo. |
| RN-8 | Al crear un bloqueo recurrente, si ya existen bookings confirmados en instancias futuras, el admin recibe una advertencia con la lista de conflictos y puede (a) cancelar el bloqueo, (b) proceder y cancelar esos bookings manualmente después. No se cancelan bookings automáticamente. | Modal de advertencia con lista de conflictos. |
| RN-9 | Para `weekly`/`biweekly`: el `dayOfWeek` se deriva de `startDate` automáticamente. Para `monthly`: el `dayOfMonth` (1–28) se deriva de `startDate`. Para `daily`: no se deriva nada. | `startDate` es la fuente de verdad. No hay dropdown separado de "día". |
| RN-10 | Las excepciones (`exceptDates`) deben ser fechas que (a) estén dentro del rango `[startDate, endDate]` si `endDate` existe, y (b) caigan en una instancia válida de la recurrencia. | Validación silenciosa (el botón "Cancelar solo este día" solo aparece en instancias válidas). |
| RN-11 | Un bloqueo recurrente **no** previene la creación de bookings en instancias ya confirmadas antes del bloqueo (no se cancela retroactivamente). Solo aplica a reservas **futuras no confirmadas**. | Mensaje informativo al crear recurrencia con bookings futuros existentes. |

---

## 2. ESCALABILIDAD

### Volumen esperado
- **Por sede**: máximo ~10 clientes fijos simultáneos → 10 docs de tipo recurrente por venue.
- **Por venue-día**: 0–5 bloqueos puntuales + expansión de 1–3 recurrentes activos que caen ese día = 3–8 docs efectivos devueltos por `getBlockedSlots(venueId, date)`.
- **Instancias expandidas**: al renderizar la lista del admin para un rango (ej. "próximos 30 días"), una recurrencia puede expandirse a ~4 instancias. Si hay 10 recurrentes, son 40 instancias virtuales — se calculan en memoria (no en Firestore).

### Índices Firestore requeridos

Subcolección `venues/{venueId}/blocked_slots`:

```
// Índice compuesto para filtrar recurrentes activos
- recurrence.type (Ascending)
- recurrence.startDate (Ascending)
```

Y el índice existente (automático):
```
- date (Ascending)
```

La query por fecha usa dos sub-queries en paralelo:
1. `where("date", "==", date)` — puntuales (`recurrence` ausente).
2. `where("recurrence.type", "in", ["daily", "weekly", "biweekly", "monthly"])` — todas las recurrencias del venue (típicamente ≤ 10 docs). Filtrado en cliente/servidor por lógica de frecuencia + `startDate <= date <= endDate` y `date ∉ exceptDates`.

Nota: un solo `where` genérico evita tener que mantener índices separados por tipo. Dado el volumen esperado (≤10 recurrencias activas por venue), este trade-off es óptimo.

### Paginación
No aplica. Máximo ~50 bloqueos activos por venue a la vez → un solo fetch.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

**Cloud Function `createBooking`** (ya existe): antes de crear el booking lee `blocked_slots` y valida solapamiento. Debe **expandir recurrencias al vuelo** dentro de la misma transacción de lectura para evitar que un admin cree un bloqueo recurrente mientras un jugador reserva.

**Cloud Function nueva `createBlockedSlot`** (reemplaza `addBlockedSlot` client-side para recurrentes):
- Lee bookings confirmados cuyas fechas caen en el rango del bloqueo (para reporte de conflictos).
- Escribe el documento.
- Debe usar `runTransaction` para garantizar que no se cree una recurrencia mientras un booking se confirma en la misma ventana.

### Race conditions identificadas

| Escenario | Mitigación |
|-----------|------------|
| Admin crea bloqueo recurrente lunes 7 PM ↔ jugador reserva lunes 7 PM simultáneamente. | Transacción en `createBooking` lee recurrencias en la misma transacción; una de las dos escrituras se reintenta y falla por conflicto. |
| Admin agrega `exceptDate` ↔ Admin elimina recurrencia. | `arrayUnion(exceptDates, date)` vs `deleteDoc`. El segundo en llegar recibe "not-found" → toast "Recurrencia ya fue eliminada". |
| Dos admins editan `endDate` a la vez. | Last-write-wins aceptable (no crítico: solo afecta instancias futuras). |
| Jugador intenta reservar una fecha que está en `exceptDates` (debería estar disponible). | La expansión server-side filtra `exceptDates` correctamente. Si la reserva pasa, el slot se marca como ocupado para siguientes usuarios. |

---

## 4. SEGURIDAD

### Autenticación y autorización
- **Leer bloqueos** de una venue: cualquier usuario autenticado (necesario para que jugadores vean disponibilidad).
- **Crear/editar/borrar bloqueos**: solo `super_admin` o `location_admin` asignado a esa venue.

### Firestore Rules requeridas

Las reglas actuales en [firestore.rules](firestore.rules) para `blocked_slots` ya cubren el modelo:

```
match /blocked_slots/{slotId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && (isSuperAdmin() || isLocationAdminFor(venueId));
}
```

**No requiere cambios** — el contrato de quién puede escribir no cambia, solo el shape del documento.

Validación adicional server-side (en Cloud Function `createBlockedSlot`):
- `recurrence.type` ∈ `["daily", "weekly", "biweekly", "monthly"]`.
- `recurrence.startDate` es un YYYY-MM-DD válido.
- Para `monthly`: `startDate.getDate()` debe estar entre 1–28 (para evitar ambigüedad con meses de 28/29/30/31 días).
- `recurrence.endDate`, si existe, es ≥ `startDate`.
- `startTime < endTime` y ambos en formato HH:MM 24h.
- `courtIds[]` no vacío y todos pertenecen al venue.
- `clientName` ≤ 80 chars (sanitizar trim, sin HTML).
- `reason` ≤ 200 chars.
- `exceptDates[]` ≤ 200 elementos (hard cap).

### Filtrado de campos privados
La función `getBlockedSlots(venueId, date)` devuelve dos shapes:
- **Para admins** (super_admin o location_admin de la venue): shape completo con `clientName` y `reason`.
- **Para jugadores**: shape sin `clientName` ni `reason` — solo `date/startTime/endTime/courtIds` (lo necesario para ocultar el slot).

Implementado en la capa API ([lib/venues.ts](lib/venues.ts)): detectar rol del usuario via `getAuth().currentUser` + perfil cacheado y omitir campos antes de retornar. El filtrado también se aplica server-side en queries (Firestore Rules siguen permitiendo lectura; el filtrado es a nivel de aplicación para facilidad).

### Validaciones de input
- En cliente: mismas que arriba con feedback inmediato.
- En servidor: re-validar todo (OWASP: nunca confiar en el cliente).

### Datos sensibles
- `clientName` y `reason` son **privados del admin**. Se filtran antes de devolverlos a jugadores (ver "Filtrado de campos privados" arriba). El jugador solo recibe lo necesario para saber que el slot está ocupado.
- **Importante**: Firestore Rules permiten que cualquier autenticado lea el documento completo. El filtrado es a nivel de aplicación. Esto es aceptable porque (a) un atacante con Firestore SDK directo podría leer `clientName`, pero (b) ninguna UI lo expone. Si se requiere estricta privacidad, migrar a Cloud Function `getBlockedSlots` con filtrado server-side obligatorio — tradeoff de latencia vs. privacidad criptográfica.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `firestore/unavailable` al leer bloqueos | Sin internet | Toast "Sin conexión. Mostrando datos locales" + usar cache de Firestore |
| `createBlockedSlot` timeout (>10s) | Cloud Function fría | Spinner con texto "Puede tardar unos segundos…" (no auto-retry — el usuario decide) |
| Validación server-side falla (día de semana no coincide con startDate) | Bug cliente o manipulación directa | Toast con detalle copiable vía `handleError()` |
| `arrayUnion(exceptDates, date)` en doc ya eliminado | Admin eliminó recurrencia desde otro dispositivo | Toast "La recurrencia ya no existe" + recargar lista |
| Conflictos detectados al crear recurrencia (bookings existentes) | Overlap con reservas futuras | Modal de advertencia con lista y acción "Continuar de todos modos" / "Cancelar" |

### Retry strategy
- Lectura de bloqueos: **sin retry automático**, Firestore maneja offline.
- Escrituras: sin retry automático (la transacción ya reintenta 5 veces internamente).

### Degradación elegante
- Si la expansión de recurrencias lanza excepción (ej. `startDate` corrupto), se loggea y se skipea ese documento; el resto se muestra. El jugador nunca ve un slot fantasma por un error de data.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo A: Crear bloqueo recurrente (happy path)

1. Admin abre tab "Bloqueos" → ve lista del día actual + botón "+ Nuevo bloqueo".
2. Admin llena formulario: fecha, hora inicio, hora fin, canchas, motivo/cliente.
3. Admin activa toggle **"Se repite cada semana"** → aparece campo "Hasta (opcional)" con date picker.
4. Admin confirma → llamada a Cloud Function `createBlockedSlot`.
5. Function detecta 2 bookings futuros conflictivos → responde con `conflicts: [{date, startTime, bookingId, bookedBy}]`.
6. UI muestra modal "Hay 2 reservas futuras en este horario" con lista + acciones ["Continuar de todos modos", "Cancelar"].
7. Admin presiona "Continuar" → llamada nuevamente con `force: true`.
8. Toast "Bloqueo recurrente creado. Recuerda cancelar manualmente las reservas en conflicto."

### Flujo B: Cancelar instancia puntual

1. Admin en tab "Bloqueos" navega a "Ver por semana" → ve lista de instancias expandidas por día.
2. Instancia recurrente muestra badge 🔁 + nombre del cliente.
3. Admin presiona menú `⋮` en la instancia → opciones: "Cancelar solo este día", "Editar recurrencia", "Eliminar recurrencia completa".
4. Presiona "Cancelar solo este día" → modal de confirmación "Se cancelará solo el lunes 27 de abril. Las demás fechas siguen activas."
5. Confirma → `arrayUnion(exceptDates, "2026-04-27")`.
6. Toast "Cancelado solo esa fecha". Instancia desaparece de esa celda.

### Flujo C: Jugador intenta reservar sobre un bloqueo recurrente

1. Jugador entra a la sede, selecciona formato + fecha (lunes).
2. El slot 7–9 PM aparece deshabilitado con badge "Ocupado".
3. (No hay mensaje de "Cliente fijo" visible para el jugador — privacidad).
4. Si el jugador intenta reservar el slot anterior y el horario se extiende al bloqueado, el backend rechaza con "Este horario está ocupado".

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando lista | Skeleton de 3 cards con shimmer |
| Vacío | Empty state "No hay bloqueos. Los clientes fijos aparecerán aquí." + CTA `+ Nuevo bloqueo` |
| Error al cargar | Toast con retry inline + mantener lista previa si existe |
| Formulario abierto | Bottom sheet (mobile) / modal lateral (desktop) con animación slide-up |
| Creando bloqueo | Botón "Crear" con spinner, deshabilitado |
| Conflictos detectados | Modal secundario con lista de bookings conflictivos |
| Éxito | Toast verde + cierre de formulario + scroll a la nueva card |
| Cancelando instancia | Card con opacidad 50% + spinner en botón |

### Consideraciones mobile-first
- Form inputs con `text-base` (16px) para evitar zoom iOS (regla #9 de CLAUDE.md).
- Bottom sheet con handle para cerrar deslizando.
- Toggle "Se repite" prominente (switch grande 44x24 min).
- `pb-24 md:pb-0` en el contenedor del editor.

### Reactividad en tiempo real
La vista del jugador (`app/venues/[id]/page.tsx`) y el calendario admin (`components/booking/AdminBookingCalendar.tsx`) escuchan Firestore con `onSnapshot` a través de `subscribeToBookingsForDate` y `subscribeToBlockedSlots`.

- Cuando otro usuario reserva un slot, el slot aparece como "Ocupado" sin refrescar.
- Cuando el admin crea/elimina un bloqueo, los slots afectados cambian en vivo.
- Las suscripciones se limpian al cambiar de fecha o desmontar el componente.
- Para recurrencias, `subscribeToBlockedSlots` compone 2 `onSnapshot` (puntuales del día + todas las recurrencias) y emite solo cuando ambos entregan su primer snapshot — evita flashes de "disponible" antes de cargar recurrencias.
- La validación server-side en `createBooking` Cloud Function queda como red de seguridad para la race del último segundo.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

- **`RecurrenceToggle`** → `{ enabled: boolean, onChange: (v: boolean) => void }` — switch con label "Se repite cada semana".
- **`RecurrenceDateRange`** → `{ startDate, endDate, onChange }` — dos date pickers con `endDate` opcional.
- **`BlockedSlotCard`** (refactor del existente) → acepta `isRecurring`, `clientName`, `exceptDates` para renderizar badge 🔁 y menú contextual.
- **`ConflictsWarningModal`** → `{ conflicts: BookingConflict[], onConfirm, onCancel }` — lista con fecha/hora/usuario de cada conflicto.
- **`CancelInstanceDialog`** → `{ date, blockedSlotId, onConfirm, onCancel }` — confirmación con texto "Cancelar solo [fecha]".

### Componentes modificados

- **`BlockedSlotsEditor`** — agregar toggle de recurrencia en formulario + tab "Ver por semana" adicional al "Ver por día" actual.

### Animaciones (Framer Motion)

- Bottom sheet del formulario: `initial={{ y: "100%" }}` → `animate={{ y: 0 }}` con `transition={{ type: "spring", damping: 25 }}`.
- Badge 🔁 de recurrencia: `animate={{ scale: [1, 1.1, 1] }}` una vez al montar para destacar.
- Modal de conflictos: `AnimatePresence` con fade + scale-in (`initial={{ opacity: 0, scale: 0.95 }}`).
- Cancelación de instancia: card se encoge (`animate={{ height: 0, opacity: 0 }}`) con `transition={{ duration: 0.2 }}` antes de desaparecer.

### Responsive
- **Mobile (< 768px)**: formulario en bottom sheet full-width, un campo por línea.
- **Desktop (md:)**: modal centrado, campos en grid de 2 columnas, fecha y hora en la misma fila.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `blocked_slot_created` | Bloqueo puntual o recurrente creado exitosamente | `venue_id`, `is_recurring` (bool), `day_of_week?`, `has_end_date` (bool), `has_client_name` (bool), `courts_count` |
| `blocked_slot_recurrence_exception_added` | Admin cancela una instancia puntual | `venue_id`, `blocked_slot_id`, `except_date` |
| `blocked_slot_recurrence_deleted` | Recurrencia completa eliminada | `venue_id`, `blocked_slot_id`, `duration_days` (desde `startDate` hasta hoy) |
| `blocked_slot_conflicts_shown` | Modal de conflictos mostrado al crear recurrencia | `venue_id`, `conflicts_count` |
| `blocked_slot_conflicts_forced` | Admin confirmó crear a pesar de conflictos | `venue_id`, `conflicts_count` |

Propiedades globales ya incluidas automáticamente por `initAnalytics`: `user_id`, `admin_type`.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

**[lib/domain/venue.ts](lib/domain/venue.ts)** — extender `BlockedSlot`:

```typescript
export interface BlockedSlot {
    id: string;
    date: string | null;            // null si es recurrente
    startTime: string;              // HH:MM
    endTime: string;                // HH:MM
    courtIds: string[];
    reason?: string;
    clientName?: string;            // NUEVO
    recurrence?: BlockedSlotRecurrence; // NUEVO
    exceptDates?: string[];         // NUEVO - YYYY-MM-DD list
    createdBy: string;
    createdAt: string;
    updatedAt?: string;             // NUEVO
}

export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

export interface BlockedSlotRecurrence {
    type: RecurrenceType;
    startDate: string;              // YYYY-MM-DD — fuente de verdad del patrón
    endDate?: string;               // YYYY-MM-DD (opcional, indefinido si falta)
}

// Derivaciones del patrón (no guardadas, calculadas):
// - weekly/biweekly: dayOfWeek = new Date(startDate).getDay()
// - monthly: dayOfMonth = new Date(startDate).getDate() (validado 1-28)
// - daily: se repite todos los días desde startDate

export interface BookingConflict {
    date: string;
    startTime: string;
    endTime: string;
    bookingId: string;
    bookedBy: string;
    bookedByName: string;
}
```

### Capa de dominio (`lib/domain/`)

**Nuevo archivo [lib/domain/blocked-slots.ts](lib/domain/blocked-slots.ts)**:

```typescript
// Expande una lista de BlockedSlot (mezcla de puntuales + recurrentes)
// a las instancias efectivas para una fecha dada.
export function expandBlockedSlotsForDate(
    slots: BlockedSlot[],
    date: string,
): BlockedSlot[];

// Verifica si una fecha aplica a una recurrencia (dayOfWeek match,
// rango válido, no está en exceptDates).
export function doesRecurrenceApplyToDate(
    recurrence: BlockedSlotRecurrence,
    exceptDates: string[] | undefined,
    date: string,
): boolean;

// Lista las fechas futuras donde aplica una recurrencia hasta un horizonte.
export function listFutureInstances(
    slot: BlockedSlot,
    fromDate: string,
    horizonDays: number,
): string[];
```

### Capa de API (`lib/`)

**[lib/venues.ts](lib/venues.ts)** — modificar:

```typescript
// Cambio: ahora hace 2 queries en paralelo (puntuales + recurrentes del día)
// y expande recurrencias filtrando por dayOfWeek/startDate/endDate/exceptDates.
export async function getBlockedSlots(venueId: string, date: string): Promise<BlockedSlot[]>;

// Nueva: lista todos los bloqueos del venue (para vista "por semana" del admin)
export async function getAllBlockedSlots(venueId: string): Promise<BlockedSlot[]>;

// Nueva: agrega una excepción a una recurrencia
export async function addBlockedSlotException(
    venueId: string,
    slotId: string,
    date: string,
): Promise<void>;

// Nueva: edita recurrencia (endDate, clientName, reason)
export async function updateBlockedSlot(
    venueId: string,
    slotId: string,
    changes: Partial<Pick<BlockedSlot, "endDate" | "clientName" | "reason" | "courtIds">>,
): Promise<void>;

// Nueva: suscripción reactiva al set efectivo de bloqueos del día
// (one-off + recurrencias expandidas). Compone 2 onSnapshot internos y
// emite solo cuando ambos han entregado su primer snapshot.
export function subscribeToBlockedSlots(
    venueId: string,
    date: string,
    callback: (slots: BlockedSlot[]) => void,
    includePrivate?: boolean,
): () => void;
```

**[lib/bookings.ts](lib/bookings.ts)** — agregar:

```typescript
// Nueva: suscripción reactiva a las reservas confirmed/pending_payment
// del venue+fecha. Permite que la UI del jugador refleje cambios en vivo
// cuando otro usuario reserva o cancela.
export function subscribeToBookingsForDate(
    venueId: string,
    date: string,
    callback: (bookings: Booking[]) => void,
): () => void;
```

### Cloud Functions (`functions/src/`)

**Nueva función `createBlockedSlot`** en [functions/src/blocked-slots.ts](functions/src/blocked-slots.ts):

- Valida auth (super_admin o location_admin).
- Valida input (tipos, rango, overlap de `dayOfWeek` con `startDate`).
- Lee bookings confirmed futuros en el rango → arma lista de `conflicts[]`.
- Si `conflicts.length > 0` y `!force` → retorna `{ conflicts }` sin crear.
- Si `force` o sin conflictos → crea el doc.
- Log analytics.

**Modificar `createBooking` en [functions/src/bookings.ts](functions/src/bookings.ts)**:

- Al leer `blocked_slots`, hacer 2 queries (puntuales + recurrentes) y expandir.
- Cambiar la lógica de filtrado para respetar `exceptDates`.

### Componentes UI (`app/` y `components/`)

- **[components/booking/BlockedSlotsEditor.tsx](components/booking/BlockedSlotsEditor.tsx)** — agregar toggle recurrencia, tab de vista semanal, menú contextual.
- **[components/booking/RecurrenceToggle.tsx](components/booking/RecurrenceToggle.tsx)** — nuevo.
- **[components/booking/ConflictsWarningModal.tsx](components/booking/ConflictsWarningModal.tsx)** — nuevo.
- **[app/venues/admin/[id]/page.tsx](app/venues/admin/[id]/page.tsx)** — sin cambios (ya incluye el editor en la tab `blocked`).

---

## 10. CRITERIOS DE ACEPTACIÓN

### Admin
- [ ] Puede crear un bloqueo puntual (comportamiento actual intacto).
- [ ] Puede crear un bloqueo recurrente semanal con `startDate` y `endDate` opcional.
- [ ] Ve un badge 🔁 y el `clientName` en las cards de bloqueos recurrentes.
- [ ] Puede cancelar una instancia puntual sin afectar otras fechas (`exceptDates`).
- [ ] Puede eliminar una recurrencia completa.
- [ ] Puede editar `endDate` y `clientName` de una recurrencia existente.
- [ ] Al crear una recurrencia con conflictos de bookings futuros, ve el modal con la lista y decide si proceder.
- [ ] Puede ver la lista "por semana" con instancias expandidas.

### Jugador
- [ ] Ve slots recurrentes como "Ocupado" en fechas futuras.
- [ ] No ve el nombre del cliente fijo (solo el admin lo ve).
- [ ] En fechas con `exceptDate`, el slot aparece disponible normalmente.
- [ ] La lista de horarios del día se actualiza reactivamente (sin refrescar) cuando otro usuario reserva/cancela o el admin crea/elimina un bloqueo.

### Sistema
- [ ] `createBooking` rechaza reservas que se solapan con una instancia expandida de recurrencia.
- [ ] `createBooking` permite reservas en fechas que están en `exceptDates`.
- [ ] No se pueden crear recurrencias con `dayOfWeek` distinto al `getDay()` de `startDate`.
- [ ] Firestore Rules permiten lectura a cualquier autenticado y escritura solo a admins de la venue.
- [ ] Analytics logea `blocked_slot_created` con `is_recurring` correcto.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| [lib/domain/venue.ts](lib/domain/venue.ts) | **Modificar** — extender `BlockedSlot`, agregar `BlockedSlotRecurrence`, `BookingConflict` |
| [lib/domain/blocked-slots.ts](lib/domain/blocked-slots.ts) | **Nuevo** — `expandBlockedSlotsForDate`, `doesRecurrenceApplyToDate`, `listFutureInstances` |
| [lib/venues.ts](lib/venues.ts) | **Modificar** — `getBlockedSlots` con 2 queries, agregar `getAllBlockedSlots`, `addBlockedSlotException`, `updateBlockedSlot`, `subscribeToBlockedSlots` (reactivo) |
| [lib/bookings.ts](lib/bookings.ts) | **Modificar** — agregar `subscribeToBookingsForDate` (reactivo) |
| [app/venues/[id]/page.tsx](app/venues/[id]/page.tsx) | **Modificar** — reemplazar fetch one-shot de bookings/blocks por suscripciones onSnapshot |
| [components/booking/AdminBookingCalendar.tsx](components/booking/AdminBookingCalendar.tsx) | **Modificar** — calendario admin muestra reservas + bloqueos mezclados y ordenados por hora |
| [components/booking/SlotList.tsx](components/booking/SlotList.tsx) | **Modificar** — filtro segmented AM/PM/Todos |
| [functions/src/blocked-slots.ts](functions/src/blocked-slots.ts) | **Nuevo** — Cloud Function `createBlockedSlot` con detección de conflictos |
| [functions/src/bookings.ts](functions/src/bookings.ts) | **Modificar** — expansión de recurrencias en validación de `createBooking` |
| [functions/src/index.ts](functions/src/index.ts) | **Modificar** — exportar `createBlockedSlot` |
| [components/booking/BlockedSlotsEditor.tsx](components/booking/BlockedSlotsEditor.tsx) | **Modificar** — toggle recurrencia, vista semanal, menú contextual |
| [components/booking/RecurrenceToggle.tsx](components/booking/RecurrenceToggle.tsx) | **Nuevo** — switch con label |
| [components/booking/ConflictsWarningModal.tsx](components/booking/ConflictsWarningModal.tsx) | **Nuevo** — modal de conflictos |
| [lib/analytics.ts](lib/analytics.ts) | **Modificar** — eventos nuevos `blocked_slot_*` |
| [firestore.indexes.json](firestore.indexes.json) | **Modificar** — índice compuesto para `recurrence.dayOfWeek` |

---

## ⚠️ Decisiones de Diseño Clave

Antes de implementar, confirma estas decisiones:

1. **Expansión en runtime, no materialización.** No se generan documentos por cada instancia futura; las recurrencias se expanden al leer. Esto simplifica el schema pero implica que `getBlockedSlots(venueId, date)` hace 2 queries. Alternativa rechazada: materializar N instancias en un cron diario — más complejo y hard to edit.

2. **`createBlockedSlot` se promueve a Cloud Function.** Hoy `addBlockedSlot` es directo desde cliente. Para detectar conflictos con bookings futuros se requiere lectura en servidor. +~500ms de latencia pero habilita validación robusta y evita race conditions.

3. **Conflictos con bookings futuros NO se cancelan automáticamente.** Cuando el admin crea un bloqueo recurrente "Lunes 7–9 PM" pero ya existen reservas confirmadas en esos slots futuros (otros jugadores que reservaron antes), el sistema muestra la lista al admin y deja que él decida si procede (y resuelve con los jugadores fuera del sistema) o cancela la recurrencia. **Nunca se cancela una reserva del jugador sin acción consciente del admin** — protege al jugador de perder su reserva silenciosamente.

4. **`clientName` y `reason` son privados del admin.** Se filtran en la capa API antes de devolverlos a jugadores. El jugador solo ve "Ocupado". Firestore Rules siguen permitiendo lectura completa (tradeoff por simplicidad); si se requiere privacidad estricta, migrar lectura a Cloud Function.

5. **4 frecuencias soportadas en v1**: `daily`, `weekly`, `biweekly` (cada 2 semanas), `monthly` (mismo día del mes). `startDate` es la fuente de verdad del patrón — no se guarda `dayOfWeek` ni `dayOfMonth` por separado, se derivan. Para `monthly`, se limita `startDate.getDate()` a 1–28 para evitar ambigüedad en febrero.
