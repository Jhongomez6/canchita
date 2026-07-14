# Feature: Concurrencia segura de reservas — Libro único de ocupación (availability ledger)

## 📋 Specification-Driven Development (SDD)

Eliminar el doble-booking bajo concurrencia haciendo que **toda** operación que ocupa un slot (aprobación online y bloqueo manual) contienda sobre un mismo documento de disponibilidad por sede-día, dentro de una transacción.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy dos operaciones concurrentes pueden reservar la **misma cancha física en el mismo horario** porque las transacciones **leen un query** (`db.collection("bookings").where(venueId+date+status).get()`) y **escriben un documento nuevo con auto-id**. Como ninguna transacción lee el documento que la otra escribe, Firestore no las serializa (phantom read / write-skew). El costo de un doble-booking es alto: dos clientes (o un cliente de la app y un walk-in del mostrador) llegan al mismo turno.

La solución es un **libro único de ocupación** por sede-día — `availability/{venueId}_{date}` — que es la fuente de verdad de qué cancha está tomada en qué rango. Todo lo que bloquea un slot pasa por una transacción que hace `tx.get(availability)` → verifica solapamiento → `tx.set(availability)` sobre **ese mismo doc**. Al contender el mismo documento, Firestore serializa las transacciones y el doble-booking se vuelve imposible.

