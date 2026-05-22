# Feature: Reservas de Cumpleaños

## 📋 Specification-Driven Development (SDD)

Permitir que el admin marque una reserva manual como "Cumpleaños" al crearla (y editarla), distinguirla visualmente en la vista por hora y en la vista por calendario (lista del día + grid mensual), y ocultar el precio para esta categoría en el alcance inicial.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
El admin de la sede tiene clientes que reservan para celebrar cumpleaños. Esos eventos tienen condiciones comerciales distintas (precio variable, paquete que incluye decoración, atención especial), pero hoy se registran como una reserva manual cualquiera. La feature agrega un **flag boolean** sobre la reserva manual para identificarla en la UI y prepararnos para flujos futuros (precio custom, paquete, registro extendido) sin construir todavía esos flujos.

En el alcance inicial el "precio" simplemente **no se muestra** en la card ni en el form — la reserva sigue persistiendo `priceCOP` (calculado del schedule como hoy) pero la UI lo oculta. De esa forma, si el admin se equivoca y desmarca cumpleaños, el precio vuelve a aparecer sin recalcular nada.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Toda reserva manual puede marcarse como **cumpleaños** con un boolean `isBirthday`. El flag se aplica al doc completo (incluidas recurrentes — en ese caso aplica a todas las instancias). Default: `false`. | Toggle en form de creación y en sheet de edición |
| 2 | El campo `isBirthday` **solo se persiste cuando `true`**. Si el admin lo desmarca, se borra el campo del doc con `deleteField()` (consistencia con `isMonthly`). | — |
| 3 | El precio (`priceCOP`) sigue calculándose en el form como hoy, pero **si `isBirthday === true` la UI lo oculta** (form, card, slot, etc.). El número se persiste igual — el alcance inicial es solo visual. | El form muestra una nota "Las reservas de cumpleaños no muestran el precio en la UI." en lugar del display. La card oculta la fila de precio y muestra solo el chip "🎂 Cumpleaños". |
| 4 | Una reserva de cumpleaños usa los **mismos estados** que cualquier reserva manual (`pending → confirmed → played → paid` + terminales). El status se gestiona idéntico (quick advance, popover, registro de pago si quiere registrarse). | Sin cambios en el flow de status |
| 5 | El registro de pago (`paid`) sigue funcionando para reservas de cumpleaños. El admin captura montos manuales en el sheet de pago como con cualquier otra reserva — el "precio referencia" oculto no impide ni condiciona el cobro. | Sin cambios en el sheet de pago |
| 6 | **Distinción visual en la card** (`AdminBlockCard`): cuando `isBirthday === true`, el fondo y borde de la card cambian a rosa pastel; aparece un chip "🎂 Cumpleaños" en el header (al lado del badge de status); la fila de precio se reemplaza por el mismo chip (alineado a la derecha, mismo patrón que "Mensualidad"). | — |
| 7 | **Distinción visual en la vista por hora** (`AdminSlotPicker` → `SlotList`): si un slot contiene al menos un block con `isBirthday`, se agrega un chip rosa "🎂 1 cumpleaños" junto al chip existente "N reservas". El label individual del ocupante (en la lista del slot) lleva un emoji 🎂 antes del nombre cuando es cumpleaños. | — |
| 8 | **Distinción visual en el calendario mensual** (`AdminBookingCalendar`): en cada celda de día, si hay al menos un cumpleaños ese día, se agrega un **tercer dot rosa** junto a los dots existentes (verde para bookings online, gris para reservas manuales). El cálculo se hace dentro del effect ya existente de `loadMonthIndicators`. | — |
| 9 | El toggle "Cumpleaños" en el form aparece **independiente del toggle "Se repite"** (a diferencia de "Pago mensual" que solo aplica a recurrentes). El admin puede marcar cumpleaños tanto en reservas puntuales como recurrentes. | — |
| 10 | Reservas viejas sin `isBirthday` se leen como `false` (no rompen). | — |

### No-objetivos (explícitos)
- **No** introducir un input de precio custom para cumpleaños — `priceCOP` sigue siendo el calculado del schedule (solo lo ocultamos). Si se necesita un precio editable, se agrega en un SDD posterior.
- **No** introducir un campo de "paquete de cumpleaños" (decoración incluida, número de invitados, etc.). El flag es solo un marcador.
- **No** crear una colección, índice ni reportería separada de cumpleaños. Si el admin necesita "todos los cumpleaños del mes" más adelante, se agrega un índice.
- **No** notificar al cliente automáticamente ("¡Feliz cumpleaños!") ni programar mensajes. Es solo gestión interna del admin.
- **No** restringir quién puede marcar cumpleaños — cualquier admin con acceso a la sede puede.
- **No** modificar el flow de cancelación ni el de registro de pago.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Igual que las reservas manuales actuales. El flag adicional es un boolean opcional, no cambia cardinalidad ni patrones de query.

