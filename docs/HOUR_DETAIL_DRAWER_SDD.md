# Feature: Detalle por hora en la vista admin

## 📋 Specification-Driven Development (SDD)

Reemplazar el tap directo "hora libre → crear reserva manual" en la vista por hora del admin por un drawer de **detalle de la hora** que muestra las reservas existentes (online + manuales) en cards, permite cancelarlas, y ofrece un CTA para crear una reserva manual. Además, ocultar el precio de la cancha del listado por hora (no aporta nada al admin y agrega ruido visual).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy, en `app/venues/admin/[id]` tab "Reservas" → vista "Hora", el admin ve un slot por hora con precio en cada uno y solo puede tocar slots **libres**, lo que abre directo el form de crear reserva manual. No tiene una manera fluida de:
- Ver qué reservas existen en una hora (tiene que cambiar a la vista Calendario, scrollear, identificar la hora).
- Cancelar una reserva mirándola en contexto temporal (la vista Calendario lo permite, pero no está integrada al flujo "estoy revisando esta hora").

El cambio unifica el flujo: tap en cualquier hora (libre u ocupada) → drawer con todo el contexto de esa hora.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | El precio por slot (`priceCOP`) no se muestra en la vista por hora del admin. | Quitar la columna derecha de precio en `SlotList` cuando lo invoca el admin |
| 2 | Tap en cualquier slot (disponible u ocupado) abre el `HourDetailDrawer` para esa hora y formato seleccionado. | El slot deja de estar `disabled` aunque esté ocupado |
| 3 | El drawer lista todas las reservas online (`Booking`) que se solapan con esa hora, agrupadas por hora real (puede haber un booking 5–7pm que aparezca en el slot 5–6pm y también si lo abren desde 6–7pm — pero no duplicamos: el detalle es del slot tocado, mostramos los bookings que caen en su rango). | Lista de cards |
| 4 | El drawer lista todas las reservas manuales (`BlockedSlot`) que se solapan con esa hora. Si son recurrentes, se muestran sin distinción especial salvo el ícono de recurrencia ya existente. | Lista de cards |
| 5 | Tap en una card de booking dispara el flujo existente de cancelación con motivo (`CancelBookingSheet`). Tap en una card de reserva manual dispara el flujo existente de eliminación (`DeleteBlockedSlotSheet`). | Reuso de componentes existentes |
| 6 | El CTA "Crear reserva manual" está visible **siempre** en el drawer (independiente de capacidad). Si la hora está 100% ocupada, el botón sigue funcional — el `BlockedSlotForm` ya valida conflictos y muestra los suyos. No reimplementamos esa validación. | Botón al final del drawer |
| 7 | Al tocar "Crear reserva manual": se cierra el `HourDetailDrawer` y se abre el `BlockedSlotForm` con los defaults de la hora (date, startTime, endTime, courtIds inferidos por allocation). Comportamiento idéntico al actual al tocar un slot libre. | Drawer cierra → form abre |
| 8 | El drawer muestra un estado vacío amable cuando no hay reservas en esa hora ("Esta hora está libre — toca crear para registrar una reserva manual"). El CTA queda visible. | Empty state |
| 9 | Bug fix simple (1-3 líneas) → excepción del proyecto, no requiere SDD. _(Convención del proyecto.)_ | — |
| 10 | **Alcance por DEPORTE, no por formato.** Tanto la vista por hora como el drawer muestran una reserva (online o manual, activa o cancelada) si toca alguna cancha del **mismo deporte** que el formato seleccionado (`sameSportCourtIds` = canchas cuyo `baseFormat` resuelve al mismo `sport` en el catálogo `VenueFormat`). Esto incluye reservas de **otros formatos del mismo deporte** (ej. una reserva de futbol-5 se ve estando en futbol-7) y explica por qué un slot está ocupado aunque el ocupante sea de otro formato. **Excluye** reservas de **otros deportes** (vóley, básquet…): no comparten canchas ni interesan a la gestión de este deporte. En modo legacy (sede sin catálogo de formatos = football-only) todas las canchas son del mismo deporte → se muestran todas. Antes, las reservas online se filtraban por `b.format === selectedFormat` (formato exacto) y las manuales por cancha del formato, dejando invisibles reservas del mismo deporte en otro formato. | Bookings y blocks usan el **mismo** predicado de deporte (`touchesSelectedSport`); se elimina el filtro `b.format === selectedFormat`. `relevantCourtIds` (formato exacto) queda solo para la disponibilidad del CTA. La suscripción realtime de bookings en `page.tsx` filtra por `sameSportCourtIds`. |

