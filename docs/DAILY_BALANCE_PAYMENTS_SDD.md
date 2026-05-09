# Feature: Balance de Ingresos Diarios

## 📋 Specification-Driven Development (SDD)

Permitir al `location_admin` registrar el pago de cada reserva manual indicando cuánto pagó en efectivo y cuánto por transferencia, y consultar el total de ingresos del día desglosado por método.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy el `location_admin` cierra el día sin saber cuánta plata entró, ni cómo (efectivo vs transferencia). Marcar una reserva como "Pagado" no captura el método ni el monto real cobrado — el `priceCOP` es solo una referencia del schedule. Esta feature convierte cada "Marcar pagado" en un registro auditable, y agrega una vista de balance del día con totales por método.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Cada pago registrado vive en una subcolección nueva `venues/{venueId}/payments`. Es la fuente de verdad de "cuánto se cobró por cada reserva, cuándo y cómo". El campo `status: "paid"` del `BlockedSlot` queda como bandera derivada — registrar un pago lo escribe; eliminar el pago lo revierte. | Nueva colección |
| 2 | Un pago tiene **dos montos en centavos COP**: `cashCOP` (efectivo) y `transferCOP` (transferencia). Ambos ≥ 0. La suma `totalCOP = cashCOP + transferCOP` se persiste denormalizada para queries rápidas del balance. Permitido `totalCOP < priceCOP` (pago parcial) y `totalCOP > priceCOP` (propina/sobrepago) — el sistema sólo avisa, no bloquea. **Al menos uno de los dos debe ser > 0** (no se permiten pagos vacíos). | Inputs separados, totales en vivo |
| 3 | Cada pago se asocia a una **fecha concreta** (`date: YYYY-MM-DD`), no al doc recurrente. Para reservas puntuales: `date === slot.date`. Para reservas recurrentes: `date === targetDate` (la instancia que se está cobrando). Esto permite registrar pagos independientes para cada ocurrencia de un recurrente sin contaminar el doc maestro. | Pagos por instancia, no por reserva |
| 4 | Solo se puede registrar **un pago por par `(reservationId, date)`**. Si ya existe, el flujo abre el sheet de edición en lugar de crear uno nuevo. La unicidad se enforza con `id` determinístico: `payment_${reservationId}_${date}`. | Edit en lugar de duplicar |
| 5 | **Reservas no cobrables**: las reservas en estado `cancelled`, `free` o `no_show` no permiten registrar pago — el botón no aparece. Tampoco se permite registrar pago en una reserva con `isMonthly: true` (Mensualidad), ya que el cobro se hace en flujo aparte (fuera de este SDD). | CTA oculto en estos casos |
| 6 | Registrar un pago **escribe atómicamente**: el doc en `payments` y la actualización de `status: "paid"` (sólo para reservas puntuales — no recurrentes; en recurrentes la instancia se considera "paga" por la existencia del payment doc). | Una sola operación |
| 7 | Borrar un pago revierte el `status` del `BlockedSlot` a `"played"` si estaba en `"paid"` (para puntuales). Para recurrentes, el doc maestro no se toca. | Optimistic revert |
| 8 | Editar un pago modifica `cashCOP`, `transferCOP`, `totalCOP` y `updatedAt`. La fecha y la reserva no son editables. | Edit sheet con campos limitados |
| 9 | El **balance del día** muestra la suma de `cashCOP`, `transferCOP` y `totalCOP` de todos los pagos con `date === selectedDate` para el venue actual. Una sola query por fecha. | 3 cards arriba + lista de pagos |
| 10 | El balance es accesible a `location_admin` y `super_admin` con acceso al venue. Para `location_admin` se agrega un nuevo tab "Balance" en el admin de venue (hoy sólo ve el tab "Reservas"). | Nuevo tab |
| 11 | El monto inicial del input efectivo se pre-rellena con el `priceCOP` de la reserva (el caso más común: el cliente paga el precio completo en efectivo). El admin lo edita si corresponde. | Default UX |

