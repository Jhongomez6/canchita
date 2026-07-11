import { describe, it, expect } from "vitest";
import {
    sanitizeVenueIdParam,
    buildReservarReturnTo,
    buildReservarCTAHref,
} from "./landing";

describe("sanitizeVenueIdParam", () => {
    it("acepta ids válidos", () => {
        expect(sanitizeVenueIdParam("venue_abc")).toBe("venue_abc");
        expect(sanitizeVenueIdParam("ABC-123")).toBe("ABC-123");
        expect(sanitizeVenueIdParam("  venue_abc  ")).toBe("venue_abc"); // trim
    });

    it("rechaza valores no-string", () => {
        expect(sanitizeVenueIdParam(undefined)).toBeNull();
        expect(sanitizeVenueIdParam(null)).toBeNull();
        expect(sanitizeVenueIdParam(123)).toBeNull();
        expect(sanitizeVenueIdParam(["venue_abc"])).toBeNull();
    });

    it("rechaza intentos de open-redirect / path injection", () => {
        expect(sanitizeVenueIdParam("//evil.com")).toBeNull();
        expect(sanitizeVenueIdParam("../../etc")).toBeNull();
        expect(sanitizeVenueIdParam("..%2f..")).toBeNull();
        expect(sanitizeVenueIdParam("venue/../x")).toBeNull();
        expect(sanitizeVenueIdParam("http://x.com")).toBeNull();
        expect(sanitizeVenueIdParam("a b")).toBeNull(); // espacio interno
        expect(sanitizeVenueIdParam("")).toBeNull();
    });

    it("rechaza ids demasiado largos (> 64)", () => {
        expect(sanitizeVenueIdParam("a".repeat(65))).toBeNull();
        expect(sanitizeVenueIdParam("a".repeat(64))).toBe("a".repeat(64));
    });
});

describe("buildReservarReturnTo", () => {
    it("con sede válida apunta a la reserva de esa sede", () => {
        expect(buildReservarReturnTo("venue_abc")).toBe("/venues/venue_abc");
    });

    it("sin sede apunta al listado de sedes", () => {
        expect(buildReservarReturnTo(null)).toBe("/venues");
    });
});

describe("buildReservarCTAHref", () => {
    it("siempre pasa por el login con el returnTo codificado", () => {
        expect(buildReservarCTAHref("venue_abc")).toBe(
            "/?returnTo=%2Fvenues%2Fvenue_abc",
        );
        expect(buildReservarCTAHref(null)).toBe("/?returnTo=%2Fvenues");
    });
});