### No-objetivos (explícitos)
- No cambiar la vista por calendario.
- No cambiar el `BlockedSlotForm` ni `CancelBookingSheet` ni `DeleteBlockedSlotSheet`.
- No cambiar la vista por hora del flujo público de booking (jugadores reservando).
- No deduplicar bookings/blocks que se extiendan más allá de la hora tocada — se muestran completos.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Por hora-formato hay máximo unas pocas reservas (2–6 según número de canchas y combos del venue). El drawer no es una lista grande.

### Índices Firestore requeridos
- Ninguno nuevo. Reuso de las suscripciones existentes en `AdminSlotPicker` (`subscribeToBookingsForDate`, `subscribeToBlockedSlots`).

### Paginación
- N/A.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- Ninguna nueva. Las operaciones de cancelación y eliminación ya están protegidas en su capa actual (`cancelBooking`, `deleteBlockedSlot`).

### Race conditions identificadas
- **Escenario:** Admin abre el drawer; en otra pestaña/cliente se crea una reserva para esa misma hora. → **Mitigación:** las suscripciones realtime (`onSnapshot`) que ya alimentan el `AdminSlotPicker` propagan los nuevos bookings/blocks al drawer mientras esté abierto (pasamos los arrays como props derivados del estado del padre).
- **Escenario:** Admin tap en una card de booking → `CancelBookingSheet` abre. En paralelo el booking ya fue cancelado por otro admin. → **Mitigación:** `cancelBooking` ya valida el estado actual del booking en su transacción y lanza error si ya está cancelado. La UI muestra el error con `handleError`.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Sin cambios. Solo `super_admin` y `location_admin` con la sede asignada acceden al tab "Reservas". El drawer es UI sobre datos ya autorizados; no introduce nuevas lecturas/escrituras desde el cliente.

### Firestore Rules requeridas
- Sin cambios.

### Validaciones de input
- N/A — no hay nuevos inputs en este drawer (solo navegación + CTA que abre componentes existentes).

### Datos sensibles
- Sin cambios. El drawer muestra `bookedByName`, `clientName`, `reason` — todos los cuales el admin ya puede ver en el calendario actual.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Suscripciones de bookings/blocks fallan | Red, permisos | El drawer muestra el último estado conocido; si nunca cargó, muestra spinner mientras `loading` |
| Cancelar booking falla | Conflicto de estado, sin red | `CancelBookingSheet` mantiene el sheet abierto y muestra toast (comportamiento actual) |
| Crear reserva manual falla | Conflicto de horario, sin red | El `BlockedSlotForm` mantiene el form abierto y muestra error (comportamiento actual) |

### Retry strategy
- N/A — los retries dependen del SDK de Firestore (offline persistence).