### No-objetivos (explícitos)
- **No incluir bookings online en V1**: el balance es sólo de reservas manuales. Los bookings tienen su propio flujo de depósito + saldo en sede que vive en otro modelo. Si después se quiere balance unificado, se extiende.
- **No tracking de propinas separadas**: si el cliente paga $50.000 y la reserva era de $40.000, queda como sobrepago — no hay campo "tip".
- **No cobranza de mensualidades aquí**: las reservas con `isMonthly: true` se excluyen del flujo. Cobrar mensualidades es otro SDD.
- **No reportes históricos** (semanal/mensual) en V1 — sólo balance por día seleccionado. Si se necesita, se agrega cuando aparezca el caso de uso.
- **No exportación CSV/PDF** del balance — se posterga.
- **No conciliación bancaria automática**: el admin captura manualmente cuánto vio en su cuenta vs. lo registrado. La feature no se conecta a APIs bancarias.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Un venue activo: ~10–30 reservas manuales/día → 10–30 pagos/día → ~300–900/mes → ~3.600–10.800/año.
- Por venue, la subcolección `payments` no debería pasar de ~50.000 docs en 5 años. Trivial para Firestore.
- Read pattern dominante: "todos los pagos del venue X en la fecha Y" → 10–30 docs por query → < 50 KB.

### Índices Firestore requeridos
- **Ninguno compuesto nuevo**. La query del balance es `where("date", "==", X)` sobre `venues/{id}/payments` — Firestore indexa cada campo automáticamente, no requiere índice compuesto.
- Si después se agrega filtro adicional (ej. "pagos de un usuario específico" o "pagos por método con orden por monto"), se evalúa entonces.

### Paginación
- N/A en V1: máx ~30 pagos/día por venue. Lista directa sin paginación. Si crece, paginar por `registeredAt`.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
1. **`registerPayment(venueId, reservationId, date, cashCOP, transferCOP)`**: lee si ya existe el doc (`payment_${reservationId}_${date}`). Si existe → falla con `AlreadyExists` y la UI redirecciona a edit. Si no existe → crea payment + actualiza `status: "paid"` del slot (si es puntual). Todo en una transacción.
2. **`deletePayment(venueId, paymentId)`**: lee el payment; si la reserva asociada está en `paid`, revierte a `played`. Borra el payment. Atómico.
3. **`updatePayment(venueId, paymentId, { cashCOP, transferCOP })`**: lee + escribe `cashCOP`, `transferCOP`, `totalCOP`, `updatedAt` en transacción para evitar last-write-wins con dos admins editando simultáneamente.

### Race conditions identificadas
- **Escenario**: Admin A y B ven el mismo slot sin pago, ambos tapean "Marcar pagado" y registran montos distintos. → **Mitigación**: el `id` determinístico + transacción. El segundo write falla con `AlreadyExists`; la UI le muestra "ya hay un pago, abre edit".
- **Escenario**: Admin A elimina la reserva mientras Admin B intenta registrar el pago. → **Mitigación**: la transacción del registro lee el slot dentro de la transacción; si fue borrado, falla con `not-found` y el sheet muestra error + se cierra.
- **Escenario**: Admin A registra pago, Admin B avanza el status manualmente (popover) en paralelo. → **Mitigación**: ambas escrituras son válidas independientemente; el último write gana sobre `status`. El payment doc no se ve afectado. Si el resultado es inconsistente (ej. payment existe + status revertido a "played"), la UI siempre muestra "Pagado" derivado del payment, no del status — el badge se calcula con `getDisplayStatus(slot, hasPayment)`.

---

## 4. SEGURIDAD

### Autenticación y autorización
- **Lectura** de `venues/{venueId}/payments`: sólo `super_admin` o `location_admin` con `venueId ∈ assignedLocationIds`.
- **Escritura** (create/update/delete): mismas reglas.
- Sin acceso público: los pagos contienen montos que son información financiera operativa del venue.

### Firestore Rules requeridas

```javascript
// Agregar dentro de match /venues/{venueId} { ... }
match /payments/{paymentId} {
  allow read: if isSignedIn() && (
    isSuperAdmin() || isLocationAdminFor(venueId)
  );

  allow create: if isSignedIn()
    && (isSuperAdmin() || isLocationAdminFor(venueId))
    && request.resource.data.cashCOP is int
    && request.resource.data.cashCOP >= 0
    && request.resource.data.transferCOP is int
    && request.resource.data.transferCOP >= 0
    && (request.resource.data.cashCOP + request.resource.data.transferCOP) > 0
    && request.resource.data.totalCOP == request.resource.data.cashCOP + request.resource.data.transferCOP
    && request.resource.data.registeredBy == request.auth.uid
    && request.resource.data.date is string;

  allow update: if isSignedIn()
    && (isSuperAdmin() || isLocationAdminFor(venueId))
    && request.resource.data.cashCOP is int
    && request.resource.data.transferCOP is int
    && (request.resource.data.cashCOP + request.resource.data.transferCOP) > 0
    && request.resource.data.totalCOP == request.resource.data.cashCOP + request.resource.data.transferCOP
    // No se puede cambiar reservationId, date, registeredBy
    && request.resource.data.reservationId == resource.data.reservationId
    && request.resource.data.date == resource.data.date
    && request.resource.data.registeredBy == resource.data.registeredBy;

  allow delete: if isSignedIn()
    && (isSuperAdmin() || isLocationAdminFor(venueId));
}
```

