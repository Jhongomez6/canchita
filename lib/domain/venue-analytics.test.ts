import { describe, it, expect } from "vitest";
import {
    resolvePeriod,
    previousPeriodOf,
    clampCustomRange,
    rangeLengthDays,
    datesInRange,
    compare,
    computeRevenueSummary,
    bucketRevenue,
    expandReservationInstances,
    computeOpenSlots,
    computeOccupancyHeatmap,
    computeOverallOccupancy,
    computeStatusRates,
    revenueByCourt,
    revenueByFormat,
    MAX_RANGE_DAYS,
    type AnalyticsPeriod,
} from "./venue-analytics";
import type {
    BlockedSlot,
    Court,
    CourtCombo,
    DaySchedule,
    ManualReservationPayment,
    ManualReservationStatus,
    BlockedSlotRecurrence,
} from "./venue";

// ========================
// HELPERS DE TEST
// ========================

function payment(over: Partial<ManualReservationPayment> = {}): ManualReservationPayment {
    return {
        id: "p1",
        reservationId: "r1",
        date: "2026-07-10",
        cashCOP: 0,
        transferCOP: 0,
        totalCOP: 0,
        startTime: "18:00",
        endTime: "19:00",
        courtIds: ["c1"],
        registeredBy: "u1",
        registeredAt: "2026-07-10T18:00:00Z",
        ...over,
    };
}

function slot(over: Partial<BlockedSlot> = {}): BlockedSlot {
    return {
        id: "s1",
        date: "2026-07-10",
        startTime: "18:00",
        endTime: "19:00",
        courtIds: ["c1"],
        createdBy: "u1",
        createdAt: "2026-07-01T00:00:00Z",
        ...over,
    };
}

function court(id: string, over: Partial<Court> = {}): Court {
    return { id, name: id.toUpperCase(), baseFormat: "6v6", active: true, sortOrder: 0, ...over };
}

function period(start: string, end: string): AnalyticsPeriod {
    return { preset: "custom", start, end };
}

// ========================
// FECHAS Y PERÍODOS
// ========================

describe("helpers de fecha", () => {
    it("rangeLengthDays es inclusivo", () => {
        expect(rangeLengthDays("2026-07-01", "2026-07-01")).toBe(1);
        expect(rangeLengthDays("2026-07-01", "2026-07-04")).toBe(4);
    });

    it("datesInRange enumera inclusive", () => {
        expect(datesInRange("2026-07-01", "2026-07-03")).toEqual([
            "2026-07-01", "2026-07-02", "2026-07-03",
        ]);
    });
});

describe("resolvePeriod", () => {
    const ref = new Date("2026-07-04T12:00:00"); // sábado

    it("this_month va del día 1 a hoy", () => {
        const p = resolvePeriod("this_month", ref);
        expect(p.start).toBe("2026-07-01");
        expect(p.end).toBe("2026-07-04");
    });

    it("last_month cubre el mes anterior completo", () => {
        const p = resolvePeriod("last_month", ref);
        expect(p.start).toBe("2026-06-01");
        expect(p.end).toBe("2026-06-30");
    });

    it("this_week empieza un lunes y termina hoy", () => {
        const p = resolvePeriod("this_week", ref);
        // El start debe caer en lunes (getDay === 1).
        expect(new Date(p.start + "T12:00:00").getDay()).toBe(1);
        expect(p.end).toBe("2026-07-04");
    });

    it("custom recorta a MAX_RANGE_DAYS", () => {
        const p = resolvePeriod("custom", ref, { start: "2026-01-01", end: "2026-12-31" });
        expect(rangeLengthDays(p.start, p.end)).toBe(MAX_RANGE_DAYS);
    });
});

describe("clampCustomRange", () => {
    it("ordena fechas invertidas", () => {
        expect(clampCustomRange("2026-07-10", "2026-07-01")).toEqual({
            start: "2026-07-01", end: "2026-07-10",
        });
    });

    it("recorta rangos que exceden el máximo", () => {
        const { start, end } = clampCustomRange("2026-01-01", "2026-12-31");
        expect(start).toBe("2026-01-01");
        expect(rangeLengthDays(start, end)).toBe(MAX_RANGE_DAYS);
    });
});