### Degradación elegante
- Si el drawer fallara en montar (defensiva), el flujo previo (tap → BlockedSlotForm) debería seguir disponible como fallback. **No** lo implementamos: si el componente nuevo se rompe, se rompe — no vale la pena duplicar la entrada para una contingencia de bug.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal — hora con reservas
1. Admin entra a `/venues/admin/[id]` → tab "Reservas" → vista "Hora".
2. Selecciona formato (5v5, 7v7, etc.) y fecha.
3. Ve la lista de horas: cada hora muestra `5:00 PM – 6:00 PM` + dot verde/rojo + (si ocupada) la lista resumida de ocupantes (`occupantLabels`). **Sin precio.**
4. Toca cualquier hora.
5. Se abre el `HourDetailDrawer` desde abajo (mobile) / centro (desktop md+).
6. Ve, en orden: header con la hora y fecha → cards de bookings online → cards de reservas manuales → CTA "Crear reserva manual".
7. Decide qué hacer:
   - **Cancelar un booking**: tap en card → `CancelBookingSheet` (modal por encima del drawer) → motivo → confirmar → toast → la card se actualiza/desaparece por la suscripción realtime; el drawer queda abierto.
   - **Eliminar una reserva manual**: tap en card → `DeleteBlockedSlotSheet` (modal por encima del drawer) → confirmar → la card desaparece; drawer abierto.
   - **Crear reserva manual**: tap CTA → drawer cierra → `BlockedSlotForm` abre con la hora, fecha y canchas pre-seleccionadas.
8. Cierra el drawer (X / backdrop / swipe).

### Flujo alterno — hora vacía
1. Admin toca una hora libre (sin overlaps).
2. El drawer abre con un empty state: "No hay reservas en esta hora. Toca crear para registrar una." + CTA visible.
3. Tap CTA → mismo flujo de creación (drawer cierra → form abre).

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando | El drawer no muestra spinner propio porque los datos vienen ya hidratados del `AdminSlotPicker` (suscripción activa). Si estuviera cargando inicialmente, muestra `null` (drawer no abre hasta tener datos). |
| Vacío | Ícono + "No hay reservas en esta hora" + CTA crear |
| Lista (1+ cards) | Header → cards → CTA |
| Después de cancelar/eliminar (sin reservas restantes) | Vuelve al estado vacío en vivo |
| Error | Toasts de los componentes hijos (CancelBookingSheet, BlockedSlotForm) — el drawer no maneja errores propios |

### Consideraciones mobile-first
- Drawer tipo bottom-sheet (mismo patrón que `BlockedSlotForm` actual: `motion.div` con `y: "100%" → 0`).
- `max-h-[90vh]` con `overflow-y-auto` en el contenido.
- `pb-[calc(env(safe-area-inset-bottom,0px)+96px)]` para no quedar tapado por el bottom nav.
- Touch targets mínimo 44×44 en cards y CTA.
- Inputs N/A en este drawer (no hay inputs).
- Cuando un sheet hijo (CancelBookingSheet / DeleteBlockedSlotSheet) abre, queda **por encima** del drawer (z-index mayor). El drawer no se cierra al abrir el sheet hijo — el admin puede volver al detalle al cerrar el sheet.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- **`components/booking/HourDetailDrawer.tsx`** — drawer principal. Recibe:
  ```typescript
  interface HourDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    date: string;
    startTime: string;
    endTime: string;
    bookings: Booking[];        // ya filtrados a la hora por el padre
    blocks: BlockedSlot[];      // ya filtrados a la hora por el padre
    courts: Court[];
    onBookingClick: (b: Booking) => void;
    onBlockClick: (b: BlockedSlot, targetDate: string) => void;
    onCreateManual: () => void;
  }
  ```
- **`components/booking/AdminBookingCard.tsx`** — extrae el JSX de la card de booking del `AdminBookingCalendar`. Reusa los helpers `STATUS_DOT`, `STATUS_BADGE`, `bookingStatusColor`, `bookingStatusLabel`, `fmt12h`. Mismo look y comportamiento (clickable solo si `confirmed | pending_payment`).
- **`components/booking/AdminBlockCard.tsx`** — extrae el JSX de la card de bloqueo del `AdminBookingCalendar`. Mismo look (post swap a `slate`).