### Validaciones de input (cliente y servidor)
- `cashCOP`: integer ≥ 0.
- `transferCOP`: integer ≥ 0.
- `cashCOP + transferCOP > 0`: al menos un monto positivo.
- `totalCOP === cashCOP + transferCOP`: cliente lo calcula y persiste; reglas Firestore lo verifican.
- `date`: string `YYYY-MM-DD`. Validado regex en cliente; reglas verifican `is string`.
- `reservationId`: debe existir como doc en `venues/{venueId}/blocked_slots/`. **Sólo validable en transacción** (rules no pueden hacer `get()` cross-doc en la misma op atómica fácilmente — la transacción cliente sí puede leer el slot y validar).

### Datos sensibles
- Los montos son **PII operativa**: sólo admins del venue pueden leer/escribir. Las rules ya lo enforzan.
- Las queries del balance NO deben ser usadas en flujos públicos (no se exponen a jugadores).

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `AlreadyExists` al crear pago | Otro admin lo registró segundos antes | Toast "Ya hay un pago para esta reserva. Abriendo edición…" + abre sheet en modo edit con datos cargados |
| `not-found` al crear pago | Reserva eliminada en paralelo | Toast "La reserva ya no existe" + cierra sheet + refresh de la lista |
| `permission-denied` | Usuario perdió rol o se desasignó del venue | Toast "Sin permisos" + redirect a `/` |
| Red caída al guardar | Offline | Toast "Sin conexión, intenta de nuevo" — no offline persistence en V1 |
| Suma de montos = 0 | Validación cliente | CTA deshabilitado + mensaje inline "Ingresa al menos un monto" |
| Cargando balance | Initial fetch | Skeleton de 3 cards + 5 rows |
| Balance vacío | Día sin pagos | Empty state: "Sin pagos registrados este día" + ícono receipt |

### Retry strategy
- **No auto-retry** para escrituras: el admin reintenta manualmente. Es preferible para que sepa qué se guardó.
- Lecturas del balance: ya tienen onSnapshot reactivo — si la conexión vuelve, Firestore re-emite.

### Degradación elegante
- Si los pagos no cargan, el resto de la vista admin sigue funcionando. El balance muestra empty state con "No pudimos cargar los pagos" y botón "Reintentar".
- Si la reserva no tiene `priceCOP` (legacy), el sheet se abre con efectivo en `0` (no auto-fill); admin captura manualmente.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal — Registrar pago al cerrar una reserva
1. Admin ve la card de una reserva en estado `confirmed` o `played`.
2. Tap en el botón "Marcar pagado" del footer.
3. **En lugar de** cambiar status directamente como hoy, abre `RegisterPaymentSheet`:
   - Header: "Registrar pago" + horario + cliente.
   - Resumen: "Precio reserva: $40.000".
   - Input "Efectivo": pre-rellenado con `40.000` (priceCOP convertido a pesos).
   - Input "Transferencia": pre-rellenado con `0`.
   - Total en vivo: "Total: $40.000".
   - Diff badge si difiere de `priceCOP`: "+$5.000 sobrepago" (ámbar) o "−$5.000 falta" (rojo claro).
   - CTAs: "Registrar pago" (primary) + "Cancelar".
4. Admin ajusta los montos (ej. $30k efectivo + $10k transferencia).
5. Tap "Registrar pago" → transacción crea payment + actualiza `status: "paid"`.
6. Toast verde "Pago registrado". Sheet cierra. Card en la lista actualiza badge a "Pagado".