describe("previousPeriodOf", () => {
    it("custom: rango de igual duración inmediatamente anterior", () => {
        const prev = previousPeriodOf(period("2026-07-01", "2026-07-04")); // preset custom, 4 días
        expect(prev.start).toBe("2026-06-27");
        expect(prev.end).toBe("2026-06-30");
        expect(rangeLengthDays(prev.start, prev.end)).toBe(4);
    });

    it("this_week: misma ventana corrida 7 días atrás", () => {
        const prev = previousPeriodOf({ preset: "this_week", start: "2026-06-29", end: "2026-07-05" });
        expect(prev).toMatchObject({ start: "2026-06-22", end: "2026-06-28" });
    });

    it("this_month: mismo tramo del mes anterior", () => {
        const p = resolvePeriod("this_month", new Date("2026-07-05T12:00:00")); // 1–5 jul
        const prev = previousPeriodOf(p);
        expect(prev).toMatchObject({ start: "2026-06-01", end: "2026-06-05" });
    });

    it("this_month: clampa el día final si el mes anterior es más corto", () => {
        const p = resolvePeriod("this_month", new Date("2026-07-31T12:00:00")); // 1–31 jul
        const prev = previousPeriodOf(p);
        expect(prev).toMatchObject({ start: "2026-06-01", end: "2026-06-30" }); // junio no tiene 31
    });

    it("last_month: mes calendario completo anterior", () => {
        const p = resolvePeriod("last_month", new Date("2026-07-05T12:00:00")); // junio completo
        const prev = previousPeriodOf(p);
        expect(prev).toMatchObject({ start: "2026-05-01", end: "2026-05-31" }); // mayo completo
    });
});

describe("compare", () => {
    it("calcula delta porcentual", () => {
        expect(compare(120, 100).deltaPct).toBeCloseTo(20);
    });
    it("devuelve null cuando el período anterior es 0", () => {
        expect(compare(50, 0).deltaPct).toBeNull();
    });
});

// ========================
// INGRESOS
// ========================

describe("computeRevenueSummary", () => {
    it("suma montos y calcula ticket promedio", () => {
        const r = computeRevenueSummary([
            payment({ cashCOP: 4000, transferCOP: 0, totalCOP: 4000 }),
            payment({ cashCOP: 2000, transferCOP: 2000, totalCOP: 4000 }),
        ]);
        expect(r.totalCOP).toBe(8000);
        expect(r.cashCOP).toBe(6000);
        expect(r.transferCOP).toBe(2000);
        expect(r.paymentsCount).toBe(2);
        expect(r.avgTicketCOP).toBe(4000);
    });

    it("no divide por cero sin pagos", () => {
        expect(computeRevenueSummary([]).avgTicketCOP).toBe(0);
    });
});

describe("bucketRevenue", () => {
    it("usa granularidad diaria para rangos <= 31 días", () => {
        const p = period("2026-07-01", "2026-07-03");
        const t = bucketRevenue([payment({ date: "2026-07-02", totalCOP: 5000 })], p);
        expect(t.granularity).toBe("day");
        expect(t.buckets).toHaveLength(3);
        expect(t.buckets[1]).toEqual({ label: "2", totalCOP: 5000 });
    });

    it("usa granularidad semanal para rangos > 31 días", () => {
        const p = period("2026-06-01", "2026-07-31");
        const t = bucketRevenue([payment({ date: "2026-06-03", totalCOP: 9000 })], p);
        expect(t.granularity).toBe("week");
        expect(t.buckets.reduce((s, b) => s + b.totalCOP, 0)).toBe(9000);
    });
});

// ========================
// EXPANSIÓN DE RESERVAS
// ========================

function rec(type: BlockedSlotRecurrence["type"], startDate: string, endDate?: string): BlockedSlotRecurrence {
    return { type, startDate, ...(endDate ? { endDate } : {}) };
}

