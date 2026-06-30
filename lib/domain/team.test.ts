import { describe, it, expect } from "vitest";
import { balanceTeams, type BalanceOptions } from "./team";
import type { Player, Position, PlayerLevel } from "./player";

// ========================
// HELPERS DE TEST
// ========================

/** RNG determinista (mulberry32) para resultados reproducibles. */
function seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let seq = 0;
function player(
    level: PlayerLevel,
    positions: Position[] = ["MID"],
    extra: Partial<Player> = {},
): Player {
    seq++;
    return {
        id: `p${seq}`,
        name: `Player ${seq}`,
        level,
        positions,
        confirmed: true,
        ...extra,
    };
}

const fixed = (seed = 1): BalanceOptions => ({ rng: seededRng(seed) });

const totalLevel = (players: Player[]) =>
    players.reduce((s, p) => s + (p.level ?? 0), 0);

const gkCount = (players: Player[]) =>
    players.filter(p => p.positions?.includes("GK")).length;

// ========================
// CA-1 — Alcanza el óptimo de nivel bajo paridad
// ========================

describe("CA-1 — minimiza la diferencia de nivel (óptimo bajo paridad)", () => {
    // [4,3,3,2,2,2] (total 16): el split óptimo respetando 3-3 es
    // {4,2,2}=8 vs {3,3,2}=8 → levelDiff 0. El optimizador debe alcanzarlo
    // de forma robusta pese a los desempates aleatorios de cada candidato.
    it("[4,3,3,2,2,2] se reparte 8-8 (levelDiff = 0)", () => {
        const players = [
            player(4), player(3), player(3),
            player(2), player(2), player(2),
        ];
        const { teamA, teamB, quality } = balanceTeams(players, fixed(7));
        expect(quality.levelDiff).toBe(0);
        expect(totalLevel(teamA.players)).toBe(8);
        expect(totalLevel(teamB.players)).toBe(8);
    });
});

// ========================
// CA-2 — Paridad numérica
// ========================

describe("CA-2 — paridad numérica (diff de jugadores ≤ 1)", () => {
    it.each([4, 5, 6, 7, 10, 11, 14, 22])("con %i jugadores", (n) => {
        const players = Array.from({ length: n }, (_, i) =>
            player(((i % 4) + 1) as PlayerLevel),
        );
        const { teamA, teamB } = balanceTeams(players, fixed(n));
        expect(Math.abs(teamA.players.length - teamB.players.length)).toBeLessThanOrEqual(1);
        expect(teamA.players.length + teamB.players.length).toBe(n);
    });
});

// ========================
// CA-3 — 1 GK por equipo con ≥ 2 GKs
// ========================

describe("CA-3 — distribución de arqueros", () => {
    it("con 2+ GKs, cada equipo tiene exactamente 1", () => {
        const players = [
            player(3, ["GK"]), player(2, ["GK"]),
            player(4, ["DEF"]), player(3, ["MID"]),
            player(2, ["FWD"]), player(1, ["MID"]),
            player(2, ["DEF"]), player(3, ["FWD"]),
        ];
        const { teamA, teamB } = balanceTeams(players, fixed(3));
        expect(gkCount(teamA.players)).toBe(1);
        expect(gkCount(teamB.players)).toBe(1);
    });

    it("con 3 GKs, los 2 mejores quedan en equipos opuestos y el extra juega de campo", () => {
        const players = [
            { ...player(3, ["GK"]), id: "gk3", level: 3 as PlayerLevel },
            { ...player(4, ["GK"]), id: "gk4", level: 4 as PlayerLevel },
            { ...player(2, ["GK"]), id: "gk2", level: 2 as PlayerLevel },
            player(3, ["MID"]), player(2, ["FWD"]), player(1, ["DEF"]),
        ];
        const { teamA, teamB } = balanceTeams(players, fixed(11));
        // Los 2 GKs de mayor nivel (gk4, gk3) son titulares: uno en cada equipo.
        const aIds = teamA.players.map(p => p.id);
        const teamOfGk4 = aIds.includes("gk4") ? "A" : "B";
        const teamOfGk3 = aIds.includes("gk3") ? "A" : "B";
        expect(teamOfGk4).not.toBe(teamOfGk3);
        // El GK extra (gk2) sigue en la cancha como jugador de campo.
        expect([...teamA.players, ...teamB.players].some(p => p.id === "gk2")).toBe(true);
        expect(teamA.players.length + teamB.players.length).toBe(6);
    });

    it("warning cuando hay 0 o 1 arquero", () => {
        const none = balanceTeams(
            [player(2), player(2), player(3), player(1)],
            fixed(1),
        );
        expect(none.warnings.some(w => w.includes("No hay arqueros"))).toBe(true);

        const one = balanceTeams(
            [player(2, ["GK"]), player(2), player(3), player(1)],
            fixed(1),
        );
        expect(one.warnings.some(w => w.includes("Solo hay 1 arquero"))).toBe(true);
    });
});

// ========================
// CA-4 — Determinismo bajo RNG fijo
// ========================

