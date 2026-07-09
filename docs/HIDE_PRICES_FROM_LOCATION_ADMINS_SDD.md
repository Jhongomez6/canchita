# Feature: Ocultar precios a administradores de sede (configurable por sede)

## 📋 Specification-Driven Development (SDD)

Permitir que el super admin active, por sede, el ocultamiento del **precio de cancha** en el panel de administración de sede, de modo que **ningún location admin (owner ni staff)** vea montos de reservas/slots — solo el super admin.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
El dueño de una sede a veces no quiere que los precios de las canchas sean visibles en el panel operativo — ni para sus trabajadores (staff) ni para quien opere como location admin. Hoy el panel de sede muestra el precio de cada reserva/slot a todo location admin. Se introduce un **flag por sede** (`hidePricesForLocationAdmins`) que, cuando está activo, oculta el precio de la cancha en el panel para **todos los location admin (owner + staff)**. El **super admin siempre ve los precios** (es quien configura el flag y necesita la vista completa).

Decisiones de alcance ya tomadas con el usuario:
- **A quién se oculta:** a *todos* los location admin (owner **y** staff), no solo staff. Al super admin nunca se le oculta.
- **Quién configura:** *solo super admin*, con un toggle por sede (consistente con `paymentMethods`, que también es super-admin-only a nivel de campo).
- **Qué se oculta:** únicamente el **precio en reservas/slots** (precio de cancha). **No** se ocultan el **Balance del día** ni el **Registrar pago** — decisión explícita del usuario.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | `hidePricesForLocationAdmins` es `boolean`; **default `false`** cuando el campo está ausente (retrocompat: toda sede existente sigue mostrando precios). | Ninguna sede actual cambia de comportamiento al desplegar. |
| 2 | Solo `super_admin` puede leer/escribir el flag (server-enforced por Firestore Rules, field-level, igual que `paymentMethods`). | Toggle nuevo en el tab "Sede" (info) del panel, visible solo a super admin. |
| 3 | Cuando el flag está `true` **y** el usuario actual **no es super admin**, se ocultan los precios de cancha en todas las vistas de reservas/slots del panel. | `hidePrice` derivado se propaga a los componentes de card/form. |
| 4 | El **super admin siempre ve precios**, aunque el flag esté `true`. | El flag solo afecta el render para location admins. |
| 5 | Se ocultan: precio de reserva manual (`AdminBlockCard`), precio total + depósito/resto de reserva online (`AdminBookingCard`), desglose de precio al crear reserva manual (`BlockedSlotForm`). El slot picker (`AdminSlotPicker`/`SlotList`/`FormatSelector`) **ya oculta precio** hoy vía `hidePrice` — sin cambio. | Filas/bloques de precio no se renderizan (o muestran guion) para location admins. |
| 6 | **NO** se ocultan: chips de pago registrado (efectivo/transferencia) en las cards, tab **Balance del día**, sheet **Registrar pago**. | Estas vistas quedan intactas para location admins (necesitan cuadrar caja y registrar pagos). |
| 7 | El precio se sigue **calculando y guardando** normalmente al crear reservas manuales; el flag es puramente de **presentación**. | `BlockedSlotForm` computa `priceCOP` como hoy; solo omite mostrarlo. |
| 8 | La página pública de sede (`/venues/[id]`, cara al jugador) **no se ve afectada**: el jugador debe ver precios para reservar. | Sin cambios en el flujo de reserva del jugador. |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Universo pequeño: `< 100` sedes a mediano plazo. El flag es un `boolean` en el doc `venues/{venueId}` ya existente → **cero colecciones nuevas, cero documentos nuevos**.

### Índices Firestore requeridos
- **Ninguno.** No hay queries nuevas; el flag se lee del doc de la sede ya cargado en `loadData()`.

### Paginación
- No aplica. No hay listas nuevas.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Ninguna nueva.** Setear el flag es una escritura de un solo campo sobre `venues/{venueId}` hecha por un super admin desde el panel (via `updateVenueSettings`, `updateDoc` puntual). No es estado compartido concurrente.

