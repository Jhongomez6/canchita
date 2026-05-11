/**
 * Cálculo del precio total de una reserva manual a partir del schedule del venue.
 *
 * Modelo: el schedule define `ScheduleSlot[]` (rangos horarios) y cada uno tiene
 * `FormatPricing[]` (precio por formato: 5v5, 7v7, etc.). Una reserva manual ocupa
 * un rango [startTime, endTime) y un set de canchas. Para precio:
 *
 *   precio = Σ (por cada slot del schedule que se solape con [startTime, endTime))
 *              priceCOP_del_formato × (minutos solapados / minutos del slot)
 *
 * El "formato" de la reserva manual no se conoce explícitamente — la inferimos del
 * número de canchas seleccionadas (1 = sencilla → mismo formato que la cancha base
 * más común; 2 = doble; 3+ = triple). Para simplificar (y porque el admin típicamente
 * reserva una cancha entera), tomamos el formato del primer schedule slot que coincida
 * con cualquier formato disponible. Si no podemos inferir, devolvemos 0.
 *
 * Si el schedule no aplica (día deshabilitado, sin slots) → 0.
 */

import type { DaySchedule, FormatPricing, ScheduleSlot, VenueFormat } from "./venue";
import { applyDurationTier, type DurationTierBreakdown } from "./venue";

function timeToMinutes(t: string): number {
    const [h, m] = t.split(":").map((s) => parseInt(s, 10));
    return h * 60 + m;
}

function overlapMinutes(a: { start: string; end: string }, b: { start: string; end: string }): number {
    const aStart = timeToMinutes(a.start);
    const aEnd = timeToMinutes(a.end);
    const bStart = timeToMinutes(b.start);
    const bEnd = timeToMinutes(b.end);
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Calcula el subtotal de una reserva manual sumando precio prorrateado por slot.
 * NO aplica tiers de duración — usar `calculateManualReservationPrice` o
 * `calculateManualReservationPriceBreakdown` para obtener el precio final.
 */
function calculateSubtotal(
    schedule: DaySchedule | null,
    format: string | null,
    startTime: string,
    endTime: string,
): number {
    if (!schedule || !schedule.enabled || !format) return 0;
    if (!startTime || !endTime || startTime >= endTime) return 0;

    let total = 0;
    for (const slot of schedule.slots) {
        const minutes = overlapMinutes(
            { start: startTime, end: endTime },
            { start: slot.startTime, end: slot.endTime },
        );
        if (minutes === 0) continue;

        const fp = slot.formats.find((f: FormatPricing) => f.format === format);
        if (!fp) continue;

        const slotMinutes = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
        if (slotMinutes <= 0) continue;

        total += Math.round(fp.priceCOP * (minutes / slotMinutes));
    }

    return total;
}

/**
 * Calcula el precio FINAL de una reserva manual (con tier aplicado si aplica).
 *
 * @param schedule       Schedule del día (puede ser null si no existe).
 * @param format         Formato seleccionado.
 * @param startTime      Inicio en formato "HH:MM".
 * @param endTime        Fin en formato "HH:MM".
 * @param venueFormats   Catálogo multi-deporte de la sede (opcional). Si está y el formato tiene
 *                       `durationTiers`, se aplica el tier aplicable a la duración total.
 * @returns Precio final en COP, o 0 si no se puede calcular.
 */
export function calculateManualReservationPrice(
    schedule: DaySchedule | null,
    format: string | null,
    startTime: string,
    endTime: string,
    venueFormats?: VenueFormat[],
): number {
    const subtotal = calculateSubtotal(schedule, format, startTime, endTime);
    if (subtotal === 0 || !venueFormats || !format) return subtotal;

    const vf = venueFormats.find((f) => f.id === format);
    if (!vf?.durationTiers) return subtotal;

    const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
    return applyDurationTier(subtotal, durationMinutes, vf.durationTiers).finalCOP;
}

/**
 * Variante que devuelve la desagregación completa (subtotal, descuento, final, tier aplicado).
 * Útil para mostrar el desglose en el form del admin.
 */
export function calculateManualReservationPriceBreakdown(
    schedule: DaySchedule | null,
    format: string | null,
    startTime: string,
    endTime: string,
    venueFormats?: VenueFormat[],
): DurationTierBreakdown {
    const subtotal = calculateSubtotal(schedule, format, startTime, endTime);
    if (subtotal === 0 || !venueFormats || !format) {
        return { subtotalCOP: subtotal, discountCOP: 0, finalCOP: subtotal, appliedTier: null };
    }
    const vf = venueFormats.find((f) => f.id === format);
    const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
    return applyDurationTier(subtotal, durationMinutes, vf?.durationTiers);
}

/**
 * Variante que recibe directamente los slots (cuando el caller ya los tiene generados).
 */
export function calculatePriceFromSlots(
    slots: ScheduleSlot[],
    format: string | null,
    startTime: string,
    endTime: string,
): number {
    if (!format || !startTime || !endTime || startTime >= endTime) return 0;

    let total = 0;
    for (const slot of slots) {
        const minutes = overlapMinutes(
            { start: startTime, end: endTime },
            { start: slot.startTime, end: slot.endTime },
        );
        if (minutes === 0) continue;

        const fp = slot.formats.find((f) => f.format === format);
        if (!fp) continue;

        const slotMinutes = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
        if (slotMinutes <= 0) continue;

        total += Math.round(fp.priceCOP * (minutes / slotMinutes));
    }

    return total;
}
