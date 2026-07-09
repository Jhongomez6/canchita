# Feature: Ocultar precio informativo de cancha a administradores de sede (configurable por sede)

## 📋 Specification-Driven Development (SDD)

Permitir que el super admin active, por sede, el ocultamiento del **precio informativo/tarifa de la cancha** en el panel de administración, de modo que **ningún location admin (owner ni staff)** vea la tarifa de la cancha al **crear una reserva** ni al **registrar un pago** — pero sí pueda seguir registrando los montos cobrados.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
El dueño de una sede a veces no quiere que la **tarifa oficial de la cancha** sea visible para quien opera el panel (trabajadores o cualquier location admin). Hoy esa tarifa aparece como precio informativo en **dos momentos**: al **crear una reserva manual** (desglose de precio en el formulario) y al **registrar un pago** (fila "Precio reserva" + pre-llenado del monto + badge de diferencia). Se introduce un **flag por sede** (`hidePricesForLocationAdmins`) que, cuando está activo, oculta ese precio informativo para **todos los location admin (owner + staff)**. El **super admin siempre ve la tarifa** (es quien configura el flag).

Decisiones de alcance confirmadas con el usuario:
- **A quién se oculta:** a *todos* los location admin (owner **y** staff). Al super admin nunca.
- **Quién configura:** *solo super admin*, con un toggle por sede (field-level super-admin-only, igual que `paymentMethods`).
- **Qué se oculta:** el **precio informativo/tarifa de la cancha** en (1) el **formulario de crear reserva manual** y (2) el **sheet de registrar pago** (fila de precio, pre-llenado que revela la tarifa, y badge de diferencia).
- **Qué NO se oculta (confirmado):** los **montos que el admin registra** (efectivo/transferencia que efectivamente cobra), los chips de pago registrado en las cards, el tab **Balance del día**. El operador necesita registrar y cuadrar caja; solo se le oculta la *tarifa de referencia*.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | `hidePricesForLocationAdmins` es `boolean`; **default `false`** (ausente ⇒ tarifa visible). Retrocompat total. | Ninguna sede actual cambia al desplegar. |
| 2 | Solo `super_admin` puede escribir el flag (Firestore Rules field-level, junto a `paymentMethods`). | Toggle nuevo en el tab "Sede" (info) del panel, visible solo a super admin. |
| 3 | Con flag `true` **y** usuario **no super admin** ⇒ `hidePrice = true` se propaga a los componentes afectados. | El precio informativo desaparece de esos puntos. |
| 4 | El **super admin siempre ve la tarifa**, aunque el flag esté `true`. | El flag no afecta el render para super admin. |
| 5 | **Formulario de crear reserva manual (`BlockedSlotForm`)**: se oculta el bloque de desglose de precio (subtotal / descuento / total). | La reserva se crea igual; el `priceCOP` se calcula y guarda internamente. |
| 6 | **Sheet de registrar pago (`RegisterPaymentSheet`)**: se oculta la fila "Precio reserva"; el input de efectivo **NO** se pre-llena con la tarifa (queda en 0 para que el admin escriba lo cobrado); se oculta el badge de diferencia (sobra/falta vs precio). | El admin registra efectivo/transferencia manualmente; nunca ve la tarifa. |
| 7 | Los **montos registrados** (inputs de efectivo/transferencia, total escrito, chips en cards, abono ya pagado) **se mantienen visibles**. | El operador cobra y cuadra caja normal. |
| 8 | Coherencia — **tarjeta de reserva (`AdminBlockCard`) y card de reserva online (`AdminBookingCard`)**: la fila "Precio"/total de tarifa **también se oculta** con el mismo flag (confirmado), para que la tarifa no reaparezca en la lista. Los chips de pago registrado se mantienen. | Cards muestran cliente/hora/cancha/estado y pagos, sin la tarifa. |
| 9 | El **precio se sigue calculando y guardando** siempre; el flag es puramente de **presentación**. | No cambia lógica de precios, pagos, balance ni analítica (que ve el super admin). |
| 10 | La página pública `/venues/[id]` (cara al jugador) **no se ve afectada**. | El jugador ve tarifas para reservar como hoy. |

---

## 2. ESCALABILIDAD

### Volumen esperado
- `< 100` sedes. El flag es un `boolean` en el doc `venues/{venueId}` existente → **cero colecciones/documentos nuevos**.

### Índices Firestore requeridos
- **Ninguno.** No hay queries nuevas; el flag se lee del doc de la sede ya cargado en `loadData()`.