### Flujo 2 — Editar un pago existente
1. En la card de la reserva (status "Pagado"), el botón "Marcar pagado" es reemplazado por un mini-summary "$30k efec. + $10k transf." que actúa como botón.
2. Tap → abre `RegisterPaymentSheet` en modo edit con los valores cargados.
3. Admin modifica → "Guardar cambios" → transacción update.
4. Toast "Pago actualizado".

### Flujo 3 — Eliminar un pago (corregir error)
1. Dentro del `RegisterPaymentSheet` en modo edit, hay un botón secundario "Eliminar pago".
2. Tap → confirm modal "¿Eliminar este pago? La reserva volverá a estado 'Jugado'."
3. Confirmar → transacción borra payment + revierte status (sólo para puntuales; recurrentes no tocan status del padre).
4. Toast "Pago eliminado".

### Flujo 4 — Ver balance del día
1. Admin entra a `/venues/admin/{id}` → tab "Balance" (nuevo).
2. Default: fecha de hoy. Selector de fecha tipo input HTML5 nativo (consistente con el venue admin actual).
3. Vista:
   - **3 cards horizontales arriba**: Efectivo (verde, ícono billete), Transferencia (azul, ícono banco), Total (slate, ícono receipt). Cada uno muestra el monto formateado y el conteo "N pagos".
   - **Lista de pagos** debajo, ordenada por hora ascendente. Cada row: hora · cliente · canchas · `$cash + $transfer = $total`.
   - Tap en una row → abre `RegisterPaymentSheet` en modo edit (mismo flujo que Flujo 2).
4. Cambio de fecha → re-query reactiva.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando balance | Skeleton: 3 cards grises + 4 rows pulse |
| Vacío (día sin pagos) | Empty state: ícono receipt + "Sin pagos registrados el {fecha}" + microcopy "Cuando registres un pago de una reserva, aparecerá aquí" |
| Con pagos | 3 cards con totales + lista |
| Sheet — primer registro | Inputs vacíos con cash pre-fill al `priceCOP`; CTA "Registrar pago" |
| Sheet — edit existente | Inputs cargados con valores; CTA "Guardar cambios" + botón "Eliminar pago" |
| Sheet — error de unicidad | Toast + auto-switch a modo edit con datos del existente |
| Card de reserva pagada | Botón footer reemplazado por chip "$30k efec. + $10k transf." (tappable, abre edit) |

### Consideraciones mobile-first
- Inputs de monto: `inputMode="numeric"`, `font-size: 16px+` (anti-zoom iOS), separadores de miles formateados al perder foco (`Intl.NumberFormat`).
- Sheet con `pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)]` (96px cubre la bottom nav móvil).
- Cards del balance: stack vertical en mobile, 3-col en `md:grid-cols-3`.
- Touch targets mínimos 44×44 para el botón "Eliminar pago".

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- **`components/booking/RegisterPaymentSheet.tsx`** — bottom sheet con inputs `cashCOP` / `transferCOP`, total en vivo, diff vs `priceCOP`. Modo create/edit determinado por prop `existingPayment?: ManualReservationPayment | null`. Props:
  ```typescript
  {
    open: boolean;
    onClose: () => void;
    venueId: string;
    slot: BlockedSlot;
    targetDate: string;          // fecha de la instancia
    existingPayment: ManualReservationPayment | null;
    onSaved?: () => void;
    onDeleted?: () => void;
  }
  ```
- **`components/booking/DailyBalanceView.tsx`** — vista completa del tab Balance: date picker, 3 cards de totales, lista de pagos. Suscripción onSnapshot por fecha. Props:
  ```typescript
  {
    venueId: string;
  }
  ```
- **`components/booking/PaymentRow.tsx`** — row individual de un pago en la lista. Props: `payment`, `onTap`.
- **`components/skeletons/DailyBalanceSkeleton.tsx`** — skeleton de la vista.

### Componentes modificados
- **`components/booking/AdminBlockCard.tsx`**:
  - Si la reserva no está paga y es cobrable → botón "Marcar pagado" abre el sheet en lugar de cambiar status directamente.
  - El **popover de estado** (chip tappable con opciones de status) también intercepta la selección de "Pagado": si `isReservationPayable(block)` y `onRegisterPayment` está disponible, abre el sheet en lugar de llamar a `onPickStatus`.
  - Si está paga → reemplazar el botón por chip resumen del pago, tappable para edit.
  - Excluir las reservas `isMonthly`, `cancelled`, `free`, `no_show` de la opción de pago.