### Race conditions identificadas
| Escenario | Riesgo | Mitigación |
|-----------|--------|------------|
| Super admin cambia el flag mientras un location admin tiene el panel abierto | El location admin podría seguir viendo/ocultando precios hasta recargar | El flag se lee en `loadData()` (una vez por carga). El gate de UI es "defensa de presentación", no un candado de datos; el cambio es raro y administrativo. Aceptable. |

---

## 4. SEGURIDAD

### Autenticación y autorización
- **Escritura del flag:** solo `super_admin` (server-enforced por Firestore Rules, field-level).
- **Lectura:** el campo viaja en el doc `venues/{venueId}`, ya legible por cualquier autenticado (`allow read: if request.auth != null`). No es dato sensible en sí (es una preferencia de UI).

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

Con esto: un location admin (owner o staff) que intente desactivar el flag editando el doc de la sede es **rechazado por reglas**; solo super admin lo modifica.

### Validaciones de input
- El flag es `boolean`. `updateVenueSettings` lo pasa tal cual (no requiere validador dedicado; TypeScript acota el tipo).

### Datos sensibles
- **Nota honesta de límite de seguridad:** el ocultamiento es **UI-level (autorización de presentación), no un límite de datos.** El doc de la sede y las reservas (`bookings`, `blockedSlots`) siguen siendo legibles por el location admin asignado según las reglas actuales; el `priceCOP` viaja en esos docs. Un location admin con conocimiento técnico podría leerlo vía SDK. Para el caso de negocio (que el precio **no aparezca en la app** al operador) el gate de UI es suficiente. Cerrarlo a nivel de datos requeriría particionar lecturas por rol tras Cloud Functions — rediseño mayor, **fuera de alcance**.
- **Fuga parcial aceptada (confirmada por el usuario):** como el Balance del día y los chips de pago registrado (efectivo/transferencia) **quedan visibles**, un location admin puede inferir el monto de una reserva ya pagada. Es una decisión explícita: el operador necesita cuadrar caja. El flag oculta el **precio de tarifa de cancha**, no el flujo de caja.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `hidePricesForLocationAdmins` ausente/undefined | Sede pre-feature | Se trata como `false` → se muestran precios (comportamiento actual). Sin degradación. |
| `venue` aún no cargado (loading) | Sin red / carga en curso | El panel ya bloquea render con skeleton hasta tener `venue`. El flag se resuelve junto con el resto de la sede. |
| Update del flag rechazado por reglas (no super admin) | Actor sin permiso | `handleError()` muestra toast con detalle técnico; el toggle revierte al valor previo. En la práctica el toggle solo lo ve el super admin (tab "Sede" es super-admin-only). |

### Retry strategy
- El update es idempotente; el super admin reintenta tras un toast de error. Sin retry automático (acción administrativa manual).

### Degradación elegante
- Si el flag no resuelve (sede no cargada), no se renderiza el panel todavía; una vez cargado, default seguro `false` (mostrar precios) — nunca oculta por error de carga.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal A — Super admin activa el ocultamiento (happy path)
1. Super admin entra a `/venues/admin/[id]` → tab **"Sede"** (info).
2. Ve el toggle nuevo **"Ocultar precios a administradores de sede"** con subtítulo explicativo.
3. Lo activa → `markDirty()` → **Guardar cambios** → `updateVenueSettings` persiste `hidePricesForLocationAdmins: true` → toast `success` "Cambios guardados".

### Flujo principal B — Location admin opera con precios ocultos
1. Owner o staff abre `/venues/admin/[id]` de una sede con el flag activo.
2. En **Reservas → Por hora / Calendario**: las cards de reservas (online y manuales) **no muestran precio de cancha**; sí muestran cliente, horario, cancha, estado y chips de pago registrado.
3. Al **crear una reserva manual**: el formulario **no muestra el desglose de precio**; la reserva se crea igual (el precio se guarda internamente).
4. **Balance del día** y **Registrar pago** funcionan normal (montos visibles).

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Flag off (default) | Precios visibles para todos (comportamiento actual). |
| Flag on + super admin | Precios visibles (super admin nunca se ve afectado). |
| Flag on + location admin | Precio de cancha oculto en cards/form; resto igual. |
| Cargando | Skeleton actual del panel (sin cambios). |
| Éxito (toggle) | Toast `success` + toggle refleja el nuevo valor tras guardar. |