### Paginación
- No aplica.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Ninguna nueva.** Setear el flag es una escritura de un campo sobre `venues/{venueId}` (super admin, `updateVenueSettings` → `updateDoc`). No es estado compartido concurrente.

### Race conditions identificadas
| Escenario | Riesgo | Mitigación |
|-----------|--------|------------|
| Super admin cambia el flag con el panel abierto en otro dispositivo | El location admin sigue con el estado anterior hasta recargar | El flag se lee en `loadData()` (una vez por carga). Gate de presentación, no candado de datos. Cambio raro/administrativo. Aceptable. |

---

## 4. SEGURIDAD

### Autenticación y autorización
- **Escritura del flag:** solo `super_admin` (Firestore Rules, field-level).
- **Lectura:** el campo viaja en `venues/{venueId}`, ya legible por cualquier autenticado. Es una preferencia de UI, no PII.

### Firestore Rules requeridas
Agregar `hidePricesForLocationAdmins` a la lista de campos que un location admin **no** puede modificar (solo super admin), junto a `paymentMethods`. Diff sobre [firestore.rules](../firestore.rules) (líneas ~260-267):

```
allow update: if request.auth != null
  && (
    isSuperAdmin()
    || (
      isLocationAdminFor(venueId)
      && !request.resource.data.diff(resource.data).affectedKeys()
           .hasAny(['paymentMethods', 'hidePricesForLocationAdmins'])
    )
  );
```

### Validaciones de input
- Flag `boolean`; `updateVenueSettings` lo pasa en el spread. TypeScript acota el tipo; no requiere validador dedicado.

### Datos sensibles — nota honesta de límite
- El ocultamiento es **UI-level (autorización de presentación), no un límite de datos.** El `priceCOP` sigue viajando en los docs (`venues`, `blocked_slots`, `bookings`) legibles por el location admin asignado; alguien con conocimiento técnico podría leerlo vía SDK. Para el caso de negocio (que la tarifa **no aparezca en la app** al operador) el gate de UI es suficiente. Cerrarlo a nivel de datos sería un rediseño mayor (lecturas tras Cloud Functions) — **fuera de alcance**.
- El input de efectivo se **deja en 0** (no pre-llenado) cuando el flag está activo, precisamente para no filtrar la tarifa por el valor pre-rellenado.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `hidePricesForLocationAdmins` ausente/undefined | Sede pre-feature | Se trata como `false` → tarifa visible (comportamiento actual). |
| `venue` aún no cargado | Carga en curso / sin red | El panel bloquea render con skeleton hasta tener `venue`; el flag resuelve junto al resto. Default seguro `false`. |
| Update del flag rechazado por reglas | Actor sin permiso (no super admin) | `handleError()` toast; el toggle revierte. En la práctica solo el super admin ve el toggle (tab "Sede" es super-admin-only). |

### Retry strategy
- Update idempotente; el super admin reintenta tras el toast. Sin retry automático.

### Degradación elegante
- Si el flag no resuelve, no se oculta nada (default `false` = mostrar tarifa). Nunca oculta por error de carga.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo A — Super admin activa el ocultamiento (happy path)
1. Super admin → `/venues/admin/[id]` → tab **"Sede"** (info).
2. Ve el toggle **"Ocultar precio de cancha a administradores de sede"** con subtítulo explicativo.
3. Lo activa → `markDirty()` → **Guardar cambios** → `updateVenueSettings` persiste `true` → toast `success`.

### Flujo B — Location admin opera con tarifa oculta
1. Owner o staff abre una sede con el flag activo.
2. **Crear reserva manual**: el formulario **no muestra el desglose de precio**; completa cliente/hora/cancha y guarda; la reserva se crea con su `priceCOP` interno.
3. **Registrar pago**: el sheet **no muestra "Precio reserva"** ni pre-llena la tarifa; el admin escribe el efectivo/transferencia cobrado; **no** ve el badge de diferencia. Guarda normal.
4. En la lista de reservas, las cards muestran cliente/hora/estado y pagos registrados, **sin la tarifa**.
5. **Balance del día** funciona normal (montos cobrados visibles).

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Flag off (default) | Tarifa visible para todos (comportamiento actual). |
| Flag on + super admin | Tarifa visible (super admin nunca afectado). |
| Flag on + location admin | Tarifa oculta en form, sheet de pago y cards; montos cobrados visibles. |
| Cargando | Skeleton actual del panel. |
| Éxito (toggle) | Toast `success` + toggle refleja el nuevo valor tras guardar. |