- **`app/venues/admin/[id]/page.tsx`**:
  - Agregar `"balance"` al tipo `AdminTab`.
  - `visibleTabs`: `location_admin` ahora ve `["bookings", "balance"]`. `super_admin` agrega `"balance"` a la lista existente.
  - `TAB_LABELS["balance"] = "Balance"`.
  - Renderizar `DailyBalanceView` cuando `activeTab === "balance"`.
- **`lib/domain/venue.ts`**: agregar tipo `ManualReservationPayment`.

### Animaciones (Framer Motion)
- **Sheet de pago**: slide-up desde bottom con `type: "spring", damping: 28, stiffness: 320` (consistente con sheets existentes).
- **Total en vivo**: número con tween de `0.15s` cuando cambia (sutilísimo, sin layout shift).
- **Diff badge**: fade-in/out con `AnimatePresence` cuando aparece/desaparece (cuando cambia el signo o se iguala).
- **Cards de balance**: stagger de `0.05s` por card al primer mount.
- **Lista de pagos**: layout transitions con `LayoutGroup` para que al borrar un pago, los demás reordenen suavemente.

### Responsive
- **Mobile (< 768px)**: Cards en stack vertical, lista en una columna, inputs full-width.
- **Tablet/desktop (md+)**: 3-col grid para cards, lista con max-w-2xl centrado.

### Colores y tokens
- Card "Efectivo": fondo `bg-emerald-50`, texto `text-emerald-700`, ícono `Banknote`.
- Card "Transferencia": fondo `bg-blue-50`, texto `text-blue-700`, ícono `Landmark` o `Building2`.
- Card "Total": fondo `bg-slate-50`, texto `text-slate-900` con peso bold, ícono `Receipt`.
- Diff "+sobrepago": `bg-amber-50 text-amber-700`.
- Diff "−falta": `bg-rose-50 text-rose-600`.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `manual_reservation_payment_registered` | Confirmar `RegisterPaymentSheet` en modo create | `venueId`, `slotId`, `date`, `cashCOP`, `transferCOP`, `totalCOP`, `priceCOP`, `diffCOP` (totalCOP - priceCOP), `isRecurringInstance` |
| `manual_reservation_payment_edited` | Confirmar sheet en modo edit | `venueId`, `paymentId`, `previousCashCOP`, `newCashCOP`, `previousTransferCOP`, `newTransferCOP`, `totalCOP` |
| `manual_reservation_payment_deleted` | Confirmar el modal de eliminación | `venueId`, `paymentId`, `slotId`, `cashCOP`, `transferCOP`, `totalCOP` |
| `daily_balance_viewed` | Mount del componente con datos cargados | `venueId`, `date`, `paymentsCount`, `cashCOP`, `transferCOP`, `totalCOP` |
| `daily_balance_date_changed` | Cambio del date picker | `venueId`, `previousDate`, `newDate` |

Convención: nombres en `snake_case`, montos en centavos COP, sin PII (clientName/phone) en analytics.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

`lib/domain/venue.ts`:
```typescript
export interface ManualReservationPayment {
    id: string;                  // payment_${reservationId}_${date}
    reservationId: string;       // BlockedSlot.id
    date: string;                // YYYY-MM-DD (la instancia)

    cashCOP: number;             // centavos, ≥ 0
    transferCOP: number;         // centavos, ≥ 0
    totalCOP: number;            // cashCOP + transferCOP (denormalizado)

    // Snapshot denormalizado para la vista de balance (evita N+1 reads)
    startTime: string;
    endTime: string;
    courtIds: string[];
    clientName?: string;
    priceCOP?: number;           // referencia al precio de la reserva al momento del pago

    registeredBy: string;        // uid
    registeredAt: string;        // ISO
    updatedAt?: string;          // ISO
}
```

### Capa de dominio (`lib/domain/`)
- **`lib/domain/payments.ts`** (nuevo): helpers puros.
  ```typescript
  export function buildPaymentId(reservationId: string, date: string): string {
      return `payment_${reservationId}_${date}`;
  }

  export function sumPayments(payments: ManualReservationPayment[]): {
      cashCOP: number;
      transferCOP: number;
      totalCOP: number;
      count: number;
  } { ... }

  export function isReservationPayable(slot: BlockedSlot): boolean {
      const status = getBlockedSlotStatus(slot);
      if (slot.isMonthly) return false;
      return status !== "cancelled" && status !== "free" && status !== "no_show";
  }

  export function calcPaymentDiff(totalCOP: number, priceCOP?: number): {
      diff: number;
      kind: "exact" | "overpayment" | "underpayment" | "unknown";
  } { ... }
  ```

