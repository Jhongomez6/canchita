import { describe, it, expect } from "vitest";
import {
    galleryImages,
    buildMapsUrl,
    buildVenueWhatsAppUrl,
    formatSelectionSummary,
    formatTime12h,
    clampBookingWindowDays,
    venueSurfaces,
    venueCoverage,
    courtsForFormat,
    validateGallery,
    validateAmenities,
    validateBookingWindowDays,
    DEFAULT_BOOKING_WINDOW_DAYS,
    MAX_GALLERY_IMAGES,
} from "./venue";
import type { Court, CourtCombo } from "./venue";
import { ValidationError } from "./errors";

function court(partial: Partial<Court>): Court {
    return {
        id: partial.id ?? "c1",
        name: partial.name ?? "Cancha 1",
        baseFormat: partial.baseFormat ?? "6v6",
        active: partial.active ?? true,
        sortOrder: partial.sortOrder ?? 0,
        surface: partial.surface,
        covered: partial.covered,
    };
}

describe("galleryImages", () => {
    it("pone la portada primero y luego la galería, sin duplicados", () => {
        expect(
            galleryImages({ imageURL: "https://a.jpg", gallery: ["https://b.jpg", "https://a.jpg"] }),
        ).toEqual(["https://a.jpg", "https://b.jpg"]);
    });

    it("ignora vacíos y funciona sin portada", () => {
        expect(galleryImages({ imageURL: "", gallery: ["https://b.jpg"] })).toEqual(["https://b.jpg"]);
        expect(galleryImages({ gallery: undefined, imageURL: undefined })).toEqual([]);
    });
});

describe("buildMapsUrl", () => {
    it("usa coordenadas cuando son válidas", () => {
        const url = buildMapsUrl({ lat: 3.42, lng: -76.53, address: "Av X" });
        expect(url).toContain("query=3.42%2C-76.53");
    });

    it("cae a la dirección si faltan coords o son 0,0", () => {
        const url = buildMapsUrl({ lat: 0, lng: 0, address: "Av Cañas 128" });
        expect(url).toContain(encodeURIComponent("Av Cañas 128"));
    });
});

describe("buildVenueWhatsAppUrl", () => {
    it("normaliza a solo dígitos y URL-encodea el mensaje", () => {
        const url = buildVenueWhatsAppUrl("+57 300 123 4567", "Las Palmas");
        expect(url).toContain("wa.me/573001234567");
        expect(url).toContain(encodeURIComponent("Las Palmas"));
    });
});

describe("formatTime12h", () => {
    it("convierte 24h a 12h AM/PM", () => {
        expect(formatTime12h("08:00")).toBe("8:00 AM");
        expect(formatTime12h("21:00")).toBe("9:00 PM");
        expect(formatTime12h("00:30")).toBe("12:30 AM");
        expect(formatTime12h("12:00")).toBe("12:00 PM");
    });
});

describe("formatSelectionSummary", () => {
    it("formatea fecha, rango (12h AM/PM) y duración en horas", () => {
        // 2026-07-11 es sábado
        const r = formatSelectionSummary("2026-07-11", "08:00", "10:00");
        expect(r.dateLabel).toBe("Sáb 11 Jul");
        expect(r.timeRange).toBe("8:00 AM – 10:00 AM");
        expect(r.durationLabel).toBe("2h");
    });

    it("usa 12h también en horario nocturno (no militar)", () => {
        const r = formatSelectionSummary("2026-07-11", "21:00", "22:00");
        expect(r.timeRange).toBe("9:00 PM – 10:00 PM");
    });

    it("maneja duraciones con minutos", () => {
        const r = formatSelectionSummary("2026-07-11", "08:00", "09:30");
        expect(r.durationLabel).toBe("1h 30min");
    });
});

describe("clampBookingWindowDays", () => {
    it("default cuando ausente o inválido", () => {
        expect(clampBookingWindowDays(undefined)).toBe(DEFAULT_BOOKING_WINDOW_DAYS);
        expect(clampBookingWindowDays(NaN)).toBe(DEFAULT_BOOKING_WINDOW_DAYS);
    });

    it("acota a [1,30]", () => {
        expect(clampBookingWindowDays(0)).toBe(1);
        expect(clampBookingWindowDays(100)).toBe(30);
        expect(clampBookingWindowDays(14)).toBe(14);
    });
});

