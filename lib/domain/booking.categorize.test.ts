import { describe, it, expect } from "vitest";
import { bookingTab, categorizeBookingForList, isBookingActive, isNegativeTerminalStatus } from "./booking";
import type { Booking, BookingStatus } from "./booking";

const TODAY = "2026-07-11";
const NOW = new Date(`${TODAY}T12:00:00`).getTime();

function bk(status: BookingStatus, date: string, expiresAt?: string): Pick<Booking, "date" | "status" | "expiresAt"> {
    return { status, date, expiresAt };
}

describe("categorizeBookingForList", () => {
    it("clasifica activas futuras como próximas", () => {
        expect(categorizeBookingForList(bk("confirmed", "2026-07-20"), TODAY, NOW)).toBe("upcoming");
        expect(categorizeBookingForList(bk("deposit_confirmed", TODAY), TODAY, NOW)).toBe("upcoming");
        expect(categorizeBookingForList(bk("pending_approval", "2026-08-01"), TODAY, NOW)).toBe("upcoming");
    });

    it("clasifica terminales positivas como jugadas", () => {
        for (const s of ["played", "paid", "free", "completed"] as BookingStatus[]) {
            expect(categorizeBookingForList(bk(s, "2026-07-01"), TODAY, NOW)).toBe("played");
        }
    });

    it("clasifica una activa ya pasada como jugada", () => {
        expect(categorizeBookingForList(bk("confirmed", "2026-07-01"), TODAY, NOW)).toBe("played");
    });

    it("clasifica terminales negativas como canceladas sin importar la fecha", () => {
        for (const s of ["cancelled", "expired", "no_show"] as BookingStatus[]) {
            expect(categorizeBookingForList(bk(s, "2026-07-20"), TODAY, NOW)).toBe("cancelled");
        }
    });

    it("trata pending_payment con TTL vencido como cancelada aunque la fecha sea futura", () => {
        const expired = new Date(NOW - 1000).toISOString();
        expect(categorizeBookingForList(bk("pending_payment", "2026-07-20", expired), TODAY, NOW)).toBe("cancelled");
    });

    it("mantiene pending_payment con TTL vigente como próxima", () => {
        const future = new Date(NOW + 60_000).toISOString();
        expect(categorizeBookingForList(bk("pending_payment", "2026-07-20", future), TODAY, NOW)).toBe("upcoming");
    });
});

describe("isBookingActive (split Activas / Historial)", () => {
    it("true solo para pre-juego activo con fecha futura", () => {
        expect(isBookingActive(bk("confirmed", "2026-07-20"), TODAY, NOW)).toBe(true);
        expect(isBookingActive(bk("pending_approval", TODAY), TODAY, NOW)).toBe(true);
    });

    it("false para terminales, pasadas y TTL vencido", () => {
        expect(isBookingActive(bk("played", "2026-07-01"), TODAY, NOW)).toBe(false);
        expect(isBookingActive(bk("cancelled", "2026-07-20"), TODAY, NOW)).toBe(false);
        expect(isBookingActive(bk("confirmed", "2026-07-01"), TODAY, NOW)).toBe(false); // pasada
        const expired = new Date(NOW - 1000).toISOString();
        expect(isBookingActive(bk("pending_payment", "2026-07-20", expired), TODAY, NOW)).toBe(false);
    });
});

describe("bookingTab (played → Activas)", () => {
    it("manda las jugadas a Activas aunque la fecha ya pasó", () => {
        expect(bookingTab(bk("played", "2026-07-01"), TODAY, NOW)).toBe("active");
    });

    it("mantiene próximas en Activas", () => {
        expect(bookingTab(bk("confirmed", "2026-07-20"), TODAY, NOW)).toBe("active");
        expect(bookingTab(bk("pending_approval", TODAY), TODAY, NOW)).toBe("active");
    });

    it("deja cerradas y muertas en Historial", () => {
        for (const s of ["paid", "free", "completed", "cancelled", "expired", "no_show"] as BookingStatus[]) {
            expect(bookingTab(bk(s, "2026-07-01"), TODAY, NOW)).toBe("historial");
        }
        // confirmada cuya fecha ya pasó → Historial
        expect(bookingTab(bk("confirmed", "2026-07-01"), TODAY, NOW)).toBe("historial");
    });
});

describe("isNegativeTerminalStatus", () => {
    it("true solo para cancelled/expired/no_show", () => {
        expect(isNegativeTerminalStatus("cancelled")).toBe(true);
        expect(isNegativeTerminalStatus("expired")).toBe(true);
        expect(isNegativeTerminalStatus("no_show")).toBe(true);
        expect(isNegativeTerminalStatus("played")).toBe(false);
        expect(isNegativeTerminalStatus("confirmed")).toBe(false);
    });
});
