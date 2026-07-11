import { describe, it, expect } from "vitest";
import {
    normalizeText,
    venueSports,
    venueFormatLabels,
    venueClientFormatLabels,
    prioritizeAmenities,
    collectAmenities,
    deriveVenueCity,
    extractCityFromAddressComponents,
    venueCity,
    collectCities,
    collectSports,
    filterVenues,
} from "./venueList";
import type { Venue, VenueFormat } from "./venue";

function fmt(sport: VenueFormat["sport"], label: string): VenueFormat {
    return { id: `${sport}_${label}`, sport, label, playersPerTeam: 5 };
}

function makeVenue(overrides: Partial<Venue>): Venue {
    return {
        id: "v1",
        name: "Sede",
        address: "",
        placeId: "p1",
        lat: 0,
        lng: 0,
        createdBy: "u1",
        active: true,
        depositRequired: false,
        depositPercent: 30,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        ...overrides,
    };
}

describe("normalizeText", () => {
    it("quita acentos y pasa a minúsculas", () => {
        expect(normalizeText("CALÍ")).toBe("cali");
        expect(normalizeText("Bogotá")).toBe("bogota");
        // ñ también se descompone (n + tilde) → búsqueda insensible a la tilde
        expect(normalizeText("  Ñeña  ")).toBe("nena");
    });
});

describe("venueSports", () => {
    it("legacy sin formats ⇒ solo football", () => {
        expect(venueSports(makeVenue({ formats: undefined }))).toEqual(["football"]);
        expect(venueSports(makeVenue({ formats: [] }))).toEqual(["football"]);
    });

    it("devuelve deportes distintos en orden canónico", () => {
        const venue = makeVenue({
            formats: [fmt("volleyball", "Vóley 6v6"), fmt("football", "Fútbol 5v5"), fmt("football", "Fútbol 7v7")],
        });
        // SPORT_TYPES order: football antes que volleyball
        expect(venueSports(venue)).toEqual(["football", "volleyball"]);
    });
});

describe("venueFormatLabels", () => {
    it("labels distintos preservando orden del catálogo", () => {
        const venue = makeVenue({
            formats: [fmt("football", "Fútbol 5v5"), fmt("football", "Fútbol 7v7"), fmt("football", "Fútbol 5v5")],
        });
        expect(venueFormatLabels(venue)).toEqual(["Fútbol 5v5", "Fútbol 7v7"]);
    });

    it("legacy ⇒ vacío", () => {
        expect(venueFormatLabels(makeVenue({ formats: undefined }))).toEqual([]);
    });
});

describe("venueClientFormatLabels", () => {
    it("estandariza a 'Tamaño (NvsN)' y deduplica", () => {
        const venue = makeVenue({
            formats: [
                { id: "football_9v9", sport: "football", label: "Cancha Norte", playersPerTeam: 9 },
                { id: "football_5v5", sport: "football", label: "Mini", playersPerTeam: 5 },
            ],
        });
        expect(venueClientFormatLabels(venue)).toEqual(["Doble (9vs9)", "Sencilla (5vs5)"]);
    });

    it("legacy ⇒ vacío", () => {
        expect(venueClientFormatLabels(makeVenue({ formats: undefined }))).toEqual([]);
    });
});

describe("deriveVenueCity", () => {
    it("dirección colombiana con departamento y país", () => {
        expect(
            deriveVenueCity("Av. Cañas Gordas # 128-188- B/R, Barrio Pance, Pance, Cali, Valle del Cauca, Colombia"),
        ).toBe("Cali");
    });

    it("dirección de EE. UU. con estado y código postal", () => {
        expect(deriveVenueCity("Bay Lake, Florida 32836, EE. UU.")).toBe("Bay Lake");
    });

    it("Bogotá no se confunde con departamento", () => {
        expect(deriveVenueCity("Calle 100, Bogotá, Cundinamarca, Colombia")).toBe("Bogotá");
    });

    it("null si no hay componente alfabético plausible", () => {
        expect(deriveVenueCity("")).toBeNull();
        expect(deriveVenueCity(undefined)).toBeNull();
        expect(deriveVenueCity("Calle 45 # 12-30")).toBeNull();
    });
});

describe("extractCityFromAddressComponents", () => {
    it("prefiere locality", () => {
        const components = [
            { long_name: "Cali", short_name: "Cali", types: ["locality", "political"] },
            { long_name: "Valle del Cauca", short_name: "Valle", types: ["administrative_area_level_1"] },
            { long_name: "Colombia", short_name: "CO", types: ["country"] },
        ];
        expect(extractCityFromAddressComponents(components)).toBe("Cali");
    });

    it("cae a administrative_area_level_2 si no hay locality", () => {
        const components = [
            { long_name: "Municipio X", short_name: "X", types: ["administrative_area_level_2"] },
            { long_name: "Colombia", short_name: "CO", types: ["country"] },
        ];
        expect(extractCityFromAddressComponents(components)).toBe("Municipio X");
    });

    it("null si no hay componente de ciudad ni lista", () => {
        expect(extractCityFromAddressComponents(undefined)).toBeNull();
        expect(extractCityFromAddressComponents([])).toBeNull();
        expect(
            extractCityFromAddressComponents([
                { long_name: "Colombia", short_name: "CO", types: ["country"] },
            ]),
        ).toBeNull();
    });
});

