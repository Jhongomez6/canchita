import { describe, it, expect } from "vitest";
import {
    isTeamResolved,
    isMatchReady,
    knockoutWinnerSide,
    scoreForPrediction,
    type WCMatch,
} from "./worldcup";

const team = (name: string, code: string) => ({ name, code });

// Helper para armar un WCMatch mínimo de eliminación.
function koMatch(partial: Partial<WCMatch>): WCMatch {
    return {
        id: "89",
        utcDate: "2026-07-04T21:00:00.000Z",
        kickoffMs: 0,
        status: "SCHEDULED",
        phase: "ROUND_OF_16",
        homeTeam: team("Germany", "DE"),
        awayTeam: team("France", "FR"),
        score: { home: null, away: null },
        ...partial,
    };
}

describe("isTeamResolved / isMatchReady", () => {
    it("un equipo con code es resuelto; sin code es placeholder", () => {
        expect(isTeamResolved(team("Germany", "DE"))).toBe(true);
        expect(isTeamResolved(team("Ganador 74", ""))).toBe(false);
    });

    it("listo solo cuando ambos equipos están resueltos", () => {
        expect(isMatchReady(koMatch({}))).toBe(true);
        expect(isMatchReady(koMatch({ awayTeam: team("Ganador 77", "") }))).toBe(false);
        expect(
            isMatchReady(koMatch({ homeTeam: team("Ganador 74", ""), awayTeam: team("Ganador 77", "") })),
        ).toBe(false);
    });
});

describe("knockoutWinnerSide", () => {
    it("sin resultado → null", () => {
        expect(knockoutWinnerSide(koMatch({}))).toBeNull();
    });

    it("marcador decisivo → lado con más goles", () => {
        expect(knockoutWinnerSide(koMatch({ score: { home: 2, away: 1 } }))).toBe("home");
        expect(knockoutWinnerSide(koMatch({ score: { home: 0, away: 3 } }))).toBe("away");
    });

    it("empate sin advancedTeam → null (no se puede avanzar aún)", () => {
        expect(knockoutWinnerSide(koMatch({ score: { home: 1, away: 1 } }))).toBeNull();
    });

    it("empate con advancedTeam (penales) → el lado que avanzó", () => {
        expect(knockoutWinnerSide(koMatch({ score: { home: 1, away: 1 }, advancedTeam: "away" }))).toBe("away");
        expect(knockoutWinnerSide(koMatch({ score: { home: 0, away: 0 }, advancedTeam: "home" }))).toBe("home");
    });
});

describe("scoreForPrediction en eliminación (penales = empate)", () => {
    it("un 1-1 definido por penales puntúa como empate exacto", () => {
        // El resultado en los libros es 1-1; quien predijo 1-1 acierta el marcador.
        expect(scoreForPrediction({ homeGoals: 1, awayGoals: 1 }, { home: 1, away: 1 })).toBe(3);
        // Empate con otro marcador → 1 pt (resultado correcto).
        expect(scoreForPrediction({ homeGoals: 0, awayGoals: 0 }, { home: 1, away: 1 })).toBe(1);
    });
});
