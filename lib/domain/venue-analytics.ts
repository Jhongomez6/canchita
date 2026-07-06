/**
 * ========================
 * Venue Analytics — capa de dominio pura
 * ========================
 *
 * Specification-Driven Development (SDD)
 * See: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 *
 * Funciones puras (sin Firebase, sin React) que agregan datos ya existentes
 * (pagos, reservas, horarios) en las métricas del dashboard de analítica de sede.
 *
 * Notas de zona horaria: toda la aritmética de fechas usa el "noon trick"
 * (`T12:00:00`) en hora local, igual que el resto del codebase (`blocked-slots.ts`,
 * `date.ts`). Para el admin colombiano la hora local es America/Bogota, que no tiene
 * DST — los bordes de período quedan estables. La semana empieza el LUNES.
 */

import type {
    BlockedSlot,
    Court,
    CourtCombo,
    DaySchedule,
    DayOfWeek,
    ManualReservationPayment,
    ManualReservationStatus,
    VenueFormat,
} from "./venue";
import { getBlockedSlotStatus, formatLabel } from "./venue";
import { doesRecurrenceApplyToDate } from "./blocked-slots";

// ========================
// TIPOS
// ========================

export type AnalyticsPeriodPreset = "this_week" | "this_month" | "last_month" | "custom";

export interface AnalyticsPeriod {
    preset: AnalyticsPeriodPreset;
    start: string; // YYYY-MM-DD (inclusive)
    end: string;   // YYYY-MM-DD (inclusive)
}

export interface RevenueSummary {
    totalCOP: number;
    cashCOP: number;
    transferCOP: number;
    paymentsCount: number;
    avgTicketCOP: number;
}

export interface PeriodComparison {
    current: number;
    previous: number;
    /** null si `previous === 0` (evita divisiones por cero / "+∞%"). */
    deltaPct: number | null;
}

export interface ReservationInstance {
    reservationId: string;
    date: string; // YYYY-MM-DD (instancia expandida)
    startTime: string;
    endTime: string;
    courtIds: string[];
    status: ManualReservationStatus;
    isMonthly: boolean;
}

export interface OccupancyCell {
    dayOfWeek: number; // JS getDay(): 0=Dom .. 6=Sáb
    hour: number;      // 0-23
    reservedHours: number;
    availableHours: number;
    rate: number;      // 0..1 (capado a 1)
    open: boolean;     // false si la franja no está en el schedule
}

export interface StatusRates {
    scheduled: number;
    noShow: number;
    cancelled: number;
    noShowRate: number;       // no_show / jugables
    cancellationRate: number; // cancelled / agendadas
}

export interface BreakdownItem {
    key: string;
    label: string;
    totalCOP: number;
}

/** Rango máximo consultable (un trimestre) — acota lecturas y cómputo. */
export const MAX_RANGE_DAYS = 92;

/** Orden de días para el heatmap: lunes primero (JS getDay numbers). */
export const HEATMAP_DAY_ORDER: number[] = [1, 2, 3, 4, 5, 6, 0];

/** Etiquetas cortas por día (indexadas por JS getDay). */
export const DAY_SHORT_LABELS: Record<number, string> = {
    0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
};

/** Etiquetas completas por día (indexadas por JS getDay). */
export const DAY_FULL_LABELS: Record<number, string> = {
    0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado",
};

const DOW_TO_JS: Record<DayOfWeek, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// ========================
// HELPERS DE FECHA (hora local, semana inicia lunes)
// ========================

function parseLocalDate(dateStr: string): Date {
    return new Date(dateStr + "T12:00:00");
}

function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, n: number): string {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + n);
    return toISODate(d);
}

/** Cantidad de días en [start, end] inclusive. */
export function rangeLengthDays(start: string, end: string): number {
    const a = parseLocalDate(start).getTime();
    const b = parseLocalDate(end).getTime();
    return Math.round((b - a) / 86_400_000) + 1;
}