### Componentes modificados
- **`components/booking/SlotList.tsx`** — nueva prop opcional:
  ```typescript
  interface SlotListProps {
    // ... existentes
    hidePrice?: boolean;
    onSlotTap?: (slot: SlotItem) => void;  // si está presente, sobreescribe el comportamiento de selección/extensión y se llama en cualquier slot (available o no)
  }
  ```
  - Si `hidePrice` es `true`, no renderiza el `formatCOP(slot.priceCOP)` ni la etiqueta "Ocupado".
  - Si `onSlotTap` está presente, el `disabled` baja a `false` siempre y el `onClick` llama a `onSlotTap(slot)` en lugar del `handleTap` interno.
  - Comportamiento default (público) intacto.

- **`components/booking/AdminSlotPicker.tsx`**:
  - Pasa `hidePrice` y `onSlotTap` a `SlotList`.
  - Cambia su prop `onSlotSelected` por `onHourTapped` (mismo shape de datos: `{date, startTime, endTime, courtIds, bookings, blocks}`). El padre decide qué abrir.
  - Calcula los `bookings` y `blocks` ya filtrados a la hora antes de invocar el callback.

- **`components/booking/AdminBookingCalendar.tsx`**:
  - Reemplaza el JSX inline de las cards por `<AdminBookingCard />` y `<AdminBlockCard />`. Sin cambio funcional.

- **`app/venues/admin/[id]/page.tsx`**:
  - Nuevo state: `hourDetail: { date, startTime, endTime, courtIds, bookings, blocks } | null`.
  - El `onHourTapped` del `AdminSlotPicker` setea `hourDetail` y abre el drawer.
  - El drawer pasa los handlers al padre:
    - `onBookingClick` → `setCancelTarget(b)` (igual que el calendar).
    - `onBlockClick` → `setDeleteTarget({ slot, targetDate })`.
    - `onCreateManual` → cerrar drawer + abrir `BlockedSlotForm` con los defaults de `hourDetail`.

### Animaciones (Framer Motion)
- Drawer slide-up: `initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}` con spring (idéntico al `BlockedSlotForm` actual).
- Backdrop fade.
- Cards: sin animaciones individuales (el realtime de Firestore re-renderiza automáticamente).

### Responsive
- Mobile: bottom-sheet, `rounded-t-3xl`, `max-w-md mx-auto`.
- Desktop (md+): mismo bottom-sheet con `max-w-md` centrado, igual que el sheet actual de reserva manual.

### Colores
- Cards de bookings: usan los `STATUS_DOT` / `STATUS_BADGE` actuales.
- Cards de reservas manuales: `slate-50/60` + `border-slate-100` (post swap recién hecho desde `indigo`).
- CTA "Crear reserva manual": `bg-[#1f7a4f]` con texto blanco — primario de la app.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `admin_hour_detail_opened` | Tap en cualquier slot de la vista por hora | `venueId`, `date`, `startTime`, `endTime`, `bookingsCount`, `blocksCount` |
| `admin_hour_detail_create_clicked` | Tap en CTA "Crear reserva manual" desde el drawer | `venueId`, `date`, `startTime`, `endTime`, `hadOverlaps` (boolean) |
| `booking_cancelled` / `blocked_slot_deleted` | Reuso de eventos existentes (se disparan dentro de los sheets) | sin cambios |

`hadOverlaps` permite medir cuántas veces el admin crea reservas manuales en horas que ya tenían algo — señal de doble-booking intencional o de uso irregular.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
Sin cambios. Reuso de:
- `Booking` (`lib/domain/booking.ts`)
- `BlockedSlot` (`lib/domain/venue.ts`)
- `Court`, `CourtCombo`, `DaySchedule`

### Capa de dominio (`lib/domain/`)
- Sin cambios. La lógica de overlap (`b.startTime < slot.endTime && b.endTime > slot.startTime`) ya está implementada en `AdminSlotPicker`. La movemos a un helper exportado `lib/domain/court-allocation.ts → filterOverlapping(items, startTime, endTime)` solo si nos sirve para >1 caller. **Decisión por defecto: no extraerlo todavía** — duplicar el filtro en el padre y el hijo es 2 líneas y la abstracción no paga.