### Causa raíz (diagnóstico verificado en código)
| # | Punto | Problema |
|---|-------|----------|
| 1 | `createBooking` (sede sin depósito → `confirmed` directo) — [functions/src/bookings.ts:610-729](../functions/src/bookings.ts#L610) | Lee ocupación con query (línea 614) y escribe booking nuevo con auto-id (línea 598). Dos confirmaciones del mismo slot no chocan. |
| 2 | `approveBookingDeposit` — [functions/src/bookings.ts:1274-1332](../functions/src/bookings.ts#L1274) | Re-valida con `allocateForApproval`, que lee con **query NO transaccional** (`db.collection(...).get()`, [línea 1193](../functions/src/bookings.ts#L1193)) — ni siquiera entra en el read-set de la txn. Dos aprobaciones del mismo slot no chocan. |
| 3 | `createBlockedSlot` (reserva manual/walk-in) — [functions/src/blocked-slots.ts:115-298](../functions/src/blocked-slots.ts#L115) | **No es transaccional** (query en [242](../functions/src/blocked-slots.ts#L242) → `set` en [296](../functions/src/blocked-slots.ts#L296)), escribe en **otra colección** (`blocked_slots`), y tiene **bug de status**: chequea `["confirmed","pending_payment"]` cuando los estados que bloquean son `["deposit_confirmed","confirmed","played"]`. La carrera online-vs-manual está totalmente abierta. |

### Cambio de flujo (decisión de producto ya tomada)
**Se unifica el flujo: TODA reserva nace `pending_approval` y requiere aprobación del admin**, incluso en sedes sin depósito. Se **elimina el path `confirmed` directo** de `createBooking`.
- `createBooking` pasa a crear **solo solicitudes** (`pending_approval`): no bloquea slot, **no toca** el ledger.
- El único punto online que bloquea slot es la **aprobación** del admin.
- **Trade-off aceptado explícitamente**: se pierde la confirmación instantánea en sedes sin depósito → el jugador espera al admin; mayor carga operativa. Se gana un único punto de bloqueo, mucho más fácil de asegurar.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| RN-1 | Toda reserva online nace `pending_approval` (solicitud). No bloquea slot. | El jugador ve "Solicitud enviada · en revisión", no "Confirmada". |
| RN-2 | El slot se bloquea **solo** cuando el admin aprueba (online) o cuando se crea un bloqueo manual one-off. Ambos pasan por el ledger `availability`. | Estado del slot solo cambia a "ocupado" tras aprobación/bloqueo. |
| RN-3 | Varias solicitudes `pending_approval` pueden coexistir sobre el mismo slot. Al aprobar una, si otra ya no tiene cancha libre, su aprobación falla con "slot ya no disponible". | El admin ve el conflicto al aprobar la segunda; debe rechazarla. |
| RN-4 | El ledger es la **única** fuente de verdad de ocupación. La query de bookings deja de decidir disponibilidad de escritura (solo se usa para lectura/UI). | — |
| RN-5 | Los bloqueos **recurrentes** NO entran al ledger (se crean con anticipación). Se consultan como plantillas al calcular ocupación. Solo bloqueos **one-off** entran al ledger. | — |
| RN-6 | Cancelar / rechazar / expirar / borrar una reserva o bloqueo que estaba en el ledger **libera** su entrada en la misma transacción. | El slot vuelve a estar disponible de inmediato. |
| RN-7 | Si la transacción falla por contención tras los reintentos del server (~5), el usuario recibe "Este horario acaba de ser tomado. Elegí otro horario." | Toast de error + refresco de disponibilidad. |
| RN-8 | (UI, complementario) En la vista de aprobación, el admin procesa **una aprobación a la vez** (botón deshabilitado mientras hay una en vuelo). Es UX; la seguridad real está en el ledger. | Botón "Aprobar" con estado `disabled`/spinner. |

### Alcance
- Backend (`functions/`): `createBooking`, `approveBookingDeposit`/`allocateForApproval`, `createBlockedSlot`, y los paths de release (`cancelBooking`, `rejectPaymentProof`, `expirePendingBookings`, `advanceBookingStatus` cuando aplique, `deleteBlockedSlot`).
- Nuevo helper de dominio de ocupación + colección `availability`.
- Migración de reservas/bloqueos activos al ledger.
- UI de aprobación admin: guardrail "una a la vez".

### Fuera de alcance
- Sharding fino del ledger (por cancha/bloque). Se deja **preparado** (helper `availabilityDocIds`) pero no se implementa: hoy el doc por sede-día tiene headroom de sobra (ver §2).
- Cerrar la carrera marginal de bloqueos **recurrentes** vs online (se crean con anticipación; riesgo despreciable). Follow-up si aparece.
- Rediseñar el flujo de depósito/wallet (se mantiene; solo cambia dónde se bloquea el slot).

---

## 2. ESCALABILIDAD

### Volumen esperado
- App de fútbol amateur, crecimiento gradual. Reservas por **sede-día** topeadas por capacidad física: p. ej. 5 canchas × ~15 franjas = ~75 slots/día como techo absoluto.
- Escrituras al ledger **solo** en aprobación + bloqueo manual + release. Ritmo humano, espaciado en horas. No en la creación de solicitudes (esas no tocan el ledger).

### Límite real (contención por documento)
Firestore soporta **~1 escritura sostenida/seg por documento** (ráfagas cortas aguantan más). El ledger concentra la contención en `availability/{venueId}_{date}`:
- Sedes distintas → docs distintos → **cero** contención. Escala horizontal con el número de sedes.
- Fechas distintas → docs distintos.
- Solo contienden operaciones de **misma sede + misma fecha** — que es exactamente el conjunto que debe serializarse.

Con el volumen esperado, **no se alcanza** el límite: las aprobaciones/bloqueos de una sede-día son decenas espaciadas, no ráfagas de >1/seg sostenido. Tamaño del doc: decenas de entradas pequeñas → lejísimos del límite de 1 MB.

### Palanca de sharding (preparada, no implementada)
La clave del/los doc(s) de contención se encapsula en un helper:
```typescript
// lib/domain/availability.ts (compartido functions ↔ cliente vía copia o package interno)
// Hoy: 1 doc por sede-día. Mañana (si una sede-día se vuelve hotspot): por cancha/bloque.
function availabilityDocIds(venueId: string, date: string, courtIds?: string[]): string[] {
  return [`${venueId}_${date}`]; // sharding futuro: courtIds.map(c => `${venueId}_${date}_${c}`)
}
```
La lógica de la transacción se escribe para reclamar **todos** los docs que devuelve el helper (hoy uno). Migrar a sharding = cambiar el helper + reclamar N docs, **sin** tocar la lógica de negocio.

### Índices Firestore requeridos
- **Ninguno nuevo.** El ledger se lee/escribe siempre por `documentId` (`availability/{venueId}_{date}`), que no requiere índice. Las queries existentes de bookings/blocked_slots (para lectura/UI) siguen igual.

### Paginación
- N/A. El ledger se accede por id directo, no se lista.

---

## 3. CONCURRENCIA SEGURA

### Modelo del documento de ocupación
```typescript
// Colección: availability/{venueId}_{date}
interface AvailabilityLedger {
  venueId: string;
  date: string;                 // "YYYY-MM-DD"
  entries: OccupancyEntry[];
  updatedAt: string;            // ISO
}
interface OccupancyEntry {
  sourceId: string;             // bookingId | blockedSlotId
  kind: "booking" | "block";    // online (aprobado) | bloqueo manual one-off
  courtIds: string[];           // todas las canchas que ocupa
  startTime: string;            // "HH:MM"
  endTime: string;              // "HH:MM"
}
```

### Función de dominio pura (compartida, testeable sin Firebase)
```typescript
// Solapamiento de rango horario.
const overlaps = (a: {startTime:string; endTime:string}, b: {startTime:string; endTime:string}) =>
  a.startTime < b.endTime && a.endTime > b.startTime;

// Canchas ocupadas por el ledger + bloqueos recurrentes aplicables, en un rango dado.
function occupiedCourtIds(
  ledger: AvailabilityLedger | null,
  recurringBlocksForDate: OccupancyEntry[],   // plantillas expandidas a la fecha
  range: { startTime: string; endTime: string },
  excludeSourceId?: string,                    // excluir la propia reserva (re-aprobación)
): Set<string> { /* recorre entries + recurringBlocksForDate, filtra por overlaps, junta courtIds */ }
```

### Operaciones que requieren `runTransaction()` sobre el ledger

**A) `approveBookingDeposit` (online) — bloquea slot**
```
tx.get(bookingRef)                                  // read
tx.get(availabilityRef = availability/{venueId}_{date})  // read — PUNTO DE CONTENCIÓN
occupied = occupiedCourtIds(ledger, recurringBlocks, {start,end}, excludeSourceId=bookingId)
allocation = allocateCourts(format, courts, combos, occupied, blockedCourtIds)
if (!allocation) throw "slot ya no disponible"
ledger.entries.push({ sourceId: bookingId, kind:"booking", courtIds: allocation.courtIds, start, end })
tx.set(availabilityRef, ledger)                     // write — mismo doc
tx.update(bookingRef, { status:"deposit_confirmed", courtIds, ... })  // write
```
- `courts`, `combos`, `recurringBlocks` se leen **antes** del `runTransaction` (datos casi estáticos; no participan de la carrera). Todos los `tx.get` van **antes** de los `tx.set/update` (regla de Firestore).
- **Escenario de conflicto**: aprobaciones A y B del mismo slot. Ambas `tx.get(availabilityRef)` sobre el **mismo doc** → Firestore serializa: B se ejecuta después de A y ve la entrada de A → `occupied` incluye la cancha → `allocateCourts` falla → B rechaza. **Sin doble-booking.**

**B) `createBlockedSlot` one-off (manual) — bloquea slot**
```
// (validaciones de input/autorización fuera de la txn)
tx.get(availabilityRef)                             // read — MISMO doc de contención
occupied = occupiedCourtIds(ledger, recurringBlocks, {start,end})
conflict = input.courtIds.some(c => occupied.has(c))
if (conflict && !force) return { conflicts }        // igual que hoy: pide confirmación al admin
ledger.entries.push({ sourceId: blockedSlotId, kind:"block", courtIds: input.courtIds, start, end })
tx.set(availabilityRef, ledger)                     // write
tx.set(blockedSlotRef, docData)                     // write (misma txn → atómico)
```
- **Escenario de conflicto (online-vs-manual)**: aprobación online A y bloqueo manual B sobre el mismo slot. Ambas contienden `availabilityRef` → serializadas → la segunda ve a la primera → conflicto detectado. **Cerrado** (hoy imposible de cerrar porque viven en colecciones distintas).
- Los bloqueos **recurrentes** siguen el path actual (no-ledger): se guardan como plantilla y se consultan vía `recurringBlocks` en A y B.

**C) `createBooking` — YA NO bloquea slot**
```
// Solo crea solicitud pending_approval. NO toca availability. NO transacción de ocupación.
tx.set(bookingRef, { ...bookingData, status:"pending_approval" })
```
- Sin carrera: dos solicitudes del mismo slot pueden coexistir (RN-3). Se resuelve en la aprobación (A).

