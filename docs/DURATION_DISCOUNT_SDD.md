# Feature: Tarifas por Duración de Reserva

## 📋 Specification-Driven Development (SDD)

Permite al admin configurar tarifas por umbral de duración en cada `VenueFormat`, expresadas como porcentaje de descuento **o** como precio flat (override total). Aplica tanto para bookings de jugador como para reservas manuales.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Algunos deportes/sedes ofrecen tarifas decrecientes según la duración (jugar 2h cuesta menos por hora que 1h). El modelo actual asume precio fijo por slot, así que reservar 2h = `2 × precio_1h` sin descuento. Esta feature permite definir tarifas por umbral de duración a nivel `VenueFormat`, expresables como **porcentaje** ("≥2h → 10% off") o como **precio flat** ("≥2h → $140.000 total").

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Cada `VenueFormat` puede tener 0..N tiers. Cada tier es `{ minMinutes, percentOff }` o `{ minMinutes, flatPriceCOP }` — **exactamente uno** de los dos | Toggle `[%]/[$]` por tier en el editor |
| 2 | Se aplica el tier con mayor `minMinutes` cuya condición se cumple (`duración ≥ minMinutes`) | Una sola fila de descuento en el resumen |
| 3 | Tier con `percentOff`: descuenta sobre el precio total calculado por suma de slots. Tier con `flatPriceCOP`: el total queda en `flatPriceCOP` (override completo de la suma de slots) | El subtotal muestra la suma de slots; la diferencia se muestra como una línea de descuento |
| 4 | `minMinutes` debe ser entero entre 1 y 1440. `percentOff` debe ser número entre 0.01 y 99.99 (hasta 2 decimales). `flatPriceCOP` debe ser entero ≥ 0 en centavos | Validación en `validateVenueFormat` |
| 5 | Tiers se ordenan por `minMinutes` ascendente al guardar (orden canónico). No pueden haber dos tiers con el mismo `minMinutes` | Lista renderizada en orden creciente |
| 6 | Si el `VenueFormat` no existe (booking legacy con `format: "5v5"`) o no tiene `durationTiers`, no se aplica nada | Comportamiento idéntico al actual |
| 7 | El precio final se guarda como snapshot en `Booking.totalPriceCOP` y en `BlockedSlot.priceCOP`. Cambiar el tier posteriormente NO modifica reservas históricas | Reservas viejas conservan su precio original |
| 8 | El depósito se calcula sobre el precio **final** (tras aplicar el tier) | El monto a pagar online refleja la tarifa real |
| 9 | Si la reserva tiene duración exactamente igual a `minMinutes` del tier, aplica (comparación inclusive `≥`) | — |
| 10 | Si `flatPriceCOP` resulta MAYOR que el subtotal por slots (admin se equivocó), igual se respeta el valor — el admin es responsable de la coherencia | Warning visual en el editor si `flatPriceCOP > subtotal_proyectado_a_1h_típica` (opcional, ver UI) |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Tiers por `VenueFormat`: típicamente 0–3 (ej. ninguno, "≥2h: -10%", o "≥2h: -10% + ≥3h: -20%").
- Embedded en `VenueFormat`, que ya vive en `Venue.formats`. Sin nuevas colecciones ni queries.

### Índices Firestore requeridos
Ninguno nuevo.

### Paginación
No aplica.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- `createBooking` (Cloud Function) ya usa transacción para asignar canchas y bloquear ocupación. Solo agregamos un paso de cálculo de descuento dentro de la misma transacción — lee `venue.formats[selectedFormat].durationDiscounts` y aplica al `totalPriceCOP` antes de escribir.
- `registerManualReservationPayment` y `createBlockedSlot` (admin) ya calculan precio en cliente y lo persisten como snapshot. Aplicar descuento allí también.

### Race conditions identificadas

| Escenario | Mitigación |
|-----------|-----------|
| Admin edita `durationDiscounts` mientras un jugador confirma una reserva | El Cloud Function lee `venue` dentro de la transacción → usa la versión vigente en ese momento. El precio queda snapshot en el booking |
| Admin elimina un tier después de que se aplicó a un booking | El booking ya tiene `totalPriceCOP` como snapshot — no se recalcula |

---

## 4. SEGURIDAD

