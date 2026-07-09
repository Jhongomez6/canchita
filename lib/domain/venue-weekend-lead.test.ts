import { describe, it, expect } from "vitest";
import {
    isWeekendDate,
    minLeadMinutesForDate,
    validateWeekendLeadHours,
    isSlotBeforeWeekendLead,
    MAX_WEEKEND_LEAD_HOURS,
} from "./venue";
import { ValidationError } from "./errors";

// Fechas de referencia (2026): sábado 11-jul, domingo 12-jul, miércoles 8-jul.
const SAT = "2026-07-11";
const SUN = "2026-07-12";
const WED = "2026-07-08";

describe("isWeekendDate", () => {
    it("detecta sábado y domingo", () => {
        expect(isWeekendDate(SAT)).toBe(true);
        expect(isWeekendDate(SUN)).toBe(true);
    });
    it("entre semana es false", () => {
        expect(isWeekendDate(WED)).toBe(false);
    });
});

describe("minLeadMinutesForDate", () => {
    it("aplica la anticipación configurada solo en fin de semana", () => {
        expect(minLeadMinutesForDate(SAT, 2)).toBe(120);
        expect(minLeadMinutesForDate(SUN, 3)).toBe(180);
        expect(minLeadMinutesForDate(WED, 2)).toBe(0); // entre semana: sin restricción
    });
    it("0 o ausente = sin restricción", () => {
        expect(minLeadMinutesForDate(SAT, 0)).toBe(0);
        expect(minLeadMinutesForDate(SAT)).toBe(0);
    });
});

describe("validateWeekendLeadHours", () => {
    it("acepta enteros dentro del rango", () => {
        expect(() => validateWeekendLeadHours(0)).not.toThrow();
        expect(() => validateWeekendLeadHours(2)).not.toThrow();
        expect(() => validateWeekendLeadHours(MAX_WEEKEND_LEAD_HOURS)).not.toThrow();
    });
    it("rechaza fuera de rango y no enteros", () => {
        expect(() => validateWeekendLeadHours(-1)).toThrow(ValidationError);
        expect(() => validateWeekendLeadHours(MAX_WEEKEND_LEAD_HOURS + 1)).toThrow(ValidationError);
        expect(() => validateWeekendLeadHours(1.5)).toThrow(ValidationError);
    });
});

describe("isSlotBeforeWeekendLead", () => {
    // "Ahora": sábado 08:00. Parseamos en el mismo marco local que el helper,
    // así la comparación es independiente de la zona horaria de la máquina.
    const nowMs = new Date(`${SAT}T08:00:00`).getTime();

    it("con 2h de anticipación bloquea los slots dentro de la ventana", () => {
        const tooSoon = (t: string) => isSlotBeforeWeekendLead(SAT, t, nowMs, 2);
        expect(tooSoon("08:30")).toBe(true);   // dentro de 2h
        expect(tooSoon("09:59")).toBe(true);   // dentro de 2h
        expect(tooSoon("10:00")).toBe(false);  // exactamente 2h → permitido
        expect(tooSoon("11:00")).toBe(false);  // fuera de la ventana
    });

    it("entre semana nunca bloquea, aunque haya horas configuradas", () => {
        const wedNow = new Date(`${WED}T08:00:00`).getTime();
        expect(isSlotBeforeWeekendLead(WED, "08:30", wedNow, 2)).toBe(false);
    });

    it("weekendLeadHours=0 nunca bloquea", () => {
        expect(isSlotBeforeWeekendLead(SAT, "08:30", nowMs, 0)).toBe(false);
    });
});