/** Lista todas las fechas YYYY-MM-DD del rango inclusive. */
export function datesInRange(start: string, end: string): string[] {
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
}

function mondayOf(ref: Date): Date {
    const d = new Date(ref);
    const js = d.getDay(); // 0=Dom
    const backToMonday = (js + 6) % 7; // Dom→6, Lun→0, Mar→1...
    d.setDate(d.getDate() - backToMonday);
    return d;
}

// ========================
// PERÍODOS
// ========================

/**
 * Recorta un rango personalizado a válido: start <= end y como máximo MAX_RANGE_DAYS.
 * Si excede el máximo, se conserva `start` y se recorta `end`.
 */
export function clampCustomRange(start: string, end: string): { start: string; end: string } {
    let s = start;
    let e = end;
    if (e < s) [s, e] = [e, s];
    if (rangeLengthDays(s, e) > MAX_RANGE_DAYS) {
        e = addDays(s, MAX_RANGE_DAYS - 1);
    }
    return { start: s, end: e };
}

/**
 * Resuelve start/end del período según el preset y la fecha de referencia (hoy).
 * - this_week:  lunes de esta semana → hoy
 * - this_month: día 1 del mes → hoy
 * - last_month: día 1 del mes pasado → último día del mes pasado
 * - custom:     usa `custom` recortado a MAX_RANGE_DAYS
 */
export function resolvePeriod(
    preset: AnalyticsPeriodPreset,
    ref: Date,
    custom?: { start: string; end: string },
): AnalyticsPeriod {
    const today = toISODate(ref);

    switch (preset) {
        case "this_week":
            return { preset, start: toISODate(mondayOf(ref)), end: today };

        case "this_month": {
            const first = new Date(ref.getFullYear(), ref.getMonth(), 1, 12);
            return { preset, start: toISODate(first), end: today };
        }

        case "last_month": {
            const first = new Date(ref.getFullYear(), ref.getMonth() - 1, 1, 12);
            const last = new Date(ref.getFullYear(), ref.getMonth(), 0, 12); // día 0 = último del mes anterior
            return { preset, start: toISODate(first), end: toISODate(last) };
        }

        case "custom": {
            const { start, end } = clampCustomRange(
                custom?.start ?? today,
                custom?.end ?? today,
            );
            return { preset, start, end };
        }
    }
}

/**
 * Período de comparación (calendario contra calendario según el preset):
 * - this_week:  la misma ventana corrida 7 días atrás (mismos días de la semana pasada).
 * - this_month: el mismo tramo del mes anterior (día 1 → mismo día, clamp a fin de mes).
 * - last_month: el mes calendario completo anterior al del período.
 * - custom:     ventana de igual duración inmediatamente anterior (no hay mapeo calendario).
 */
export function previousPeriodOf(period: AnalyticsPeriod): AnalyticsPeriod {
    switch (period.preset) {
        case "this_week":
            return {
                preset: period.preset,
                start: addDays(period.start, -7),
                end: addDays(period.end, -7),
            };

        case "this_month": {
            const startD = parseLocalDate(period.start);
            const endDay = parseLocalDate(period.end).getDate();
            const py = startD.getFullYear();
            const pm = startD.getMonth() - 1; // JS maneja overflow negativo (ene → dic año previo)
            const lastDayPrev = new Date(py, pm + 1, 0, 12).getDate();
            return {
                preset: period.preset,
                start: toISODate(new Date(py, pm, 1, 12)),
                end: toISODate(new Date(py, pm, Math.min(endDay, lastDayPrev), 12)),
            };
        }

        case "last_month": {
            const startD = parseLocalDate(period.start);
            const py = startD.getFullYear();
            const pm = startD.getMonth() - 1; // el mes anterior al mes del período
            return {
                preset: period.preset,
                start: toISODate(new Date(py, pm, 1, 12)),
                end: toISODate(new Date(py, pm + 1, 0, 12)), // último día de ese mes
            };
        }

        case "custom":
        default: {
            const len = rangeLengthDays(period.start, period.end);
            const prevEnd = addDays(period.start, -1);
            return { preset: period.preset, start: addDays(prevEnd, -(len - 1)), end: prevEnd };
        }
    }
}