describe("expandReservationInstances", () => {
    const p = period("2026-07-01", "2026-07-31");

    it("incluye puntuales dentro del rango y excluye las de afuera", () => {
        const inRange = slot({ id: "a", date: "2026-07-10" });
        const outRange = slot({ id: "b", date: "2026-08-10" });
        const out = expandReservationInstances([inRange, outRange], p);
        expect(out.map((i) => i.reservationId)).toEqual(["a"]);
    });

    it("expande weekly a cada lunes", () => {
        const s = slot({ id: "w", date: null, recurrence: rec("weekly", "2026-07-06") }); // lunes
        const dates = expandReservationInstances([s], p).map((i) => i.date);
        expect(dates).toEqual(["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"]);
    });

    it("expande biweekly cada 14 días", () => {
        const s = slot({ id: "bw", date: null, recurrence: rec("biweekly", "2026-07-06") });
        const dates = expandReservationInstances([s], p).map((i) => i.date);
        expect(dates).toEqual(["2026-07-06", "2026-07-20"]);
    });

    it("expande monthly al mismo día del mes", () => {
        const q = period("2026-01-01", "2026-04-30");
        const s = slot({ id: "m", date: null, recurrence: rec("monthly", "2026-01-15") });
        const dates = expandReservationInstances([s], q).map((i) => i.date);
        expect(dates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
    });

    it("monthly con día > 28 no genera instancias (evita ambigüedad de fin de mes)", () => {
        const q = period("2026-01-01", "2026-06-30");
        const s = slot({ id: "m31", date: null, recurrence: rec("monthly", "2026-01-31") });
        expect(expandReservationInstances([s], q)).toHaveLength(0);
    });

    it("respeta exceptDates", () => {
        const s = slot({
            id: "w", date: null,
            recurrence: rec("weekly", "2026-07-06"),
            exceptDates: ["2026-07-13"],
        });
        const dates = expandReservationInstances([s], p).map((i) => i.date);
        expect(dates).not.toContain("2026-07-13");
        expect(dates).toContain("2026-07-06");
    });

    it("aplica statusOverrides por instancia", () => {
        const s = slot({
            id: "w", date: null, status: "confirmed",
            recurrence: rec("weekly", "2026-07-06"),
            statusOverrides: { "2026-07-13": "no_show" },
        });
        const insts = expandReservationInstances([s], p);
        const jul13 = insts.find((i) => i.date === "2026-07-13");
        expect(jul13?.status).toBe("no_show");
    });
});

// ========================
// OCUPACIÓN
// ========================

const monSchedule: DaySchedule[] = [
    { dayOfWeek: "monday", enabled: true, slots: [{ startTime: "18:00", endTime: "20:00", formats: [] }] },
];

describe("computeOpenSlots", () => {
    it("marca las horas abiertas por día de semana", () => {
        const open = computeOpenSlots(monSchedule);
        expect(open.has("1_18")).toBe(true);
        expect(open.has("1_19")).toBe(true);
        expect(open.has("1_20")).toBe(false); // fin exclusivo
        expect(open.has("2_18")).toBe(false); // martes cerrado
    });
});

describe("computeOccupancyHeatmap", () => {
    // Rango con exactamente un lunes (2026-07-06).
    const p = period("2026-07-06", "2026-07-06");
    const courts = [court("c1"), court("c2")]; // 2 canchas activas

    it("calcula rate = reservado / disponible", () => {
        const inst = expandReservationInstances([slot({ date: "2026-07-06", startTime: "18:00", endTime: "19:00", courtIds: ["c1"] })], p);
        const cells = computeOccupancyHeatmap(inst, monSchedule, courts, p);
        const mon18 = cells.find((c) => c.dayOfWeek === 1 && c.hour === 18)!;
        expect(mon18.availableHours).toBe(2); // 1 lunes × 2 canchas
        expect(mon18.reservedHours).toBe(1);
        expect(mon18.rate).toBeCloseTo(0.5);
        expect(mon18.open).toBe(true);
    });

    it("no cuenta reservas canceladas", () => {
        const inst = expandReservationInstances([slot({ date: "2026-07-06", status: "cancelled" })], p);
        const cells = computeOccupancyHeatmap(inst, monSchedule, courts, p);
        const mon18 = cells.find((c) => c.dayOfWeek === 1 && c.hour === 18)!;
        expect(mon18.reservedHours).toBe(0);
    });

    it("capa la celda a 100% para reservas fuera del horario", () => {
        // Reserva a las 6am, fuera del schedule (que abre 18-20).
        const inst = expandReservationInstances([slot({ date: "2026-07-06", startTime: "06:00", endTime: "07:00", courtIds: ["c1", "c2"] })], p);
        const cells = computeOccupancyHeatmap(inst, monSchedule, courts, p);
        const mon6 = cells.find((c) => c.dayOfWeek === 1 && c.hour === 6)!;
        expect(mon6.open).toBe(false);
        expect(mon6.rate).toBe(1); // capado
    });

    it("computeOverallOccupancy promedia sobre celdas abiertas", () => {
        const inst = expandReservationInstances([slot({ date: "2026-07-06", startTime: "18:00", endTime: "20:00", courtIds: ["c1"] })], p);
        const cells = computeOccupancyHeatmap(inst, monSchedule, courts, p);
        // 2 canchas × 2 horas disponibles = 4 court-h; reservado 1 cancha × 2h = 2 → 50%.
        expect(computeOverallOccupancy(cells)).toBeCloseTo(0.5);
    });
});

// ========================
// TASAS
// ========================

describe("computeStatusRates", () => {
    it("calcula inasistencia y cancelación", () => {
        const p = period("2026-07-01", "2026-07-31");
        const insts = expandReservationInstances([
            slot({ id: "a", date: "2026-07-05", status: "played" }),
            slot({ id: "b", date: "2026-07-06", status: "no_show" }),
            slot({ id: "c", date: "2026-07-07", status: "cancelled" }),
            slot({ id: "d", date: "2026-07-08", status: "paid" }),
        ], p);
        const r = computeStatusRates(insts);
        expect(r.scheduled).toBe(4);
        expect(r.cancelled).toBe(1);
        expect(r.noShow).toBe(1);
        expect(r.cancellationRate).toBeCloseTo(0.25); // 1/4
        expect(r.noShowRate).toBeCloseTo(1 / 3);       // 1 no_show / 3 jugables
    });
});

// ========================
// BREAKDOWNS
// ========================

describe("revenueByCourt", () => {
    it("reparte el total entre canchas y suma exacto", () => {
        const courts = [court("c1"), court("c2")];
        const items = revenueByCourt([
            payment({ courtIds: ["c1"], totalCOP: 4000 }),
            payment({ courtIds: ["c1", "c2"], totalCOP: 3001 }), // impar → reparto exacto
        ], courts);
        const total = items.reduce((s, i) => s + i.totalCOP, 0);
        expect(total).toBe(7001);
        expect(items[0].totalCOP).toBeGreaterThanOrEqual(items[1].totalCOP); // ordenado desc
    });

    it("agrupa pagos sin cancha bajo 'Sin cancha'", () => {
        const items = revenueByCourt([payment({ courtIds: [], totalCOP: 1000 })], []);
        expect(items[0]).toMatchObject({ label: "Sin cancha", totalCOP: 1000 });
    });
});

describe("revenueByFormat", () => {
    const courts = [court("c1", { baseFormat: "6v6" }), court("c2", { baseFormat: "6v6" })];
    const combos: CourtCombo[] = [
        { id: "combo1", name: "Grande", courtIds: ["c1", "c2"], resultingFormat: "11v11", active: true },
    ];

    it("infiere formato: cancha única, combo exacto y mixto — suma == total", () => {
        const items = revenueByFormat([
            payment({ courtIds: ["c1"], totalCOP: 2000 }),          // 6v6
            payment({ courtIds: ["c1", "c2"], totalCOP: 5000 }),    // combo → 11v11
            payment({ courtIds: ["c1", "c99"], totalCOP: 1000 }),   // no combo → Mixto/Otro
        ], courts, combos);

        const byKey = Object.fromEntries(items.map((i) => [i.label, i.totalCOP]));
        expect(byKey["6v6"]).toBe(2000);
        expect(byKey["11v11"]).toBe(5000);
        expect(byKey["Mixto / Otro"]).toBe(1000);
        expect(items.reduce((s, i) => s + i.totalCOP, 0)).toBe(8000);
    });
});