### Índices Firestore requeridos
- Ninguno nuevo. El cálculo del indicador en el grid mensual itera sobre los blocks ya cargados con `getAllBlockedSlots()` (que ya se hace hoy). Solo se agrega un Set extra al recorrer.

### Paginación
- N/A.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Creación**: `createBlockedSlot` (Cloud Function) ya es transaccional para detectar conflictos de canchas. Solo agrega un campo más al payload.
- **Edición** (`updateManualReservation`): `updateDoc` directo (sin transacción), igual que hoy para `clientName/clientPhone/reason/isMonthly`. El flag `isBirthday` no es estado compartido — un last-write-wins es aceptable y consistente con el resto de metadatos.

### Race conditions identificadas
- **Escenario**: Admin A marca cumpleaños mientras Admin B lo desmarca en paralelo. → **Mitigación**: last-write-wins. Como el flag es solo visual y no condiciona otras escrituras, ningún resultado es incorrecto. El admin que se sorprenda puede re-editar.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Sin cambios. La creación y edición de `BlockedSlot` está restringida a `super_admin` y `location_admin` (asignado a la sede) en `firestore.rules`. El nuevo campo cae bajo las mismas reglas existentes.

### Firestore Rules requeridas
- Sin cambios. `isBirthday` es un boolean opcional dentro del doc `BlockedSlot` y queda permitido por las reglas actuales de update/create del admin de la sede.

### Validaciones de input
- `isBirthday`: si está presente, debe ser un boolean. En la Cloud Function: `typeof input.isBirthday === "boolean"`; cualquier otro valor se ignora.
- No es PII ni dato sensible — es un flag interno.

### Datos sensibles
- N/A. El flag no contiene información del cliente. Visibilidad reservada al admin igual que el resto del doc.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Falla al crear con `isBirthday: true` | Red, conflicto de canchas | Mismo flow que hoy: toast de error + form abierto para retry. El toggle conserva su estado. |
| Falla al guardar edición de `isBirthday` | Red, doc eliminado | Toast "Error al actualizar la reserva" (manejado por `handleError`); el sheet queda abierto para retry. |
| Doc viejo sin `isBirthday` | Doc creado antes del SDD | Lectura default `false` — la card se renderiza con el layout normal. |
| `isBirthday` con valor no-boolean (manipulación) | Manipulación directa de Firestore | La Cloud Function lo ignora al crear; en lectura, `!!slot.isBirthday` coerce a boolean (cualquier truthy → cumpleaños). |

### Retry strategy
- Manual. El admin reintenta tapeando el toggle de nuevo. No hay auto-retry.

### Degradación elegante
- Si el flag no se puede leer por error, la card cae al render normal (sin tinte rosa, sin chip). Nada se rompe.
- Si el indicador del calendario mensual falla en calcularse para algún día, el dot rosa no aparece — el resto del grid sigue funcionando (los Sets de bookings/blocks no dependen del de birthdays).

---

## 6. UX — FLUJOS DE USUARIO

### Flujo 1 — Crear una reserva de cumpleaños
1. Admin abre `BlockedSlotForm` (desde `HourDetailDrawer` o desde la vista calendario).
2. Llena fecha, hora, canchas, cliente, celular como hoy.
3. **Activa el toggle "🎂 Cumpleaños"** (debajo del input de celular, antes del bloque de precio).
4. El display de precio desaparece y se reemplaza por una nota: "Las reservas de cumpleaños no muestran el precio en la UI."
5. Submit "Reservar" → la reserva se crea con `isBirthday: true` y `priceCOP` calculado (oculto en UI).

### Flujo 2 — Marcar cumpleaños sobre una reserva existente
1. Admin abre una reserva existente (botón ✏️ en la card).
2. `EditManualReservationSheet` muestra los campos actuales + el toggle "🎂 Cumpleaños".
3. Activa el toggle → "Guardar" se habilita (porque hay un cambio real).
4. Al guardar: la card se re-renderiza con tinte rosa y chip "🎂 Cumpleaños".

### Flujo 3 — Desmarcar cumpleaños
1. Mismo sheet de edición. El admin desactiva el toggle.
2. Al guardar, se manda `isBirthday: undefined` → `updateManualReservation` lo borra con `deleteField()`.
3. La card vuelve al look normal con el precio visible.