### Consideraciones mobile-first
- El toggle reusa el patrón del toggle "Sede activa" (mismo touch target). Respetar `pb-24 md:pb-0`.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes afectados (prop nueva `hidePrice?: boolean`, default `false`)
- `BlockedSlotForm` → oculta el bloque de desglose de precio (subtotal/descuento/total). Cálculo/guardado intactos.
- `RegisterPaymentSheet` → oculta fila "Precio reserva"; pre-llena efectivo en 0 (no con la tarifa) cuando `hidePrice`; oculta el badge de diferencia (over/under).
- `AdminBlockCard` → oculta la fila "Precio" (`block.priceCOP`); conserva badges Cumpleaños/Mensualidad y chips de pago.
- `AdminBookingCard` → oculta `totalPriceCOP` y `DepositSummary`; conserva chips de pago.
- `HourDetailDrawer` y `AdminBookingCalendar` → reciben `hidePrice` y lo reenvían a las cards que renderizan.
- Toggle en tab "Sede": markup inline (patrón del toggle "Sede activa"), sin componente nuevo.

### Animaciones (Framer Motion)
- Sin animaciones nuevas. El toggle usa la transición CSS existente.

### Responsive
- Toggle full-width bajo "Sede activa" en el tab info.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_hide_prices_toggled` | Super admin guarda un cambio del flag | `venue_id`, `hidden` (`true`/`false`) |

> P4 (Platform/admin ops), `snake_case`. Se dispara en `handleSave` solo si el flag cambió respecto al valor cargado.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
```typescript
// lib/domain/venue.ts — interface Venue
export interface Venue {
  // ...campos existentes...
  /** Si true, oculta la tarifa de cancha a los location admin (owner+staff) en el panel.
   *  Solo super admin lo edita. Ausente ⇒ false (tarifa visible). */
  hidePricesForLocationAdmins?: boolean;
}
```

### Capa de dominio (`lib/domain/venue.ts`)
- Helper puro (testeable) para el gate:
```typescript
export function shouldHidePricesFor(venue: Pick<Venue, "hidePricesForLocationAdmins">, isSuper: boolean): boolean {
  return !!venue.hidePricesForLocationAdmins && !isSuper;
}
```

### Capa de API (`lib/venues.ts`)
- `updateVenueSettings`: agregar `"hidePricesForLocationAdmins"` al `Partial<Pick<Venue, ...>>` del parámetro `data`. Se pasa en el spread; sin lógica extra.

### Componentes UI (`app/`)
- [app/venues/admin/[id]/page.tsx](../app/venues/admin/[id]/page.tsx):
  - Estado `hidePricesFromAdmins` (bool), inicializado en `loadData()` desde `v.hidePricesForLocationAdmins ?? false`.
  - Toggle en el tab "info" (bajo "Sede activa") — solo lo alcanza el super admin.
  - Incluir `hidePricesForLocationAdmins: hidePricesFromAdmins` en `settingsPayload` de `handleSave`.
  - Derivar `const hidePrices = shouldHidePricesFor(venue, isSuper);` usando el valor **persistido** de `venue` (no el estado editable), para que el gate refleje lo guardado.
  - Pasar `hidePrice={hidePrices}` a: `BlockedSlotForm`, ambos `RegisterPaymentSheet` (manual y booking), `HourDetailDrawer`, `AdminBookingCalendar`.
  - Disparar `venue_hide_prices_toggled` en `handleSave` si cambió.
- [components/booking/BlockedSlotForm.tsx](../components/booking/BlockedSlotForm.tsx): prop `hidePrice`; ocultar desglose (líneas ~515-532). Cálculo/guardado de `priceCOP` sin cambios.
- [components/booking/RegisterPaymentSheet.tsx](../components/booking/RegisterPaymentSheet.tsx): prop `hidePrice`; ocultar "Precio reserva" (líneas ~271-280); en el `useEffect` de init (líneas ~104-126) no pre-llenar efectivo con la tarifa cuando `hidePrice` (dejar 0; para abono, transfer=deposit y cash=0); ocultar badge de diferencia (líneas ~369-392).
- [components/booking/HourDetailDrawer.tsx](../components/booking/HourDetailDrawer.tsx): prop `hidePrice`; reenviar a `AdminBookingCard`/`AdminBlockCard`.
- [components/booking/AdminBookingCalendar.tsx](../components/booking/AdminBookingCalendar.tsx): prop `hidePrice`; reenviar a las cards (líneas ~323 y ~339).
- [components/booking/AdminBlockCard.tsx](../components/booking/AdminBlockCard.tsx): prop `hidePrice`; ocultar fila "Precio" (líneas ~235-257), conservar badges de estado.
- [components/booking/AdminBookingCard.tsx](../components/booking/AdminBookingCard.tsx): prop `hidePrice`; ocultar `totalPriceCOP` (línea ~296) y `DepositSummary` (líneas ~301-305).
- [firestore.rules](../firestore.rules): `hidePricesForLocationAdmins` en el `hasAny([...])` field-level de venues (§4).
- [lib/analytics.ts](../lib/analytics.ts): evento `venue_hide_prices_toggled`.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Sede sin flag: tarifa visible para todos (default `false`).
- [ ] Super admin puede activar/desactivar el toggle en el tab "Sede" y persiste al guardar.
- [ ] Con flag `true`, un **owner** no ve la tarifa en el formulario de crear reserva.
- [ ] Con flag `true`, un **owner/staff** no ve "Precio reserva" en el sheet de registrar pago, el efectivo no viene pre-llenado con la tarifa, y no aparece el badge de diferencia.
- [ ] Con flag `true`, las cards de reserva no muestran la tarifa (coherencia), pero sí los pagos registrados.
- [ ] Con flag `true`, el **super admin sí ve** la tarifa en todos esos puntos.
- [ ] Con flag `true`, **Balance del día** y los montos cobrados siguen visibles; registrar un pago funciona y guarda correctamente.
- [ ] Crear reserva manual con flag `true` guarda `priceCOP` correcto (aunque no se muestre).
- [ ] Un location admin **no** puede modificar el flag (rechazo por Firestore Rules).
- [ ] La página pública `/venues/[id]` muestra tarifas al jugador sin importar el flag.
- [ ] Evento `venue_hide_prices_toggled` se dispara al cambiar el flag.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Campo `hidePricesForLocationAdmins?` en `Venue`; helper `shouldHidePricesFor` |
| `lib/venues.ts` | Agregar el campo al `Pick` de `updateVenueSettings` |
| `app/venues/admin/[id]/page.tsx` | Estado + toggle en tab info; derivar `hidePrices`; propagar a form / sheets / drawer / calendar; analytics |
| `components/booking/BlockedSlotForm.tsx` | Prop `hidePrice`; ocultar desglose (mantener cálculo) |
| `components/booking/RegisterPaymentSheet.tsx` | Prop `hidePrice`; ocultar "Precio reserva", no pre-llenar efectivo con tarifa, ocultar badge diff |
| `components/booking/HourDetailDrawer.tsx` | Prop `hidePrice`; reenvío a cards |
| `components/booking/AdminBookingCalendar.tsx` | Prop `hidePrice`; reenvío a cards |
| `components/booking/AdminBlockCard.tsx` | Prop `hidePrice`; ocultar fila de precio |
| `components/booking/AdminBookingCard.tsx` | Prop `hidePrice`; ocultar total + `DepositSummary` |
| `firestore.rules` | `hidePricesForLocationAdmins` en el `hasAny([...])` field-level de venues |
| `lib/analytics.ts` | Evento `venue_hide_prices_toggled` |

---

## ⚠️ Decisiones de Diseño Clave

1. **Flag booleano por sede, super-admin-only — confirmado.** Reusa el patrón field-level de `paymentMethods`. Default `false` = comportamiento actual; cero migración.

2. **Cards incluidas por coherencia — confirmado.** Además del *formulario de crear reserva* y el *sheet de registrar pago*, se oculta también la tarifa en las **tarjetas de reserva** (`AdminBlockCard`/`AdminBookingCard`), para que no reaparezca en la lista. Los chips de pago registrado se mantienen.

3. **Se oculta la tarifa, NO los montos cobrados — confirmado.** Efectivo/transferencia que el admin registra, chips de pago y Balance del día se mantienen. El operador cobra y cuadra caja; solo se le oculta el precio de referencia.

4. **Pre-llenado del efectivo en 0 cuando el flag está activo.** Evita filtrar la tarifa por el valor pre-rellenado del input. El admin escribe lo efectivamente cobrado.

5. **El precio se sigue calculando y guardando.** El flag es de presentación; no altera precios, pagos, balance ni analítica (que ve el super admin).