### Capa de API (`lib/venues.ts`)
```typescript
export async function registerManualReservationPayment(
    venueId: string,
    slot: BlockedSlot,
    targetDate: string,
    cashCOP: number,
    transferCOP: number,
): Promise<{ id: string }> {
    // runTransaction:
    //   - lee venues/{venueId}/blocked_slots/{slot.id}; valida exista
    //   - lee venues/{venueId}/payments/payment_{slot.id}_{targetDate}; debe NO existir
    //   - crea el payment doc
    //   - si el slot NO es recurrente: actualiza status a "paid"
    //   - retorna el payment id
}

export async function updateManualReservationPayment(
    venueId: string,
    paymentId: string,
    cashCOP: number,
    transferCOP: number,
): Promise<void> { ... }

export async function deleteManualReservationPayment(
    venueId: string,
    paymentId: string,
): Promise<void> {
    // runTransaction:
    //   - lee el payment para conocer reservationId
    //   - lee el slot; si está "paid" y es puntual → revierte a "played"
    //   - borra el payment
}

export function subscribeDailyPayments(
    venueId: string,
    date: string,
    callback: (payments: ManualReservationPayment[]) => void,
): () => void {
    // onSnapshot a venues/{venueId}/payments where date == X
}
```

### Componentes UI (`app/`, `components/`)
Listados en sección 7. Sin nuevas páginas (solo nuevo tab dentro de `/venues/admin/[id]`).

### Backward compatibility
- Reservas existentes con `status: "paid"` pero sin payment doc → la card las sigue mostrando como "Pagado" (status legacy). Si el admin tapea el chip, abre el sheet en modo create (no edit) — al guardar, queda registrado el pago con la fecha de hoy, que es lo mejor que podemos hacer sin saber cuándo se cobró originalmente. Mostrar advertencia inline: "Este pago se registrará con fecha de hoy".
- No hay migración masiva — los pagos viejos quedan sin registro hasta que el admin los toque.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Tab "Balance" visible para `location_admin` y `super_admin` con acceso al venue.
- [ ] Date picker en el balance defaultea a hoy y permite navegar a fechas pasadas/futuras.
- [ ] Cards de Efectivo, Transferencia y Total muestran montos correctamente formateados (formatCOP) con conteos de pagos.
- [ ] Lista de pagos del día ordenada por hora; tap en row abre sheet en modo edit.
- [ ] Empty state con copy y CTA implícito cuando no hay pagos.
- [ ] Botón "Marcar pagado" en `AdminBlockCard` abre `RegisterPaymentSheet` (no cambia status directo).
- [ ] Sheet pre-rellena efectivo con priceCOP de la reserva.
- [ ] Sheet calcula total en vivo y muestra badge de diff cuando difiere del precio.
- [ ] Sheet bloquea CTA si suma = 0; permite sobrepago/falta con badge informativo.
- [ ] Registrar pago crea doc + actualiza `status: "paid"` (en puntuales) atómicamente.
- [ ] Si dos admins intentan registrar pago para misma instancia, uno gana y el otro recibe `AlreadyExists` + sheet auto-redirecciona a edit.
- [ ] Editar pago actualiza montos y `updatedAt`.
- [ ] Eliminar pago revierte status a "played" en puntuales con doble confirmación.
- [ ] Reservas `isMonthly`, `cancelled`, `free`, `no_show` no muestran botón de pago.
- [ ] Reservas pagadas muestran chip resumen "$X efec. + $Y transf." en lugar del botón.
- [ ] Eventos `manual_reservation_payment_registered/edited/deleted`, `daily_balance_viewed/date_changed` se disparan correctamente.
- [ ] Reglas Firestore bloquean lectura/escritura a usuarios sin rol válido.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Agregar tipo `ManualReservationPayment` |
| `lib/domain/payments.ts` | **Nuevo** — helpers puros (`buildPaymentId`, `sumPayments`, `isReservationPayable`, `calcPaymentDiff`) |
| `lib/venues.ts` | Nuevas funciones: `registerManualReservationPayment`, `updateManualReservationPayment`, `deleteManualReservationPayment`, `subscribeDailyPayments` |
| `lib/analytics.ts` | Nuevos eventos: `manual_reservation_payment_registered/edited/deleted`, `daily_balance_viewed/date_changed` |
| `components/booking/RegisterPaymentSheet.tsx` | **Nuevo** — sheet create/edit con inputs cash/transfer + diff badge + delete |
| `components/booking/DailyBalanceView.tsx` | **Nuevo** — vista completa del tab Balance |
| `components/booking/PaymentRow.tsx` | **Nuevo** — row de la lista de pagos |
| `components/booking/AdminBlockCard.tsx` | Reemplaza CTA de pago por flujo de sheet; chip resumen para pagadas |
| `components/skeletons/DailyBalanceSkeleton.tsx` | **Nuevo** — skeleton |
| `app/venues/admin/[id]/page.tsx` | Nuevo tab "balance"; visibleTabs incluye location_admin |
| `firestore.rules` | Reglas para `venues/{venueId}/payments` (read/create/update/delete) |