### Autenticación y autorización
- `durationDiscounts` es un sub-campo de `Venue.formats`, vive dentro del doc `venues/{venueId}`. Las rules existentes (super_admin / location_admin asignado) ya lo cubren.

### Firestore Rules requeridas
Ninguna nueva. Si hay validación por campos en `firestore.rules`, asegurarse de que `formats` siga en la whitelist editable (ya lo está post multi-sport SDD).

### Validaciones de input
En `validateVenueFormat` (extender):
```typescript
if (f.durationTiers) {
    const mins = new Set<number>();
    for (const t of f.durationTiers) {
        if (!Number.isInteger(t.minMinutes) || t.minMinutes <= 0 || t.minMinutes > 1440) {
            throw new ValidationError("minMinutes debe ser entero entre 1 y 1440");
        }
        if (mins.has(t.minMinutes)) {
            throw new ValidationError(`minMinutes duplicado: ${t.minMinutes}`);
        }
        mins.add(t.minMinutes);

        const hasPercent = typeof t.percentOff === "number";
        const hasFlat = typeof t.flatPriceCOP === "number";
        if (hasPercent === hasFlat) {
            throw new ValidationError(
                "Cada tier debe tener exactamente uno de percentOff o flatPriceCOP",
            );
        }
        if (hasPercent) {
            if (t.percentOff! < 0.01 || t.percentOff! > 99.99) {
                throw new ValidationError("percentOff debe estar entre 0.01 y 99.99");
            }
            // Limita a 2 decimales
            if (Math.round(t.percentOff! * 100) / 100 !== t.percentOff) {
                throw new ValidationError("percentOff admite máximo 2 decimales");
            }
        } else {
            if (!Number.isInteger(t.flatPriceCOP) || t.flatPriceCOP! < 0) {
                throw new ValidationError("flatPriceCOP debe ser entero ≥ 0 en centavos");
            }
        }
    }
}
```

Server-side (Cloud Function): re-aplica la misma validación al leer el descuento aplicable. **Nunca confiar en lo que envía el cliente** — el server recomputa precio.