// ========================
// COMPARATIVO
// ========================

export function compare(current: number, previous: number): PeriodComparison {
    const deltaPct = previous === 0 ? null : ((current - previous) / previous) * 100;
    return { current, previous, deltaPct };
}

// ========================
// INGRESOS (fuente: payments)
// ========================

export function computeRevenueSummary(payments: ManualReservationPayment[]): RevenueSummary {
    let cash = 0;
    let transfer = 0;
    let total = 0;
    for (const p of payments) {
        cash += p.cashCOP ?? 0;
        transfer += p.transferCOP ?? 0;
        total += p.totalCOP ?? 0;
    }
    const count = payments.length;
    return {
        totalCOP: total,
        cashCOP: cash,
        transferCOP: transfer,
        paymentsCount: count,
        avgTicketCOP: count > 0 ? Math.round(total / count) : 0,
    };
}

// ========================
// EXPANSIÓN DE RESERVAS
// ========================

/**
 * Expande reservas puntuales y recurrentes a instancias por fecha dentro del rango.
 * Reutiliza `doesRecurrenceApplyToDate` (semántica daily/weekly/biweekly/monthly del SDD).
 * Incluye TODAS las instancias con su status efectivo — los consumidores filtran
 * (ocupación excluye cancelled; las tasas necesitan cancelled/no_show).
 */
export function expandReservationInstances(slots: BlockedSlot[], period: AnalyticsPeriod): ReservationInstance[] {
    const out: ReservationInstance[] = [];
    const dates = datesInRange(period.start, period.end);

    for (const slot of slots) {
        if (!slot.recurrence) {
            if (slot.date && slot.date >= period.start && slot.date <= period.end) {
                out.push(instanceOf(slot, slot.date));
            }
            continue;
        }
        for (const d of dates) {
            if (doesRecurrenceApplyToDate(slot.recurrence, slot.exceptDates, d)) {
                out.push(instanceOf(slot, d));
            }
        }
    }
    return out;
}

function instanceOf(slot: BlockedSlot, date: string): ReservationInstance {
    return {
        reservationId: slot.id,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        courtIds: slot.courtIds ?? [],
        status: getBlockedSlotStatus(slot, date),
        isMonthly: slot.isMonthly === true,
    };
}

// ========================
// OCUPACIÓN
// ========================

function parseHour(t: string): number {
    return parseInt(t.split(":")[0] ?? "0", 10);
}

function hoursOf(startTime: string, endTime: string): number[] {
    const s = parseHour(startTime);
    const e = parseHour(endTime);
    const out: number[] = [];
    for (let h = s; h < e; h++) out.push(h);
    return out;
}

function activeCourtCount(courts: Court[]): number {
    return courts.filter((c) => c.active).length;
}

/** Set de franjas (`${jsDow}_${hour}`) abiertas según el schedule. */
export function computeOpenSlots(schedules: DaySchedule[]): Set<string> {
    const open = new Set<string>();
    for (const day of schedules) {
        if (!day.enabled) continue;
        const dow = DOW_TO_JS[day.dayOfWeek];
        for (const slot of day.slots ?? []) {
            for (const h of hoursOf(slot.startTime, slot.endTime)) open.add(`${dow}_${h}`);
        }
    }
    return open;
}

/**
 * Heatmap de ocupación: día de la semana (JS getDay) × hora.
 * - disponibles(cell) = (nº de fechas con ese dow en el rango, si la franja está abierta) × canchas activas
 * - reservadas(cell)  = suma de `courtIds.length` por hora, de instancias NO canceladas
 * - rate = min(1, reservadas / disponibles); si disponibles=0 y hay reservas → 1 (RN-06b)
 * Devuelve una grilla rectangular: 7 días × [minHour..maxHour] presentes.
 */