---

## 12. FUERA DE SCOPE

- Bookings online (depósito wallet + cobro en sede). En V1 sólo manuales.
- Cobranza de mensualidades (`isMonthly: true`).
- Reportes históricos (semanal, mensual, anual).
- Exportación CSV/PDF del balance.
- Conciliación bancaria automática.
- Múltiples pagos parciales por instancia (un pago por par reservation+date en V1).
- Tip/propina como campo separado.
- Notificación push al admin cuando otro admin registra un pago.
- Auditoría completa con histórico de ediciones (V1 sólo guarda valor actual + `updatedAt`).

---

## ⚠️ Decisiones de Diseño Clave

Estas son las decisiones más importantes que requieren tu aprobación antes de implementar:

### 1. Subcolección dedicada `venues/{id}/payments` (en lugar de campos en `BlockedSlot`)
**Por qué**: Con reservas recurrentes, cada instancia (fecha) puede tener su propio pago. Si los datos viven en el doc del slot, terminamos con un mapa `paymentsByDate` que crece sin control y complica las queries del balance. Una subcolección con `id` determinístico (`payment_{slotId}_{date}`) permite query directa por fecha y atomicidad por pago. **Tradeoff**: más writes (slot + payment) pero ya van en transacción, costo despreciable.

### 2. El "status: paid" se deriva del payment doc, no al revés
**Por qué**: Para reservas puntuales, marcar pagado y registrar pago se hacen juntos (transacción). Pero para recurrentes, cada instancia es paga independientemente y el doc maestro no tiene un status por-fecha. La fuente de verdad de "está paga esta instancia" es: ¿existe un payment doc para `(slotId, date)`? El status del slot queda como compatibilidad legacy y para puntuales. **Tradeoff**: hay dos formas de saber si está paga; siempre prefiere el payment doc cuando exista.

### 3. Permitir pago parcial y sobrepago, sólo avisando
**Por qué**: La realidad es que el admin a veces cobra menos (descuento, parcial) o más (propina). Bloquear sería molesto. Mostrar un badge ámbar/rojo es suficiente para que el admin confirme conscientemente. **Alternativa rechazada**: forzar `total === priceCOP` — demasiado rígido para un sistema que sabe poco del contexto real del cobro.

### 4. Excluir reservas `isMonthly` del flujo de pago en V1
**Por qué**: Las mensualidades son un cobro fijo mensual, no por instancia. Mezclarlas con el balance diario distorsiona los totales (¿se suma la mensualidad completa al día que se pagó? ¿se prorratea?). Mejor dejarlas fuera y dedicarles un SDD propio cuando aparezca el caso de uso. **Tradeoff**: el balance del día no incluye los ingresos de mensualidades — el admin tendrá que calcular eso aparte por ahora.

### 5. No incluir bookings online en V1
**Por qué**: Los bookings tienen un modelo de pago distinto (depósito en wallet + saldo en sede). Mezclar los dos modelos en el balance diario complica la UI (¿muestra el depósito wompi + el saldo en sede como dos rows?). V1 cubre el caso real del `location_admin`: las reservas que él/ella gestiona manualmente. Si en el futuro hay flujo unificado, se extiende. **Tradeoff**: el balance no es 100% completo, pero cubre el ~80% del uso del location admin hoy.