describe("CA-4 — determinismo con rng inyectado", () => {
    it("dos ejecuciones con el mismo seed producen idéntico resultado", () => {
        const players = Array.from({ length: 12 }, (_, i) =>
            player(((i % 4) + 1) as PlayerLevel, [(["GK", "DEF", "MID", "FWD"] as Position[])[i % 4]]),
        );
        const r1 = balanceTeams(players, fixed(42));
        const r2 = balanceTeams(players, fixed(42));
        const ids = (t: Player[]) => t.map(p => p.id);
        expect(ids(r1.teamA.players)).toEqual(ids(r2.teamA.players));
        expect(ids(r1.teamB.players)).toEqual(ids(r2.teamB.players));
        expect(r1.quality).toEqual(r2.quality);
    });
});

// ========================
// CA-5 — Sin sesgo de GK hacia A
// ========================

describe("CA-5 — el GK más fuerte no cae siempre en el mismo equipo", () => {
    it("sobre muchas corridas, el GK nivel 4 aparece en A y en B", () => {
        const strongGkId = "p-strong-gk";
        const makePlayers = () => [
            { ...player(2, ["GK"]), id: strongGkId, level: 4 as PlayerLevel },
            player(2, ["GK"]),
            player(3, ["DEF"]), player(3, ["MID"]),
            player(2, ["FWD"]), player(2, ["MID"]),
        ];
        let inA = 0;
        let inB = 0;
        for (let seed = 0; seed < 40; seed++) {
            const { teamA } = balanceTeams(makePlayers(), { rng: seededRng(seed) });
            if (teamA.players.some(p => p.id === strongGkId)) inA++;
            else inB++;
        }
        expect(inA).toBeGreaterThan(0);
        expect(inB).toBeGreaterThan(0);
    });
});

// ========================
// CA-6 — Reparto de sexo
// ========================

describe("CA-6 — balance de sexo", () => {
    it("dos mujeres quedan una en cada equipo cuando el resto lo permite", () => {
        const players = [
            player(2, ["MID"], { sex: "F", id: "f1" }),
            player(2, ["MID"], { sex: "F", id: "f2" }),
            player(2, ["DEF"], { sex: "M" }),
            player(2, ["FWD"], { sex: "M" }),
            player(2, ["MID"], { sex: "M" }),
            player(2, ["DEF"], { sex: "M" }),
        ];
        const { teamA, teamB, quality } = balanceTeams(players, fixed(5));
        expect(quality.sexDiff).toBe(0);
        const fA = teamA.players.filter(p => p.sex === "F").length;
        const fB = teamB.players.filter(p => p.sex === "F").length;
        expect(fA).toBe(1);
        expect(fB).toBe(1);
    });
});

// ========================
// CA-7 — No concentrar cracks
// ========================

describe("CA-7 — concentración de cracks penalizada", () => {
    it("[4,4,2,2] no junta ambos nivel-4 en el mismo equipo", () => {
        const players = [player(4), player(4), player(2), player(2)];
        const { teamA, teamB, quality } = balanceTeams(players, fixed(9));
        expect(quality.starDiff).toBe(0);
        expect(teamA.players.filter(p => p.level === 4).length).toBe(1);
        expect(teamB.players.filter(p => p.level === 4).length).toBe(1);
    });
});

// ========================
// CA-8 — quality coherente
// ========================

describe("CA-8 — BalanceResult.quality coherente", () => {
    it("expone métricas consistentes con los equipos resultantes", () => {
        const players = [
            player(4, ["GK"]), player(3, ["GK"]),
            player(4, ["DEF"]), player(2, ["MID"]),
            player(3, ["FWD"]), player(1, ["MID"]),
            player(2, ["DEF"], { sex: "F" }), player(3, ["FWD"], { sex: "F" }),
        ];
        const { teamA, teamB, quality } = balanceTeams(players, fixed(13));

        expect(quality.levelDiff).toBe(
            Math.abs(totalLevel(teamA.players) - totalLevel(teamB.players)),
        );
        const cracks = (t: Player[]) => t.filter(p => p.level === 4).length;
        expect(quality.starDiff).toBe(Math.abs(cracks(teamA.players) - cracks(teamB.players)));
        const fem = (t: Player[]) => t.filter(p => p.sex === "F").length;
        expect(quality.sexDiff).toBe(Math.abs(fem(teamA.players) - fem(teamB.players)));
        expect(quality.cost).toBeGreaterThanOrEqual(0);
        expect(quality.candidatesEvaluated).toBeGreaterThanOrEqual(1);
    });
});

// ========================
// CA-9 — Backward compatibility
// ========================

describe("CA-9 — firma compatible sin options", () => {
    it("balanceTeams(players) funciona y devuelve quality", () => {
        const players = [player(3), player(2), player(2), player(1)];
        const result = balanceTeams(players);
        expect(result.teamA.players.length + result.teamB.players.length).toBe(4);
        expect(result.quality).toBeDefined();
        expect(typeof result.quality.cost).toBe("number");
    });
});

// ========================
// CA-10 — Rendimiento
// ========================

describe("CA-10 — rendimiento con 22 jugadores", () => {
    it("resuelve en menos de 50ms", () => {
        const players = Array.from({ length: 22 }, (_, i) =>
            player(
                ((i % 4) + 1) as PlayerLevel,
                [(["GK", "DEF", "MID", "FWD"] as Position[])[i % 4]],
            ),
        );
        const start = performance.now();
        balanceTeams(players, fixed(99));
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
    });
});