export function computeOccupancyHeatmap(
    instances: ReservationInstance[],
    schedules: DaySchedule[],
    courts: Court[],
    period: AnalyticsPeriod,
): OccupancyCell[] {
    const activeCourts = activeCourtCount(courts);
    const openSlots = computeOpenSlots(schedules);

    // Cuántas veces aparece cada día de la semana en el rango.
    const dowCount = new Map<number, number>();
    for (const d of datesInRange(period.start, period.end)) {
        const dow = parseLocalDate(d).getDay();
        dowCount.set(dow, (dowCount.get(dow) ?? 0) + 1);
    }

    // Reservado por celda (excluye canceladas).
    const reserved = new Map<string, number>();
    for (const inst of instances) {
        if (inst.status === "cancelled") continue;
        const dow = parseLocalDate(inst.date).getDay();
        const courtsUsed = inst.courtIds.length || 1;
        for (const h of hoursOf(inst.startTime, inst.endTime)) {
            const key = `${dow}_${h}`;
            reserved.set(key, (reserved.get(key) ?? 0) + courtsUsed);
        }
    }

    // Rango de horas a mostrar: unión de horas abiertas y reservadas.
    const hoursPresent = new Set<number>();
    for (const key of openSlots) hoursPresent.add(Number(key.split("_")[1]));
    for (const key of reserved.keys()) hoursPresent.add(Number(key.split("_")[1]));
    if (hoursPresent.size === 0) return [];
    const minHour = Math.min(...hoursPresent);
    const maxHour = Math.max(...hoursPresent);

    const cells: OccupancyCell[] = [];
    for (const dow of HEATMAP_DAY_ORDER) {
        const occurrences = dowCount.get(dow) ?? 0;
        for (let hour = minHour; hour <= maxHour; hour++) {
            const key = `${dow}_${hour}`;
            const open = openSlots.has(key);
            const reservedHours = reserved.get(key) ?? 0;
            const availableHours = open ? occurrences * activeCourts : 0;
            let rate: number;
            if (availableHours > 0) {
                rate = Math.min(1, reservedHours / availableHours);
            } else {
                rate = reservedHours > 0 ? 1 : 0;
            }
            cells.push({ dayOfWeek: dow, hour, reservedHours, availableHours, rate, open });
        }
    }
    return cells;
}

/** Ocupación global del rango: suma reservado / suma disponible (solo celdas abiertas). */
export function computeOverallOccupancy(cells: OccupancyCell[]): number {
    let reserved = 0;
    let available = 0;
    for (const c of cells) {
        if (!c.open) continue;
        reserved += Math.min(c.reservedHours, c.availableHours);
        available += c.availableHours;
    }
    return available > 0 ? reserved / available : 0;
}

// ========================
// TASAS (inasistencia / cancelación)
// ========================

export function computeStatusRates(instances: ReservationInstance[]): StatusRates {
    const scheduled = instances.length;
    let cancelled = 0;
    let noShow = 0;
    for (const inst of instances) {
        if (inst.status === "cancelled") cancelled++;
        else if (inst.status === "no_show") noShow++;
    }
    const playable = scheduled - cancelled;
    return {
        scheduled,
        noShow,
        cancelled,
        noShowRate: playable > 0 ? noShow / playable : 0,
        cancellationRate: scheduled > 0 ? cancelled / scheduled : 0,
    };
}

// ========================
// BREAKDOWNS (por cancha / por formato)
// ========================