describe("venueSurfaces", () => {
    it("devuelve superficies distintas de canchas activas en orden de catálogo", () => {
        const courts = [
            court({ id: "a", surface: "natural", active: true }),
            court({ id: "b", surface: "synthetic", active: true }),
            court({ id: "c", surface: "synthetic", active: true }),
            court({ id: "d", surface: "parquet", active: false }), // inactiva, se ignora
        ];
        expect(venueSurfaces(courts)).toEqual(["synthetic", "natural"]);
    });

    it("ignora canchas sin superficie", () => {
        expect(venueSurfaces([court({ surface: undefined })])).toEqual([]);
    });
});

describe("courtsForFormat", () => {
    const courts = [
        court({ id: "f1", baseFormat: "football_5v5", surface: "synthetic", active: true }),
        court({ id: "f2", baseFormat: "football_5v5", surface: "synthetic", active: true }),
        court({ id: "v1", baseFormat: "volley_6v6", surface: "sand", active: true }),
        court({ id: "f3", baseFormat: "football_5v5", surface: "natural", active: false }), // inactiva
    ];
    const combos: CourtCombo[] = [
        { id: "c1", name: "Grande", courtIds: ["f1", "f2"], resultingFormat: "football_9v9", active: true },
    ];

    it("incluye canchas con ese baseFormat (solo activas)", () => {
        const r = courtsForFormat(courts, combos, "football_5v5").map((c) => c.id);
        expect(r.sort()).toEqual(["f1", "f2"]);
    });

    it("incluye canchas referenciadas por combos con ese resultingFormat", () => {
        const r = courtsForFormat(courts, combos, "football_9v9").map((c) => c.id);
        expect(r.sort()).toEqual(["f1", "f2"]);
    });

    it("desambigua deportes: el formato de volley solo trae su cancha", () => {
        const r = courtsForFormat(courts, combos, "volley_6v6").map((c) => c.id);
        expect(r).toEqual(["v1"]);
        expect(venueSurfaces(courtsForFormat(courts, combos, "volley_6v6"))).toEqual(["sand"]);
        expect(venueSurfaces(courtsForFormat(courts, combos, "football_5v5"))).toEqual(["synthetic"]);
    });
});

describe("venueCoverage", () => {
    it("detecta techadas y descubiertas por separado", () => {
        const courts = [
            court({ id: "a", covered: true }),
            court({ id: "b", covered: false }),
            court({ id: "c", covered: undefined }),
        ];
        expect(venueCoverage(courts)).toEqual({ anyCovered: true, anyUncovered: true });
    });

    it("solo techadas", () => {
        expect(venueCoverage([court({ covered: true })])).toEqual({
            anyCovered: true,
            anyUncovered: false,
        });
    });
});

describe("validateGallery", () => {
    it("acepta hasta el máximo de URLs https", () => {
        expect(() => validateGallery(["https://a.jpg", "https://b.jpg"])).not.toThrow();
    });

    it("rechaza URLs no https", () => {
        expect(() => validateGallery(["http://a.jpg"])).toThrow(ValidationError);
        expect(() => validateGallery(["javascript:alert(1)"])).toThrow(ValidationError);
    });

    it("rechaza más del máximo", () => {
        const many = Array.from({ length: MAX_GALLERY_IMAGES + 1 }, (_, i) => `https://a${i}.jpg`);
        expect(() => validateGallery(many)).toThrow(ValidationError);
    });
});

describe("validateAmenities", () => {
    it("acepta valores del catálogo sin duplicados", () => {
        expect(() => validateAmenities(["parking", "wifi"])).not.toThrow();
    });

    it("rechaza inválidos y duplicados", () => {
        // @ts-expect-error valor fuera del catálogo
        expect(() => validateAmenities(["parking", "nope"])).toThrow(ValidationError);
        expect(() => validateAmenities(["wifi", "wifi"])).toThrow(ValidationError);
    });
});

describe("validateBookingWindowDays", () => {
    it("acepta enteros en rango", () => {
        expect(() => validateBookingWindowDays(7)).not.toThrow();
    });

    it("rechaza fuera de rango o no enteros", () => {
        expect(() => validateBookingWindowDays(0)).toThrow(ValidationError);
        expect(() => validateBookingWindowDays(31)).toThrow(ValidationError);
        expect(() => validateBookingWindowDays(7.5)).toThrow(ValidationError);
    });
});