### Capa de API (`lib/`)
- Sin cambios.

### Componentes UI (`app/`)
- Cambios listados en sección 7. Nada en otras páginas.

### Flujo de datos
```
AdminSlotPicker (escucha bookings + blocks en realtime)
  └─ onHourTapped({ date, start, end, courtIds, bookings, blocks })
       │
VenueAdminPage (state: hourDetail)
  ├─ <HourDetailDrawer> (open si hourDetail)
  │    ├─ onBookingClick → setCancelTarget → <CancelBookingSheet>
  │    ├─ onBlockClick → setDeleteTarget → <DeleteBlockedSlotSheet>
  │    └─ onCreateManual → cerrar drawer → setBlockedDrawerOpen → <BlockedSlotForm>
```

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] La vista por hora del admin (tab Reservas → "Hora") no muestra el precio de la cancha en ningún slot.
- [ ] La etiqueta "Ocupado" en slots ocupados desaparece o se reemplaza por un indicador discreto (chevron o ícono); el slot no se ve `disabled`.
- [ ] Tap en cualquier slot (libre u ocupado) abre el `HourDetailDrawer`.
- [ ] El drawer muestra todas las reservas online y manuales que se solapan con la hora, en cards.
- [ ] Tap en card de booking → `CancelBookingSheet` aparece encima del drawer; el flujo de cancelación funciona idéntico a la vista calendario; al confirmar, la card desaparece en realtime; el drawer queda abierto.
- [ ] Tap en card de reserva manual → `DeleteBlockedSlotSheet` aparece encima; flujo idéntico; card desaparece.
- [ ] CTA "Crear reserva manual" siempre visible; al tocarlo se cierra el drawer y abre `BlockedSlotForm` con date/startTime/endTime/courtIds prellenados.
- [ ] Si la hora está vacía, el drawer muestra empty state y el CTA sigue activo.
- [ ] La vista pública de booking (jugador eligiendo hora) sigue mostrando el precio y solo permite tap en slots libres (sin regresión).
- [ ] La vista calendario sigue funcionando idéntica (las cards extraídas a componentes mantienen el mismo look y comportamiento).
- [ ] Eventos `admin_hour_detail_opened` y `admin_hour_detail_create_clicked` se disparan correctamente.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `components/booking/HourDetailDrawer.tsx` | **Nuevo** — drawer con cards + CTA |
| `components/booking/AdminBookingCard.tsx` | **Nuevo** — extracción de la card de booking del calendar |
| `components/booking/AdminBlockCard.tsx` | **Nuevo** — extracción de la card de reserva manual |
| `components/booking/SlotList.tsx` | Props `hidePrice` y `onSlotTap` opcionales (back-compat) |
| `components/booking/AdminSlotPicker.tsx` | Pasa `hidePrice={true}` y `onSlotTap`; calcula bookings/blocks por hora; cambia callback a `onHourTapped` |
| `components/booking/AdminBookingCalendar.tsx` | Reemplaza JSX inline por `<AdminBookingCard />` y `<AdminBlockCard />` |
| `app/venues/admin/[id]/page.tsx` | State `hourDetail`, monta `<HourDetailDrawer>`, orquesta cancel/delete/create |
| `lib/analytics.ts` | `logAdminHourDetailOpened()` y `logAdminHourDetailCreateClicked()` |

---

## 12. FUERA DE SCOPE

- Atajo para crear reserva manual sin pasar por el drawer (e.g., long-press). Si en uso real el extra click molesta, lo agregamos después.
- Mostrar bookings/blocks que se extienden más allá del slot tocado, con indicador visual de "este se extiende hasta las 7pm".
- Edición inline de reserva manual desde el drawer (sigue siendo "eliminar y volver a crear", como hoy).
- Filtros dentro del drawer (cliente, cancha). Volumen no lo justifica.
- Mostrar capacidad disponible numérica (e.g., "2 de 3 canchas libres"). El form actual ya valida conflictos; agregarlo aquí es duplicar.