/** Reparte un entero en `n` partes que suman exactamente `total` (el resto va a las primeras). */
function splitEqually(total: number, n: number): number[] {
    if (n <= 0) return [];
    const base = Math.floor(total / n);
    let rem = total - base * n;
    return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

const NO_COURT_KEY = "__none__";
const MIXED_FORMAT_KEY = "__mixed__";

/**
 * Ingreso por cancha: reparte `totalCOP` de cada pago en partes iguales entre sus `courtIds`
 * (suma exacta gracias a splitEqually). Pagos sin cancha → bucket "Sin cancha".
 */
export function revenueByCourt(payments: ManualReservationPayment[], courts: Court[]): BreakdownItem[] {
    const nameById = new Map(courts.map((c) => [c.id, c.name]));
    const byId = new Map<string, number>();
    for (const p of payments) {
        const ids = p.courtIds && p.courtIds.length > 0 ? p.courtIds : [NO_COURT_KEY];
        const shares = splitEqually(p.totalCOP ?? 0, ids.length);
        ids.forEach((id, i) => byId.set(id, (byId.get(id) ?? 0) + shares[i]));
    }
    return [...byId.entries()]
        .map(([key, totalCOP]) => ({
            key,
            label: key === NO_COURT_KEY ? "Sin cancha" : nameById.get(key) ?? key,
            totalCOP,
        }))
        .sort((a, b) => b.totalCOP - a.totalCOP);
}

/**
 * Ingreso por día de la semana (Lun→Dom). Suma el `totalCOP` de cada pago según el día
 * de su fecha. Devuelve los 7 días en orden (incluye días en 0) para mostrar la forma de
 * la semana — responde "¿qué días me dan la plata?".
 */
export function revenueByWeekday(payments: ManualReservationPayment[]): BreakdownItem[] {
    const byDow = new Map<number, number>();
    for (const p of payments) {
        const dow = parseLocalDate(p.date).getDay();
        byDow.set(dow, (byDow.get(dow) ?? 0) + (p.totalCOP ?? 0));
    }
    return HEATMAP_DAY_ORDER.map((dow) => ({
        key: String(dow),
        label: DAY_FULL_LABELS[dow],
        totalCOP: byDow.get(dow) ?? 0,
    }));
}

function sameSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sb = new Set(b);
    return a.every((x) => sb.has(x));
}

/**
 * Ingreso por formato (RN-10): infiere el formato de cada pago con fallback
 *   1) courtIds == combo exacto → combo.resultingFormat
 *   2) una sola cancha          → court.baseFormat
 *   3) nada coincide            → "Mixto/Otro"
 * El totalCOP completo del pago va a un único formato → la suma == ingreso total.
 */
export function revenueByFormat(
    payments: ManualReservationPayment[],
    courts: Court[],
    combos: CourtCombo[],
    venueFormats: VenueFormat[] = [],
): BreakdownItem[] {
    const baseFormatById = new Map(courts.map((c) => [c.id, c.baseFormat]));
    const byFormat = new Map<string, number>();

    for (const p of payments) {
        const ids = p.courtIds ?? [];
        let format: string;
        if (ids.length === 0) {
            format = MIXED_FORMAT_KEY;
        } else if (ids.length === 1) {
            format = baseFormatById.get(ids[0]) ?? MIXED_FORMAT_KEY;
        } else {
            const combo = combos.find((c) => sameSet(c.courtIds, ids));
            format = combo ? combo.resultingFormat : MIXED_FORMAT_KEY;
        }
        byFormat.set(format, (byFormat.get(format) ?? 0) + (p.totalCOP ?? 0));
    }

    return [...byFormat.entries()]
        .map(([key, totalCOP]) => ({
            key,
            // Resuelve el id/legacy del formato a su label visible (mismo helper que el resto
            // de la app): catálogo VenueFormat de la sede, o fallback "Cancha sencilla/doble/triple".
            label: key === MIXED_FORMAT_KEY ? "Mixto / Otro" : formatLabel(key, venueFormats),
            totalCOP,
        }))
        .sort((a, b) => b.totalCOP - a.totalCOP);
}