**D) Release — libera slot (cancel/reject/expire/delete)**
Toda transición que saca una reserva/bloqueo de un estado que ocupaba slot debe quitar su entrada del ledger, en la **misma** transacción que cambia el estado:
```
tx.get(availabilityRef)                             // read
ledger.entries = ledger.entries.filter(e => e.sourceId !== sourceId)
tx.set(availabilityRef, ledger)                     // write
tx.update(bookingRef/blockedSlotRef, { status:"cancelled"|"expired"|..., ... })  // write
```
- Puntos afectados: `cancelBooking` ([bookings.ts:800](../functions/src/bookings.ts#L800)), `rejectPaymentProof` ([1431](../functions/src/bookings.ts#L1431)), `expirePendingBookings` ([977](../functions/src/bookings.ts#L977) — solo si la reserva llegó a estar en el ledger; las `pending_payment` que expiran normalmente no lo estaban), `advanceBookingStatus` (transiciones a `cancelled`/`no_show` que liberen un slot futuro), `deleteBlockedSlot` ([blocked-slots.ts:330](../functions/src/blocked-slots.ts#L330)), `cancelBlockedSlotOneOff` (ver abajo).
- Idempotencia: `filter` por `sourceId` es idempotente (si ya no está, no falla).

**D.1) Soft-cancel de reserva manual one-off — `cancelBlockedSlotOneOff` (server-side)**
El "cancelar reserva" del admin es un **soft-cancel**: marca el `blocked_slot` one-off como `status:"cancelled"` conservando el registro histórico (no lo borra). Ese soft-cancel **también** ocupaba el ledger al crearse, así que debe liberar su entrada — igual que un release (D). Como la colección `availability` es `write:false` para clientes, este release **no puede** hacerse desde el cliente: se movió a la Cloud Function `cancelBlockedSlotOneOff`, que en una sola transacción hace `status:"cancelled"` + `removeEntry(ledger, blockedSlotId)`.
- **Regresión que cerró**: antes `cancelManualReservation` (cliente) hacía solo `tx.update(slot, {status:"cancelled"})` sin tocar el ledger → quedaba una **ocupación fantasma** → un nuevo bloqueo/aprobación sobre esa misma cancha-horario fallaba con "El horario acaba de ocuparse" pese a estar libre.
- Solo aplica al scope `non_recurring` (one-off, único con entrada en el ledger). Los scopes `single`/`future`/`all` operan sobre recurrentes, que no viven en el ledger (§ RN-5).
- La migración (`migrateAvailabilityLedger`) **excluye** bloqueos `status:"cancelled"` al reconstruir, para no re-crear el fantasma; re-correrla limpia fantasmas preexistentes de antes del fix.

### Estado canónico de "bloquea slot"
Centralizar un único set y usarlo en todos lados (arregla el bug de `createBlockedSlot`):
```typescript
const SLOT_BLOCKING_STATUSES = ["deposit_confirmed", "confirmed", "played"] as const;
```
El ledger es ahora la verdad de ocupación; esta constante se usa para la **migración** y para las lecturas de UI, no para decidir la escritura.

### Race conditions identificadas
| Escenario | Mitigación |
|-----------|-----------|
| 2 aprobaciones online, mismo slot | Ambas `tx.get/set` sobre `availability/{venueId}_{date}` → serializadas. |
| Aprobación online vs bloqueo manual one-off, mismo slot | Mismo doc de contención → serializadas (antes: imposible, colecciones distintas). |
| 2 bloqueos manuales one-off, mismo slot | Mismo doc → serializadas. |
| Reintento del server agota (~5) por contención alta | Se propaga como error controlado → RN-7 (ver §5). |
| Release concurrente con una nueva ocupación del mismo slot | Ambas tocan el ledger → serializadas; el orden real gana, estado consistente. |

---

## 4. SEGURIDAD

### Autenticación y autorización
- `createBooking`: cualquier usuario autenticado con acceso a reservas (sin cambios).
- `approveBookingDeposit` / `createBlockedSlot` / release admin: solo `super_admin` o `location_admin` asignado a la sede (validado en la function con `assertVenueAdmin`, ya existente; sin cambios).
- El ledger **solo lo escriben las Cloud Functions** (Admin SDK). Ningún cliente escribe `availability` directamente.

### Firestore Rules requeridas
```
match /availability/{docId} {
  // Lectura: autenticados (útil para pintar disponibilidad en cliente sin recomputar).
  // No expone datos sensibles: solo canchas/horarios ocupados (sin nombres de cliente).
  allow read: if request.auth != null;
  // Escritura: NADIE desde el cliente. Solo Admin SDK (Cloud Functions) que ignora rules.
  allow write: if false;
}
```

### Validaciones de input
- Sin cambios en las validaciones existentes de `createBooking`/`createBlockedSlot` (horas HH:MM, `startTime < endTime`, canchas pertenecen al venue, teléfono del cliente, etc.).
- El ledger nunca confía en `courtIds` del cliente para ocupación: la asignación online la hace `allocateCourts` en el server; el bloqueo manual valida que las canchas pertenezcan al venue (ya existe).

### Datos sensibles
- El `OccupancyEntry` guarda **solo** `courtIds` + rango + `sourceId`/`kind`. **No** incluye `clientName`, `clientPhone`, `reason` ni `bookedBy`. Así el ledger es legible por cualquier autenticado sin filtrar PII (los datos del cliente de un bloqueo manual siguen solo en `blocked_slots`, con su filtrado actual).

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `failed-precondition` "slot ya no disponible" | La aprobación/bloqueo perdió la carrera (otro tomó la cancha) | Toast: "Este horario acaba de ser tomado. Elegí otro." + refrescar disponibilidad. Para el admin: sugerir rechazar la solicitud. |
| `aborted` (contención agotó reintentos del server) | Muchas escrituras simultáneas al mismo `availability` doc | Mismo mensaje que arriba (desde la perspectiva del usuario es lo mismo). Loggear `booking_contention` para métricas. |
| Firestore offline / timeout | Red caída, iOS suspende canal | La function falla → el cliente recibe error → toast "No se pudo procesar, intentá de nuevo". El slot no queda en estado intermedio (todo es atómico en la txn). |
| `permission-denied` | Usuario no admin intentando aprobar/bloquear | Toast "No tenés permiso" (ya cubierto por `assertVenueAdmin`). |

### Retry strategy
- **Server**: `runTransaction` reintenta automáticamente ante contención (~5 veces con backoff). No añadimos retry manual en bucle.
- **Cliente**: ante `failed-precondition`/`aborted`, **no** reintentar automático (el slot probablemente está tomado de verdad) → mostrar error + refrescar la vista de disponibilidad para que el usuario elija otro horario.
- Distinguir en la function el error de contención del error de negocio para métricas, pero **mapear ambos al mismo mensaje** de cara al usuario (no tiene sentido exponer "contención").

### Degradación elegante
- Atomicidad: como ledger + booking/block se escriben en la misma transacción, un fallo **nunca** deja un slot ocupado sin su reserva, ni una reserva sin su entrada en el ledger. No hay estados huérfanos que limpiar.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal — reserva online (nuevo, unificado)
1. Jugador elige sede → formato → fecha → horario → "Confirmar".
2. `createBooking` crea `pending_approval`. UI: "Solicitud enviada · en revisión" (ya existe para el flujo con depósito; ahora aplica a todas).
3. El admin ve la solicitud en su panel y **aprueba** (o rechaza).
4. Al aprobar, `approveBookingDeposit` corre la txn del ledger:
   - Éxito → reserva `deposit_confirmed`, slot bloqueado; push al jugador "Abono/Reserva confirmada".
   - Slot ya tomado → toast al admin "El horario ya no está disponible. Rechazá la solicitud o contactá al jugador."

### Flujo — bloqueo manual (walk-in)
1. Admin abre "Bloquear/Reservar manual" → elige cancha(s), fecha, horario, datos del cliente.
2. `createBlockedSlot` corre la txn del ledger:
   - Sin conflicto → bloqueo creado, slot ocupado.
   - Conflicto detectado y `!force` → devuelve `conflicts` → UI muestra "Este horario tiene reservas: [...]. ¿Bloquear igual?" (comportamiento actual, ahora también atrapa reservas online concurrentes).

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Solicitud enviada | Chip "En revisión" en la reserva del jugador |
| Aprobando (admin) | Botón "Aprobar" con spinner, **deshabilitado** (RN-8, una a la vez) |
| Aprobación OK | Toast éxito + la solicitud pasa a "Confirmada" en la lista |
| Slot ya tomado | Toast "Este horario acaba de ser tomado" + refresco de disponibilidad |
| Error de red | Toast "No se pudo procesar, intentá de nuevo" |

### Consideraciones mobile-first
- La vista de aprobación del admin es una lista con acción por ítem; el guardrail "una a la vez" evita doble-tap accidental en pantallas táctiles.
- Mantener `pb-24 md:pb-0` en las vistas afectadas (ya presente).

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes afectados
- **Panel de aprobación del admin** (lista de `pending_approval`): agregar estado local `approvingId` → mientras haya una aprobación en vuelo, todos los botones "Aprobar" quedan `disabled` (o al menos el de la fila en curso con spinner). Prop nueva efectiva: control de `disabled`/`loading` por ítem.
- **Detalle de reserva** del jugador: el copy de estado ya soporta `pending_approval` → reutilizar.

### Animaciones (Framer Motion)
- Al aprobar con éxito, la fila sale de la lista de pendientes con `AnimatePresence` (`exit` fade+height) — consistente con el resto de listas.
- Spinner del botón: transición de opacidad estándar (150 ms).

### Responsive
- Mobile: acciones apiladas, touch targets ≥ 44px. Desktop (md+): fila con acción a la derecha. Sin breakpoints nuevos.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `booking_pending_created` | `createBooking` crea la solicitud (ya existe) | `venue_id`, `booking_id`, `format`, `date`, `start_time` |
| `booking_deposit_approved` | Aprobación exitosa (ya existe) | `venue_id`, `booking_id` |
| `booking_slot_conflict` | Aprobación/bloqueo pierde la carrera (`failed-precondition` de negocio) | `venue_id`, `date`, `start_time`, `source: "approve" \| "manual_block"` |
| `booking_contention` | La txn agota reintentos del server (`aborted`) | `venue_id`, `date`, `source` |

`booking_slot_conflict` + `booking_contention` son las **métricas de contención** (RN de escalabilidad): si `booking_contention` sube en alguna sede-día, es la señal para mover el knob de sharding (§2). Todos los eventos con `venue_id`/`date` para segmentar por sede-día.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
- Nueva colección `availability` (ver §3). Documentos por `{venueId}_{date}`.

### Capa de dominio (`lib/domain/` / equivalente en `functions/src/`)
- `availability.ts`: `availabilityDocIds()`, `overlaps()`, `occupiedCourtIds()` — funciones **puras**, sin Firebase, testeables. Se comparten conceptualmente entre cliente (pintar disponibilidad) y functions (decidir escritura).

### Capa de API (`functions/src/`)
- `bookings.ts`:
  - `createBooking` → siempre `pending_approval`; se elimina el branch `confirmed` directo y su txn de ocupación.
  - `approveBookingDeposit` → reemplazar `allocateForApproval` (query no-tx) por la txn del ledger (A). Leer courts/combos/recurringBlocks fuera de la txn; `tx.get(availability)` dentro.
  - `cancelBooking`, `rejectPaymentProof`, `expirePendingBookings`, `advanceBookingStatus` → agregar release (D) donde corresponda.
- `blocked-slots.ts`:
  - `createBlockedSlot` (one-off) → envolver en `runTransaction` con el ledger (B). Corregir `SLOT_BLOCKING_STATUSES`. Recurrentes: sin cambios (no-ledger).
  - `deleteBlockedSlot` → release (D) para bloqueos one-off que estaban en el ledger.

### Componentes UI (`app/`)
- Panel de aprobación admin: guardrail "una a la vez".
- Flujo de reserva del jugador: copy "en revisión" para todas las sedes (quitar el supuesto de confirmación instantánea sin depósito).

### Migración (one-shot, script/función admin)
- Recorrer bookings activos con `status in SLOT_BLOCKING_STATUSES` y fecha ≥ hoy → construir/poblar `availability/{venueId}_{date}` con sus `OccupancyEntry` (kind:"booking").
- Recorrer `blocked_slots` **one-off** con fecha ≥ hoy → poblar entries kind:"block".
- Idempotente (reconstruye el doc desde cero por sede-día). Correr **antes** de desplegar el nuevo código de escritura, o en la misma ventana de deploy.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Dos `approveBookingDeposit` concurrentes sobre el mismo slot → exactamente **una** queda `deposit_confirmed`; la otra falla con "slot ya no disponible".
- [ ] `approveBookingDeposit` concurrente con `createBlockedSlot` one-off sobre el mismo slot → solo una ocupa; la otra detecta conflicto.
- [ ] Dos `createBlockedSlot` one-off concurrentes sobre el mismo slot → solo uno se crea.
- [ ] `createBooking` ya no crea `confirmed` directo: toda reserva nace `pending_approval` (incluye sedes sin depósito).
- [ ] Cancelar/rechazar/expirar/borrar libera la entrada del ledger y el slot vuelve a estar disponible.
- [ ] Soft-cancel de una reserva manual one-off (`cancelBlockedSlotOneOff`) libera su entrada del ledger → el mismo slot/cancha queda re-reservable sin "El horario acaba de ocuparse".
- [ ] La migración no re-crea entradas de bloqueos `cancelled`; re-correrla limpia fantasmas preexistentes.
- [ ] `createBlockedSlot` detecta conflicto contra reservas `deposit_confirmed` (bug de status corregido).
- [ ] Bloqueos recurrentes siguen bloqueando disponibilidad (consultados como plantillas) sin escribir en el ledger.
- [ ] Error de contención/negocio → toast "Este horario acaba de ser tomado" + refresco; nunca doble-booking.
- [ ] Ledger legible por autenticados sin exponer PII del cliente.
- [ ] Sin índices Firestore nuevos.
- [ ] `availabilityDocIds` encapsula la clave (sharding futuro sin tocar la lógica de la txn).
- [ ] Migración puebla el ledger para reservas/bloqueos activos futuros.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `functions/src/availability.ts` (o `lib/domain/availability.ts`) | **Nuevo**. `availabilityDocIds`, `overlaps`, `occupiedCourtIds`, tipos `AvailabilityLedger`/`OccupancyEntry`, `SLOT_BLOCKING_STATUSES`. |
| `functions/src/bookings.ts` | `createBooking` → siempre `pending_approval` (quitar `confirmed` directo). `approveBookingDeposit` → txn del ledger (reemplaza `allocateForApproval` no-tx). `cancelBooking`/`rejectPaymentProof`/`expirePendingBookings`/`advanceBookingStatus` → release. |
| `functions/src/blocked-slots.ts` | `createBlockedSlot` one-off → `runTransaction` con ledger + fix de `SLOT_BLOCKING_STATUSES`. `deleteBlockedSlot` → release. `cancelBlockedSlotOneOff` (**nuevo**) → soft-cancel one-off + release del ledger en la misma txn. |
| `functions/src/availability-migration.ts` | Excluir bloqueos `status:"cancelled"` al reconstruir (no re-crear ocupación fantasma). |
| `lib/venues.ts` | `cancelManualReservation` scope `non_recurring` → llama a `cancelBlockedSlotOneOff` (server-side) en vez de update client-side sin release. |
| `functions/src/availability-migration.ts` | **Nuevo**. Función one-shot (super admin) que puebla el ledger desde reservas/bloqueos activos. |
| `functions/src/availability-cleanup.ts` | **Nuevo**. `cleanupPastAvailability`: job programado mensual (día 1, 04:00 America/Bogota) que borra los docs `availability` de fechas pasadas (inertes). |
| `firestore.rules` | Nueva `match /availability/{docId}`: `read` autenticados, `write:false`. |
| `firestore.indexes.json` | Sin cambios (acceso por documentId). |
| `app/.../` (panel aprobación admin) | Guardrail "una aprobación a la vez". |
| `app/.../` (flujo reserva jugador) | Copy "en revisión" para todas las sedes. |
| `lib/analytics.ts` | Nuevos `booking_slot_conflict`, `booking_contention`. |

---

## ⚠️ Decisiones de Diseño Clave (revisar y aprobar antes de implementar)

1. **Se elimina la confirmación instantánea.** Toda reserva —incluso en sedes sin depósito— pasa a requerir aprobación del admin (`pending_approval`). Es un cambio de producto con impacto en UX y carga operativa del admin. **¿Confirmás este trade-off?**
2. **El ledger `availability/{venueId}_{date}` es la única fuente de verdad de ocupación**, y **todo** lo que bloquea un slot (aprobación online + bloqueo manual one-off) debe atravesarlo en una transacción. Si algún path nuevo olvida el ledger, reabre la carrera.
3. **Bloqueos recurrentes quedan fuera del ledger** (se consultan como plantillas). Acepta un riesgo marginal de carrera recurrente-vs-online (se crean con anticipación). **¿OK, o querés cerrarlo también?**
4. **Sharding no se implementa ahora** (doc por sede-día alcanza), pero se deja el helper `availabilityDocIds` para migrar sin reescribir. La decisión de shardear se toma con las métricas `booking_contention`.
5. **Guardrail de UI "una aprobación a la vez" es UX, no seguridad.** La garantía real está en el backend (ledger). Se implementan ambos, pero no se depende del primero.

---

### Nota de contexto
Este SDD extiende el sistema descrito en `docs/BOOKING_SYSTEM_SDD.md`. La familia de fixes de carga/robustez (timeouts, caché, reintentos de cold-load) está en `docs/IOS_PWA_HOME_STALE_LOADING_SDD.md` (iteraciones 7-8) y es independiente de esta feature de concurrencia.
