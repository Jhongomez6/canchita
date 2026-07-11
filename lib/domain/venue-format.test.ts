import { describe, it, expect } from "vitest";
import {
    playersPerTeamOf,
    courtTierLabel,
    clientFormatLabel,
} from "./venue";
import type { VenueFormat } from "./venue";

const catalog: VenueFormat[] = [
    { id: "football_9v9", sport: "football", label: "Cancha Norte", playersPerTeam: 9 },
    { id: "football_5v5", sport: "football", label: "Mini", playersPerTeam: 5 },
    { id: "volley_6v6", sport: "volleyball", label: "Vóley principal", playersPerTeam: 6 },
];

describe("playersPerTeamOf", () => {
    it("usa el catálogo cuando existe", () => {
        expect(playersPerTeamOf("football_9v9", catalog)).toBe(9);
    });

    it("parsea legacy 'XvX' sin catálogo", () => {
        expect(playersPerTeamOf("9v9")).toBe(9);
    });

    it("parsea namespaced 'sport_XvX' sin catálogo", () => {
        expect(playersPerTeamOf("football_9v9")).toBe(9);
    });

    it("null si no se puede determinar", () => {
        expect(playersPerTeamOf("raro")).toBeNull();
    });
});

describe("courtTierLabel", () => {
    it("mapea jugadores a tamaño de cancha", () => {
        expect(courtTierLabel(5)).toBe("Sencilla");
        expect(courtTierLabel(6)).toBe("Sencilla");
        expect(courtTierLabel(7)).toBe("Doble");
        expect(courtTierLabel(9)).toBe("Doble");
        expect(courtTierLabel(10)).toBe("Triple");
        expect(courtTierLabel(11)).toBe("Triple");
    });
});

describe("clientFormatLabel", () => {
    it("fútbol ⇒ 'Tamaño (NvsN)'", () => {
        expect(clientFormatLabel("football_9v9", catalog)).toBe("Doble (9vs9)");
        expect(clientFormatLabel("football_5v5", catalog)).toBe("Sencilla (5vs5)");
    });

    it("legacy 'XvX' sin catálogo ⇒ tratado como fútbol", () => {
        expect(clientFormatLabel("9v9")).toBe("Doble (9vs9)");
        expect(clientFormatLabel("11v11")).toBe("Triple (11vs11)");
    });

    it("otro deporte ⇒ usa el nombre del deporte, no el tier de fútbol", () => {
        expect(clientFormatLabel("volley_6v6", catalog)).toBe("Voleibol (6vs6)");
    });

    it("formato indeterminado ⇒ cae a formatLabel (id crudo)", () => {
        expect(clientFormatLabel("raro")).toBe("raro");
    });
});