### Flujo 4 — Ubicar cumpleaños del mes
1. Admin entra a la vista calendario (`AdminBookingCalendar`).
2. El grid mensual muestra un **tercer dot rosa** en cada día con al menos un cumpleaños.
3. Tap en el día → la lista del día muestra esas reservas con el tinte rosa.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Form cumpleaños OFF | Display de precio normal (calculado del schedule) |
| Form cumpleaños ON | Nota en lugar del display: "Las reservas de cumpleaños no muestran el precio en la UI." |
| Card cumpleaños | Fondo `bg-pink-50/70`, borde `border-pink-200`; chip "🎂 Cumpleaños" arriba; sin precio numérico (chip rosa en la fila de precio) |
| Card cumpleaños cancelada | Mismo borde rosa pero atenuado (`opacity-60` ya aplicado por el render de cancelada), chip "🎂 Cumpleaños" con `line-through` opcional. Decisión propuesta: mantener el chip sin tachar para que sea legible al volver atrás. |
| Slot con cumpleaños (`SlotList`) | Chip "🎂 1 cumpleaños" (rosa) junto al chip "N reservas" (gris); emoji 🎂 al inicio del `who` en el label del ocupante |
| Día con cumpleaños (grid mensual) | Tercer dot rosa al lado del verde (bookings online) y gris (blocks) |

### Consideraciones mobile-first
- Toggle de cumpleaños: mismo patrón (track 11×6, knob 5×5) que "Pago mensual". Track activo: `bg-pink-500`.
- Chip "🎂 Cumpleaños" en card: 11px-12px de font-size, no rompe el wrap del header.
- Inputs no cambian, no hay riesgo de zoom en iOS (font-size ≥ 16px se mantiene).
- En el grid mensual, los tres dots juntos miden ~10px de ancho en celdas de ~36px — caben sin colapsar.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- Ninguno. Se reutilizan todos los existentes.

### Componentes modificados
- **`components/booking/BlockedSlotForm.tsx`**:
  - Nuevo state `isBirthday: boolean`.
  - Toggle "🎂 Cumpleaños" entre el bloque de Celular y el de Precio. Track rosa cuando activo.
  - Cuando `isBirthday === true`, el bloque de precio cambia de display calculado a una nota informativa.
  - En el payload del `createBlockedSlot`, pasar `isBirthday: isBirthday ? true : undefined` (mismo patrón que `isMonthly`).

- **`components/booking/EditManualReservationSheet.tsx`**:
  - Nuevo state `isBirthday: boolean`, inicializado de `slot.isBirthday ?? false`.
  - Toggle "🎂 Cumpleaños" debajo del input de notas (visible siempre, no condicional a recurrencia).
  - Incluir en el cálculo de `hasChanges`.
  - En `handleSave`: pasar `isBirthday: isBirthday ? true : undefined` a `updateManualReservation` (que ya borra con `deleteField()` cuando es `undefined`).

- **`components/booking/AdminBlockCard.tsx`**:
  - Leer `slot.isBirthday` (truthy → cumpleaños).
  - Cuando es cumpleaños y NO está cancelada: cambiar las clases del contenedor a `bg-pink-50/70 border-pink-200` (en lugar de `bg-slate-50/60 border-slate-100`).
  - En el header (junto al ícono `CalendarPlus` con la hora), agregar un chip pequeño "🎂 Cumpleaños" — bg `bg-pink-100 text-pink-700 border border-pink-200`.
  - En la fila de precio (`mt-2 pt-1.5 border-t`): si es cumpleaños, omitir el precio numérico y mostrar el chip "🎂 Cumpleaños" (alineado a la derecha, mismo patrón que `isMonthly` con su chip violeta). Si la reserva es además `isMonthly`, se priorizan ambos chips lado a lado (o stack según ancho — decisión menor en implementación).

- **`components/booking/AdminSlotPicker.tsx`** + **`components/booking/SlotList.tsx`**:
  - Extender `OccupantLabel` con `isBirthday?: boolean`.
  - En `AdminSlotPicker.blockLabel`, setear `isBirthday: !!b.isBirthday` en el label retornado.
  - En `SlotList`, cuando renderiza `slot.occupantLabels`:
    - Si algún label es `isBirthday`, además del chip "N reservas" (gris) agregar un chip "🎂 N cumple{N>1?'s':''}" (rosa) con conteo.
    - En el `<li>` de cada ocupante con `isBirthday`, prefijar el `who` con 🎂 y aplicar `text-pink-700` al texto.