describe("venueCity", () => {
    it("prefiere el campo estructurado sobre el address", () => {
        expect(
            venueCity({ city: "Medellín", address: "Cra 1, Cali, Valle del Cauca, Colombia" }),
        ).toBe("Medellín");
    });

    it("cae al parseo del address si no hay city (legacy)", () => {
        expect(
            venueCity({ city: undefined, address: "Cra 1, Cali, Valle del Cauca, Colombia" }),
        ).toBe("Cali");
    });

    it("ignora city en blanco", () => {
        expect(
            venueCity({ city: "   ", address: "Cra 1, Cali, Valle del Cauca, Colombia" }),
        ).toBe("Cali");
    });
});

describe("collectCities", () => {
    it("ciudades distintas, ordenadas, sin duplicar por acento/caso", () => {
        const venues = [
            makeVenue({ id: "a", address: "X, Cali, Valle del Cauca, Colombia" }),
            makeVenue({ id: "b", address: "Y, CALI, Valle del Cauca, Colombia" }),
            makeVenue({ id: "c", address: "Z, Bogotá, Cundinamarca, Colombia" }),
        ];
        expect(collectCities(venues)).toEqual(["Bogotá", "Cali"]);
    });
});

describe("prioritizeAmenities", () => {
    it("pone parking primero y respeta la prioridad", () => {
        expect(prioritizeAmenities(["wifi", "cafeteria", "parking", "showers"])).toEqual([
            "parking", "showers", "cafeteria", "wifi",
        ]);
    });

    it("cancha techada (covered) tiene prioridad máxima", () => {
        expect(prioritizeAmenities(["parking", "covered"])).toEqual(["covered", "parking"]);
    });

    it("de-duplica", () => {
        expect(prioritizeAmenities(["parking", "parking", "lighting"])).toEqual(["parking", "lighting"]);
    });

    it("undefined / vacío ⇒ []", () => {
        expect(prioritizeAmenities(undefined)).toEqual([]);
        expect(prioritizeAmenities([])).toEqual([]);
    });
});

describe("collectSports", () => {
    it("deportes distintos en orden canónico", () => {
        const venues = [
            makeVenue({ id: "a", formats: [fmt("volleyball", "V")] }),
            makeVenue({ id: "b", formats: [fmt("football", "F")] }),
        ];
        expect(collectSports(venues)).toEqual(["football", "volleyball"]);
    });
});

describe("collectAmenities", () => {
    it("amenities distintas en orden de prioridad", () => {
        const venues = [
            makeVenue({ id: "a", amenities: ["wifi", "parking"] }),
            makeVenue({ id: "b", amenities: ["covered", "wifi"] }),
        ];
        // prioridad: covered, parking, …, wifi
        expect(collectAmenities(venues)).toEqual(["covered", "parking", "wifi"]);
    });
});

describe("filterVenues", () => {
    const venues = [
        makeVenue({ id: "a", name: "Centro Deportivo Las Palmas", address: "Av 1, Cali, Valle del Cauca, Colombia", formats: [fmt("football", "Fútbol 5v5")], amenities: ["covered", "parking"] }),
        makeVenue({ id: "b", name: "Coliseo El Pueblo", address: "Cra 2, Bogotá, Cundinamarca, Colombia", formats: [fmt("volleyball", "Vóley 6v6")], amenities: ["parking"] }),
    ];

    it("sin filtros devuelve todo", () => {
        expect(filterVenues(venues, {}).map((v) => v.id)).toEqual(["a", "b"]);
    });

    it("busca por nombre insensible a acentos", () => {
        expect(filterVenues(venues, { query: "palmas" }).map((v) => v.id)).toEqual(["a"]);
        expect(filterVenues(venues, { query: "pueblo" }).map((v) => v.id)).toEqual(["b"]);
    });

    it("busca por dirección", () => {
        expect(filterVenues(venues, { query: "cra 2" }).map((v) => v.id)).toEqual(["b"]);
    });

    it("filtra por deporte", () => {
        expect(filterVenues(venues, { sport: "volleyball" }).map((v) => v.id)).toEqual(["b"]);
    });

    it("filtra por ciudad", () => {
        expect(filterVenues(venues, { city: "Cali" }).map((v) => v.id)).toEqual(["a"]);
    });

    it("combina criterios (AND)", () => {
        expect(filterVenues(venues, { city: "Cali", sport: "volleyball" })).toEqual([]);
    });

    it("filtra por amenities (todas presentes, AND)", () => {
        expect(filterVenues(venues, { amenities: ["parking"] }).map((v) => v.id)).toEqual(["a", "b"]);
        expect(filterVenues(venues, { amenities: ["covered"] }).map((v) => v.id)).toEqual(["a"]);
        expect(filterVenues(venues, { amenities: ["covered", "parking"] }).map((v) => v.id)).toEqual(["a"]);
        expect(filterVenues(venues, { amenities: ["covered", "wifi"] })).toEqual([]);
    });
});