### Datos sensibles
Ninguno.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `venue.formats` sin el formato del booking (legacy `"5v5"`) | Sede legacy o booking histórico | Sin descuento. Precio igual que hoy |
| `durationDiscounts` es `undefined` o `[]` | Format sin tiers configurados | Sin descuento. No se muestra línea de descuento |
| Cliente envía `totalPriceCOP` ya descontado | (intento de manipulación) | El server recalcula desde cero — descarta el valor del cliente |
| Tier removido o modificado entre selección y confirmación | Admin editó mientras jugador confirmaba | El server usa la versión vigente al momento de la transacción. Si el tier desapareció, el total puede ser distinto al que vio el jugador. Mostrar toast "El precio se actualizó" + recargar |
| Admin configura `flatPriceCOP` mayor al subtotal por slots | Error humano | Se respeta el valor (regla #10). El admin ve un warning visual al guardar |

### Retry strategy
- Misma del flujo de booking: `createBooking` httpsCallable con retry manual del usuario en caso de error.

### Degradación elegante
Si por alguna razón el cálculo del descuento falla, fallback a precio sin descuento (no bloquea la reserva).

---

## 6. UX — FLUJOS DE USUARIO

### Flujo admin — configurar tarifa por duración

1. Admin entra a `/venues/admin/[id]` → tab "Canchas"
2. En la card de un `VenueFormat` (ej. "Volley 6v6"), tap en "Tarifas por duración" (sección colapsable)
3. Lista vacía + botón "Agregar tarifa"
4. Tap → aparece una fila: `[minutos input: 120] [toggle %|$] [valor: 22.22 / 14000000] [trash]`
   - Toggle determina si el valor es `percentOff` o `flatPriceCOP`
   - Al cambiar el toggle el campo se limpia
5. Edita los valores, validación en vivo (rojo si fuera de rango)
6. Puede agregar más tiers (ej. 180min → $200k flat)
7. Tap "Guardar cambios" del header → persiste en `venue.formats`

### Flujo jugador — reservar con tarifa especial

1. Jugador elige formato + fecha + slot de inicio
2. Extiende el slot a 2 horas (usando el slider/multi-select de slots consecutivos)
3. El subtotal se actualiza en vivo. Ejemplo volley con tier flat `≥120min: $140.000`:
   - `Subtotal (2 × $90.000) = $180.000`
   - `Tarifa 2h+: -$40.000`
   - `Total = $140.000`
4. Al confirmar, el `BookingConfirmSheet` muestra la misma desagregación
5. Tras confirmar, el server recalcula y persiste `totalPriceCOP: 14000000` (con tarifa ya aplicada)

### Flujo admin — reserva manual con descuento

1. Admin crea una reserva manual de 2h
2. El form `BlockedSlotForm` calcula precio igual que hoy, llamando `calculateManualReservationPrice()`, que ahora aplica el descuento si aplica
3. Se muestra la misma desagregación en el resumen del form

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Sin tiers configurados | La sección "Tarifas por duración" muestra estado vacío con CTA "Agregar tarifa" |
| Tier inválido | Borde rojo en el input fuera de rango, deshabilita guardar |
| `flatPriceCOP` mayor al subtotal proyectado (warning blando) | Banner ámbar "Esta tarifa flat es mayor a Nx el precio de 1h. ¿Es correcto?" — no bloquea guardar |
| Booking que califica con `%` | Línea "Tarifa Xh+: -$Z (-Y%)" en `BookingConfirmSheet` y resumen de manual |
| Booking que califica con flat | Línea "Tarifa Xh+: -$Z" (la diferencia entre subtotal y flat) en `BookingConfirmSheet` |
| Booking que no califica | Sin línea adicional (no se muestra ningún tier) |

### Consideraciones mobile-first
- Inputs numéricos con `text-base` (16px) para evitar zoom iOS
- Touch target ≥44px para los `[trash]`
- Sección "Descuentos por duración" colapsada por default para no agregar ruido a `VenueFormatEditor`

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- `DurationTiersEditor` (`components/booking/DurationTiersEditor.tsx`) — sub-componente reutilizable usado dentro de cada card de `VenueFormat`. Props: `{ tiers, onChange, slotBasePriceHint? }`. El hint se usa para mostrar el warning visual del flat mayor al razonable.

### Cambios en componentes existentes
- `VenueFormatEditor` — agrega sub-sección colapsable "Tarifas por duración" dentro de cada item de la lista
- `BookingConfirmSheet` — agrega línea de tarifa especial si aplica
- `BlockedSlotForm` — agrega línea de tarifa especial en el resumen del precio
- `app/venues/[id]/page.tsx` — calcula y muestra precio final en el resumen de reserva

### Animaciones (Framer Motion)
- `AnimatePresence` en la lista de tiers para entrada/salida
- Layout animation cuando se expande/colapsa la sección

### Responsive
- Mobile: tiers en stack vertical
- Desktop (md+): tiers en fila horizontal `[input min] [input %] [trash]`

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_format_tier_added` | Admin agrega un tier | `venue_id`, `format_id`, `min_minutes`, `tier_type: "percent" \| "flat"`, `value` (percent o flat) |
| `venue_format_tier_removed` | Admin elimina un tier | `venue_id`, `format_id`, `min_minutes`, `tier_type`, `value` |
| `booking_created` (extender) | Booking confirmado | + `tier_applied: boolean`, `tier_type?: "percent" \| "flat"`, `tier_min_minutes?: number`, `tier_value?: number`, `tier_discount_cop?: number` (subtotal − final) |
| `manual_reservation_created` (extender) | Reserva manual creada | + mismos campos que `booking_created` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/venue.ts — extender VenueFormat

/**
 * Tier de tarifa por duración. EXACTAMENTE UNO de los dos valores está presente
 * (mutually exclusive). El otro debe ser undefined.
 */
export type VenueFormatDurationTier =
    | {
        minMinutes: number;     // umbral inclusive (≥), entero 1–1440
        percentOff: number;     // 0.01–99.99 (máx 2 decimales)
        flatPriceCOP?: undefined;
    }
    | {
        minMinutes: number;
        percentOff?: undefined;
        flatPriceCOP: number;   // entero ≥ 0 en centavos COP
    };

export interface VenueFormat {
    id: string;
    sport: SportType;
    label: string;
    playersPerTeam: number;
    durationTiers?: VenueFormatDurationTier[];  // ← nuevo, opcional
}
```

### Capa de dominio (`lib/domain/`)

**`lib/domain/venue.ts`** — agregar helpers puros:

```typescript
/**
 * Devuelve el tier aplicable a una duración dada.
 * Es el tier con mayor minMinutes cuyo umbral se cumple. Si ninguno aplica, devuelve null.
 */
export function findApplicableTier(
    durationMinutes: number,
    tiers?: VenueFormatDurationTier[],
): VenueFormatDurationTier | null {
    if (!tiers || tiers.length === 0) return null;
    const eligible = tiers.filter((t) => durationMinutes >= t.minMinutes);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, t) => (t.minMinutes > best.minMinutes ? t : best));
}

/**
 * Aplica el tier (percent o flat) y devuelve la desagregación.
 * El `discountCOP` siempre se calcula como `subtotal − final` para unificar el display,
 * sin importar si el tier fue percent o flat.
 */
export function applyDurationTier(
    subtotalCOP: number,
    durationMinutes: number,
    tiers?: VenueFormatDurationTier[],
): {
    subtotalCOP: number;
    discountCOP: number;
    finalCOP: number;
    appliedTier: VenueFormatDurationTier | null;
} {
    const tier = findApplicableTier(durationMinutes, tiers);
    if (!tier) {
        return { subtotalCOP, discountCOP: 0, finalCOP: subtotalCOP, appliedTier: null };
    }
    let finalCOP: number;
    if (tier.percentOff !== undefined) {
        const reduction = Math.round(subtotalCOP * tier.percentOff / 100);
        finalCOP = subtotalCOP - reduction;
    } else {
        finalCOP = tier.flatPriceCOP;
    }
    return {
        subtotalCOP,
        discountCOP: subtotalCOP - finalCOP,
        finalCOP,
        appliedTier: tier,
    };
}
```

Extender `validateVenueFormat` con la validación de tiers descrita en sección 4.

**`lib/domain/manual-reservation-pricing.ts`** — aplicar tier al final del cálculo:

```typescript
export function calculateManualReservationPrice(
    schedule: DaySchedule | null,
    format: string | null,
    startTime: string,
    endTime: string,
    venueFormats?: VenueFormat[],   // ← nuevo parámetro opcional
): number {
    // ...lógica existente que computa `total` por suma de slots...

    if (!venueFormats || !format) return total;
    const vf = venueFormats.find((f) => f.id === format);
    const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
    const { finalCOP } = applyDurationTier(total, durationMinutes, vf?.durationTiers);
    return finalCOP;
}
```

Para mostrar la desagregación en el form (no solo el total final), exponer también la variante:

```typescript
export function calculateManualReservationPriceBreakdown(
    schedule: DaySchedule | null,
    format: string | null,
    startTime: string,
    endTime: string,
    venueFormats?: VenueFormat[],
): { subtotalCOP: number; discountCOP: number; finalCOP: number; appliedTier: VenueFormatDurationTier | null } {
    // ...idéntica al anterior pero devolviendo la desagregación completa
}
```

### Capa de API (`lib/venues.ts`, `lib/bookings.ts`)
Sin cambios — el shape de `VenueFormat` ya soporta el campo opcional. `updateVenueSettings` ya guarda `formats` completo.

### Cloud Functions (`functions/src/bookings.ts`)
En `createBooking`, después de calcular `subtotalCOP = pricePerSlotCOP * slotCount`:

```typescript
const vf = venue.formats?.find((f) => f.id === format);
const durationMinutes = slotCount * slotDurationMinutes;
const { finalCOP, discountCOP, appliedTier } = applyDurationTier(
    subtotalCOP, durationMinutes, vf?.durationTiers
);
const totalPriceCOP = finalCOP;

// Persistir snapshot del tier aplicado (si hubo) para auditoría
const tierApplied = appliedTier
    ? {
        minMinutes: appliedTier.minMinutes,
        ...(appliedTier.percentOff !== undefined
            ? { percentOff: appliedTier.percentOff }
            : { flatPriceCOP: appliedTier.flatPriceCOP }),
        discountCOP,  // subtotal − final, siempre presente
    }
    : null;
```

`Booking.totalPriceCOP` queda con el precio final (post tier). Snapshot opcional:

```typescript
export interface Booking {
    // ...
    tierApplied?: {
        minMinutes: number;
        percentOff?: number;
        flatPriceCOP?: number;
        discountCOP: number;
    };
}
```

**El depósito se calcula sobre `totalPriceCOP` (precio final, ya con tier aplicado)**, como hoy. No requiere cambio en la lógica del depósito.

### Componentes UI (`components/booking/`, `app/`)

| Componente / Página | Cambio |
|--------------------|--------|
| `components/booking/DurationTiersEditor.tsx` | **Nuevo**. Lista de tiers con toggle `[%]/[$]` por tier, agregar/eliminar |
| `components/booking/VenueFormatEditor.tsx` | Renderiza `DurationTiersEditor` dentro de cada card de format |
| `app/venues/[id]/page.tsx` | Computa el precio final usando `applyDurationTier`. Pasa la desagregación a `BookingConfirmSheet` |
| `components/booking/BookingConfirmSheet.tsx` | Acepta `subtotalCOP?`, `discountCOP?`, `appliedTier?`. Muestra línea adicional si aplica |
| `components/booking/BlockedSlotForm.tsx` | El cálculo de precio en vivo usa `calculateManualReservationPriceBreakdown`. Muestra desagregación |
| `lib/bookings.ts` (client) | `Booking` type incluye `tierApplied?` |
| `app/bookings/[id]/page.tsx` | Muestra el desglose subtotal/tier/total si `booking.tierApplied` existe |

---

## 10. ESTRATEGIA DE MIGRACIÓN

### Backward compatibility
- `durationDiscounts` es opcional. Sedes/formats existentes sin el campo se comportan idénticamente al estado actual.
- Bookings históricos sin `discountApplied` siguen mostrándose con su `totalPriceCOP` tal cual (no se intenta recalcular).

### Período de coexistencia
No aplica — la feature es aditiva.

---

## 11. CRITERIOS DE ACEPTACIÓN

- [ ] Admin puede agregar/editar/eliminar tiers desde `VenueFormatEditor`, eligiendo `%` o `$` por tier
- [ ] Validación: `minMinutes` entero 1–1440, sin duplicados; `percentOff` 0.01–99.99 con máx 2 decimales; `flatPriceCOP` entero ≥ 0; exactamente uno de los dos por tier
- [ ] Selección de 2h en `/venues/[id]` con tier flat "≥120min: $140.000" muestra: subtotal $180k, "Tarifa 2h+: −$40k", total $140k
- [ ] Selección de 2h con tier "≥120min: 22.22%" muestra: subtotal $180k, "Tarifa 2h+ (−22.22%): −$40k", total $140k
- [ ] Tras confirmar, `Booking.totalPriceCOP` queda con el precio final y `Booking.tierApplied` con el snapshot del tier
- [ ] El depósito se calcula sobre el precio final (con tier aplicado), no sobre el subtotal
- [ ] Reserva manual de 2h aplica el mismo tier en el resumen del form
- [ ] Sede sin `durationTiers` se comporta igual que hoy (sin línea adicional, sin diferencia de precio)
- [ ] El server (Cloud Function) recomputa el precio con tier y descarta cualquier valor del cliente
- [ ] Reserva con duración exactamente igual a `minMinutes` aplica el tier (boundary inclusive)
- [ ] `findApplicableTier` con múltiples tiers elige el de mayor `minMinutes` que cumple
- [ ] Booking detail (`/bookings/[id]`) muestra el desglose si tiene `tierApplied`
- [ ] Warning visual en el editor cuando `flatPriceCOP` > subtotal proyectado (no bloquea guardar)

---

## 12. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Agregar `VenueFormatDurationTier`, extender `VenueFormat`, agregar `findApplicableTier`, `applyDurationTier`, extender `validateVenueFormat` |
| `lib/domain/manual-reservation-pricing.ts` | Aceptar `venueFormats?` y aplicar tier al total; exponer `calculateManualReservationPriceBreakdown` |
| `lib/domain/booking.ts` | Agregar `tierApplied?` a `Booking` |
| `functions/src/bookings.ts` | Aplicar tier server-side en `createBooking`; persistir `tierApplied` |
| `components/booking/DurationTiersEditor.tsx` | **Nuevo** |
| `components/booking/VenueFormatEditor.tsx` | Integrar `DurationTiersEditor` por format |
| `components/booking/BookingConfirmSheet.tsx` | Mostrar línea de tarifa si aplica |
| `components/booking/BlockedSlotForm.tsx` | Mostrar desagregación en el resumen |
| `app/venues/[id]/page.tsx` | Computar desagregación y pasarla a `BookingConfirmSheet` |
| `app/bookings/[id]/page.tsx` | Mostrar desglose si `booking.tierApplied` |
| `lib/analytics.ts` | Nuevos eventos `venue_format_tier_added/removed`; extender `booking_created` |

---

## ⚠️ Decisiones de Diseño Clave

### 1. Tier a nivel `VenueFormat`, no por slot

**Decisión**: el tier vive en `VenueFormat.durationTiers`, no en `FormatPricing` del schedule.

**Pros**:
- Una sola fuente de verdad — el admin configura la política una vez por formato, aplica a todos los slots
- Modelo simple, sin duplicar tiers en N slots
- Encaja bien con el soporte multi-deporte: cada deporte/formato tiene su propia política

**Contras**:
- No permite tiers por franja horaria (ej. "tarifa especial 2h solo de noche"). Si más adelante se necesita, se puede agregar tiers también a nivel `FormatPricing` como override.

### 2. Modelo discriminated union: `percentOff` XOR `flatPriceCOP`

**Decisión**: cada tier expresa **exactamente uno** de los dos campos. Type discriminado en TypeScript, validación runtime en `validateVenueFormat`.

**Por qué**: distintos deportes/sedes tienen mental models distintos. Para volley el admin piensa "2h = 140k flat". Para padel quizás piensa "10% off ≥2h". El union deja que cada tier exprese lo que es natural en cada caso, sin doble fuente de verdad por tier.

**Trade-off operacional documentado**: si un admin usa flat en un formato cuyos slots varían de precio (ej. fútbol con franjas diurna/nocturna distintas), una reserva que mezcle franjas paga el flat sin importar la mezcla. Para volley con pricing uniforme (caso de uso original) no hay problema. Es decisión del admin entender esto.

**Alternativa rechazada**: solo `percentOff` con decimales (ej. 22.22%). Más simple pero el admin tiene que computar el % a partir del flat deseado, lo cual rompe el mental model para deportes flat.

### 3. La feature es aditiva (no rompe nada)

**Decisión**: `durationTiers?: VenueFormatDurationTier[]` es opcional. Sin migración.

Sedes existentes operan idénticamente. La feature se activa solo cuando un admin agrega tiers.

### 4. El precio en `Booking.totalPriceCOP` es el precio FINAL

**Decisión**: `Booking.totalPriceCOP` ya viene con el tier aplicado. El campo `tierApplied?` es snapshot informativo para auditoría/UI.

**Por qué**: simplifica los reportes financieros (balance, totales del día) — `totalPriceCOP` siempre representa lo que el cliente paga. El depósito se calcula sobre ese mismo valor.

**Alternativa rechazada**: guardar `subtotalCOP` y `discountCOP` por separado y calcular `totalPriceCOP` en el cliente. Más expresivo pero requiere cambiar consumers que asumen "totalPriceCOP es lo cobrado".

### 5. El server (Cloud Function) recomputa siempre

**Decisión**: aunque el cliente calcula y muestra el precio final, el server NUNCA confía en ese valor. Recomputa desde cero usando `applyDurationTier` dentro de la transacción.

**Por qué**: seguridad básica — el cliente puede ser manipulado. Misma filosofía que el cálculo de precio base actual.

### 6. Tier inclusive (`≥`) en `minMinutes`

**Decisión**: una reserva de exactamente `minMinutes` minutos califica para el tier.

**Por qué**: expectativa intuitiva del admin — si configura "≥120min: 10%", una reserva de 120min debería aplicar.

### 7. `discountCOP` siempre se computa como `subtotal − final`

**Decisión**: independientemente de si el tier fue percent o flat, la métrica `discountCOP` se calcula como `subtotalCOP − finalCOP`. Unifica el display y los analytics.

**Por qué**: el usuario no necesita saber si el "ahorro" vino de un % o de un flat. Tampoco los reportes. La métrica unificada simplifica todo downstream.