- **`components/booking/AdminBookingCalendar.tsx`**:
  - Nuevo state `monthBirthdayDates: Set<string>`.
  - Dentro de `loadMonthIndicators`, después del loop que llena `blockDates`, hacer una segunda pasada (sobre el mismo `allBlocks` expandido) que detecta si alguna expansión incluye `isBirthday`. Llenar `monthBirthdayDates`.
  - En el render de cada celda, agregar un tercer dot rosa cuando `monthBirthdayDates.has(iso)`.

### Animaciones (Framer Motion)
- Toggle: sin animación nueva (CSS `transition-colors` y `transition-transform` ya existentes en otros toggles).
- Card al pasar a/de cumpleaños: la transición CSS `transition-colors` del contenedor existente cubre el cambio de fondo/borde.
- Sin pulse extra: el cambio visual ya es suficientemente notorio.

### Responsive
- Card: chip "🎂 Cumpleaños" se ubica con `flex-wrap` en el header — en mobile puede caer a la segunda línea si el badge de status ocupa mucho. Aceptable.
- Grid mensual: los tres dots (verde, gris, rosa) se renderizan en un `<span className="flex gap-0.5 mt-0.5">` ya existente — solo se agrega un tercer hijo condicional.

### Colores (paleta rosa para cumpleaños)
- Track del toggle activo: `bg-pink-500`.
- Card fondo: `bg-pink-50/70`, borde `border-pink-200`.
- Chip "🎂 Cumpleaños": `bg-pink-100 text-pink-700 border border-pink-200`.
- Texto del ocupante en SlotList: `text-pink-700`.
- Dot rosa del grid mensual: `bg-pink-400` (cuando no es día seleccionado), `bg-white` (cuando lo es, mismo patrón que los otros dots).

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `manual_reservation_created` (existente) | Sin nuevo evento; se agrega prop | `isBirthday: boolean` (nuevo, además de los actuales `hasPhone`, `priceCOP`, etc.) |
| `manual_reservation_birthday_toggled` (nuevo) | Tap en el toggle dentro del `EditManualReservationSheet` que cambia el flag y se guarda exitosamente | `venueId`, `slotId`, `from: boolean`, `to: boolean` |

Decisión propuesta: no logueamos el toggle dentro del form de creación porque ya queda capturado en `manual_reservation_created.isBirthday`. Solo loggeamos en edición porque ahí sí es un cambio explícito post-hoc que vale la pena medir.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
`lib/domain/venue.ts` — agregar el campo a `BlockedSlot`:

```typescript
export interface BlockedSlot {
    // ... campos existentes ...
    isMonthly?: boolean;
    /** Marca interna del admin: esta reserva es para un cumpleaños. v1: solo afecta UI (oculta precio + tinte rosa). */
    isBirthday?: boolean;
    // ... resto ...
}
```

Sin tipos nuevos. Sin helpers nuevos (es solo un boolean, `!!slot.isBirthday` basta — se puede inlinar).

### Capa de dominio (`lib/domain/`)
- Ningún archivo nuevo. Si emerge la necesidad de un helper `isBirthday(slot)` lo agregamos a `venue.ts`, pero hoy `!!slot.isBirthday` es suficiente.

### Capa de API (`lib/`)
- **`lib/venues.ts`**:
  - `CreateBlockedSlotInput`: agregar `isBirthday?: boolean`.
  - `createBlockedSlot()`: ya manda el input al callable sin filtrar — solo se necesita que el cliente pase `isBirthday` cuando aplica.
  - `updateManualReservation()`: extender la firma de `updates` con `isBirthday?: boolean`. El código ya itera con `deleteField()` cuando el valor es `undefined`, así que no requiere lógica nueva.

- **Cloud Function `functions/src/blocked-slots.ts`** (`createBlockedSlot`):
  - Extender `interface CreateInput` con `isBirthday?: boolean`.
  - Después de validar `priceCOP` y `status`, normalizar `const isBirthday = input.isBirthday === true;`.
  - En la construcción de `docData`, agregar `if (isBirthday) docData.isBirthday = true;` (mismo patrón que `if (normalizedRecurrence && input.isMonthly === true) docData.isMonthly = true;`).
  - **No** condicionar `isBirthday` a recurrencia (a diferencia de `isMonthly`).

- **`lib/analytics.ts`**:
  - Extender `logBlockedSlotCreated` para incluir `isBirthday: boolean` en el evento.
  - Agregar `logManualReservationBirthdayToggled(venueId, slotId, from, to)` que dispara `manual_reservation_birthday_toggled`.

### Componentes UI (`app/`)
- Ningún cambio en `app/venues/admin/[id]/page.tsx` ni en otras páginas. La orquestación de handlers ya cubre todo (form, sheet, calendario, drawer).