### Consideraciones mobile-first
- El toggle reusa el patrón visual del toggle "Sede activa" existente en el tab info (mismo tamaño/touch target).
- Respetar `pb-24 md:pb-0` ya presente.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- **Ninguno nuevo.** Se extiende una prop booleana `hidePrice` en componentes existentes:
  - `AdminBlockCard` → nueva prop `hidePrice?: boolean` (default `false`). Oculta la fila "Precio" (`block.priceCOP`); conserva badges de Cumpleaños/Mensualidad (no son precio) y chips de pago.
  - `AdminBookingCard` → nueva prop `hidePrice?: boolean`. Oculta `totalPriceCOP` y el `DepositSummary`; conserva chips de pago.
  - `BlockedSlotForm` → nueva prop `hidePrice?: boolean`. Oculta el bloque de desglose de precio (subtotal/descuento/total).
  - `HourDetailDrawer` y `AdminBookingCalendar` → nueva prop `hidePrice?: boolean` que reenvían a las cards que renderizan.
- El toggle en el tab "Sede" es markup inline (patrón del toggle "Sede activa"), sin componente nuevo.

### Animaciones (Framer Motion)
- Sin animaciones nuevas. El toggle usa la misma transición CSS del toggle existente.

### Responsive
- Toggle full-width bajo "Sede activa" en el tab info; sin cambios de layout.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_hide_prices_toggled` | Super admin guarda un cambio del flag | `venue_id`, `hidden` (`true`/`false`) |

> P4 (Platform/admin ops), `snake_case`. Opcional pero recomendado para medir adopción. Se dispara en `handleSave` solo si el valor del flag cambió respecto al cargado.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
```typescript
// lib/domain/venue.ts — interface Venue
export interface Venue {
  // ...campos existentes...
  /** Si true, oculta el precio de cancha a los location admin (owner+staff) en el panel.
   *  Solo super admin lo edita. Ausente ⇒ false (precios visibles). */
  hidePricesForLocationAdmins?: boolean;
}
```

### Capa de dominio (`lib/domain/venue.ts`)
- **Sin función nueva obligatoria.** El derivado es trivial y vive en la UI:
  `const hidePrices = !!venue.hidePricesForLocationAdmins && !isSuper;`
- (Opcional) helper puro para testear el gate:
  ```typescript
  export function shouldHidePricesFor(venue: Venue, isSuper: boolean): boolean {
    return !!venue.hidePricesForLocationAdmins && !isSuper;
  }
  ```

### Capa de API (`lib/venues.ts`)
- `updateVenueSettings`: agregar `"hidePricesForLocationAdmins"` al `Partial<Pick<Venue, ...>>` del parámetro `data` (línea ~227). No requiere lógica extra: se pasa en el spread.

### Componentes UI (`app/`)
- [app/venues/admin/[id]/page.tsx](../app/venues/admin/[id]/page.tsx):
  - Estado nuevo `hidePricesFromAdmins` (bool) inicializado en `loadData()` desde `v.hidePricesForLocationAdmins ?? false`.
  - Toggle en el tab "info" (bajo "Sede activa"), solo llega el super admin (tab super-admin-only).
  - Incluir `hidePricesForLocationAdmins: hidePricesFromAdmins` en `settingsPayload` de `handleSave`.
  - Derivar `const hidePrices = !!venue.hidePricesForLocationAdmins && !isSuper;` (usar el valor persistido de `venue`, no el estado editable, para que el gate refleje lo guardado).
  - Pasar `hidePrice={hidePrices}` a `HourDetailDrawer`, `AdminBookingCalendar` y `BlockedSlotForm`.
  - Disparar `venue_hide_prices_toggled` en `handleSave` si cambió.
- [components/booking/HourDetailDrawer.tsx](../components/booking/HourDetailDrawer.tsx): prop `hidePrice`; reenviar a `AdminBookingCard` y `AdminBlockCard`.
- [components/booking/AdminBookingCalendar.tsx](../components/booking/AdminBookingCalendar.tsx): prop `hidePrice`; reenviar a las cards (líneas ~323 y ~339).
- [components/booking/AdminBlockCard.tsx](../components/booking/AdminBlockCard.tsx): prop `hidePrice`; envolver la fila "Precio" (líneas ~235-257) para no renderizar el monto cuando `hidePrice` (mantener badges de cumpleaños/mensualidad).
- [components/booking/AdminBookingCard.tsx](../components/booking/AdminBookingCard.tsx): prop `hidePrice`; ocultar `totalPriceCOP` (línea ~296) y `DepositSummary` (líneas ~301-305).
- [components/booking/BlockedSlotForm.tsx](../components/booking/BlockedSlotForm.tsx): prop `hidePrice`; ocultar el bloque de desglose (líneas ~515-532). El cálculo/guardado de `priceCOP` no cambia.
- [firestore.rules](../firestore.rules): agregar `hidePricesForLocationAdmins` a la lista `hasAny([...])` del `allow update` de venues (§4).
- [lib/analytics.ts](../lib/analytics.ts): evento `venue_hide_prices_toggled`.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Una sede sin el flag sigue mostrando precios a todos (default `false`).
- [ ] Un super admin puede activar/desactivar el toggle en el tab "Sede" y persiste al guardar.
- [ ] Con el flag `true`, un **owner** no ve precio de cancha en cards de reservas ni en el form de creación.
- [ ] Con el flag `true`, un **staff** tampoco ve precios (mismo gate).
- [ ] Con el flag `true`, el **super admin sí ve precios**.
- [ ] Con el flag `true`, **Balance del día** y **Registrar pago** siguen mostrando montos.
- [ ] Con el flag `true`, crear una reserva manual funciona y guarda `priceCOP` correctamente (aunque no se muestre).
- [ ] Un location admin **no** puede modificar el flag (rechazo por Firestore Rules).
- [ ] La página pública `/venues/[id]` muestra precios al jugador sin importar el flag.
- [ ] Evento `venue_hide_prices_toggled` se dispara al cambiar el flag.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Campo `hidePricesForLocationAdmins?` en `Venue`; (opcional) helper `shouldHidePricesFor` |
| `lib/venues.ts` | Agregar el campo al `Pick` de `updateVenueSettings` |
| `app/venues/admin/[id]/page.tsx` | Estado + toggle en tab info; derivar `hidePrices`; propagar a drawer/calendar/form; analytics |
| `components/booking/HourDetailDrawer.tsx` | Prop `hidePrice`; reenvío a cards |
| `components/booking/AdminBookingCalendar.tsx` | Prop `hidePrice`; reenvío a cards |
| `components/booking/AdminBlockCard.tsx` | Prop `hidePrice`; ocultar fila de precio |
| `components/booking/AdminBookingCard.tsx` | Prop `hidePrice`; ocultar total + `DepositSummary` |
| `components/booking/BlockedSlotForm.tsx` | Prop `hidePrice`; ocultar desglose (mantener cálculo) |
| `firestore.rules` | `hidePricesForLocationAdmins` en el `hasAny([...])` field-level de venues |
| `lib/analytics.ts` | Evento `venue_hide_prices_toggled` |

---

## ⚠️ Decisiones de Diseño Clave

1. **Flag booleano por sede, super-admin-only — confirmado.** Reusa el patrón field-level de `paymentMethods` en Firestore Rules. Cero migración: default `false` = comportamiento actual.

2. **Oculta a *todos* los location admin (owner + staff), no solo staff — confirmado.** El derivado es `flag && !isSuper`, sin depender del sub-rol owner/staff. Simple y sin tocar `LocationAdminRole`.

3. **Restricción UI-level, no límite de datos — confirmado.** El `priceCOP` sigue viajando en los docs legibles por el location admin. Suficiente para el caso de negocio (no mostrarlo en la app).

4. **Balance del día y Registrar pago quedan visibles — confirmado.** Se acepta la fuga parcial (el operador puede inferir montos de reservas pagadas). El flag oculta la tarifa de cancha, no el flujo de caja.

5. **El precio se sigue calculando y guardando.** El flag es de presentación; no altera la lógica de precios ni el registro contable. Esto evita romper Balance, pagos y analítica (que sí ve el super admin).