### Backward compatibility
- **Lectura**: `slot.isBirthday` puede ser `undefined` en docs viejos. Toda la UI usa `!!slot.isBirthday` → `false` → render normal.
- **Escritura**: la Cloud Function solo persiste el campo si es `true`; la actualización borra el campo cuando se setea a `undefined`. Docs nunca quedan con `isBirthday: false` (consistencia con `isMonthly`).
- **Sin migración** de datos.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] El form de creación muestra un toggle "🎂 Cumpleaños" con track rosa cuando está activo.
- [ ] Al activar el toggle en el form, el display de precio se oculta y aparece una nota explicativa. El precio se sigue calculando y persistiendo internamente.
- [ ] Crear una reserva con cumpleaños activo persiste `isBirthday: true` en Firestore.
- [ ] Crear una reserva con cumpleaños inactivo **no** persiste `isBirthday: false` (el campo queda ausente en el doc).
- [ ] El sheet de edición muestra el toggle "🎂 Cumpleaños" (con el valor actual). Al guardar, persiste o borra el campo según corresponda.
- [ ] La card de cumpleaños se renderiza con fondo y borde rosa, chip "🎂 Cumpleaños" en el header, y la fila de precio reemplazada por el chip (sin valor numérico).
- [ ] La card cancelada con cumpleaños conserva el chip "🎂 Cumpleaños" y el resto del look de cancelada (opacidad, line-through en hora y nombre).
- [ ] En la vista por hora (`AdminSlotPicker`), un slot con al menos un block de cumpleaños muestra el chip rosa "🎂 N cumpleaños" junto al chip de reservas, y el label de ese ocupante lleva el emoji + color rosa.
- [ ] En la vista calendario, el grid mensual muestra un tercer dot rosa cuando un día tiene al menos un cumpleaños.
- [ ] Reservas viejas sin `isBirthday` se renderizan con el look normal (sin tinte rosa, sin chip).
- [ ] Si dos admins cambian el flag en paralelo, gana el último write y la UI converge.
- [ ] El registro de pago (sheet de pago) funciona igual para reservas de cumpleaños.
- [ ] El status flow (`pending → confirmed → played → paid` y terminales) funciona idéntico — el flag no condiciona ninguna transición.
- [ ] Eventos `manual_reservation_created.isBirthday` y `manual_reservation_birthday_toggled` se disparan correctamente.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Agregar `isBirthday?: boolean` a `BlockedSlot` |
| `lib/venues.ts` | Extender `CreateBlockedSlotInput` y firma de `updateManualReservation` con `isBirthday?: boolean` |
| `functions/src/blocked-slots.ts` | Aceptar `isBirthday` en `CreateInput`; persistir solo si `=== true` |
| `lib/analytics.ts` | Prop `isBirthday` en `manual_reservation_created`; nuevo `logManualReservationBirthdayToggled` |
| `components/booking/BlockedSlotForm.tsx` | Toggle "Cumpleaños", display de precio condicional, payload con `isBirthday` |
| `components/booking/EditManualReservationSheet.tsx` | Toggle "Cumpleaños", inclusión en `hasChanges` y `handleSave`, log de evento |
| `components/booking/AdminBlockCard.tsx` | Tinte rosa cuando `isBirthday`, chip en header, reemplazo del precio por chip |
| `components/booking/AdminSlotPicker.tsx` | Mapear `isBirthday` al `OccupantLabel` |
| `components/booking/SlotList.tsx` | `OccupantLabel.isBirthday?`, chip "🎂 N cumpleaños", prefijo emoji + color en el label |
| `components/booking/AdminBookingCalendar.tsx` | `monthBirthdayDates` y tercer dot rosa en el grid mensual |

---

## 12. FUERA DE SCOPE

- Input editable de precio para cumpleaños (precio variable explícito en el form). El precio sigue calculándose del schedule y solo se oculta.
- Categorías de paquete de cumpleaños (decoración, número de invitados, atenciones).
- Notificaciones automáticas al cliente.
- Reportería específica (ingresos por cumpleaños, conteo mensual). Se puede agregar cuando exista necesidad real con un índice apropiado.
- Permisos diferenciados (rol que solo gestiona cumpleaños).
- Animación especial en la card (confetti, etc.). Si después se pide branding más festivo, se ajusta.
- Filtro en la vista calendario para mostrar solo cumpleaños. La distinción visual es suficiente en v1.
- Modificar reservas online (no manuales) — el flag aplica únicamente a `BlockedSlot`. Las `Booking` online no tienen este concepto.
