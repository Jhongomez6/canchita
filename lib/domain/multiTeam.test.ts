import { describe, it, expect } from "vitest";
import {
    balanceIntoTeams,
    generateFixtures,
    makeFixtureId,
    computeStandings,
    allFixturesPlayed,
    pendingFixturesCount,
    getChampion,
    getTeamNetResult,
    getPlayerSessionResults,
    addPlayerToSmallestTeam,
    removePlayerFromTeams,
    maxTeamsFor,
    canUseMultiTeam,
    validTeamCounts,
    validateNumTeams,
    validateFixtureScore,
    getMultiTeamQuality,
    type MultiTeam,
    type Fixture,
    type MultiBalanceOptions,
} from "./multiTeam";
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
        uid: `u${seq}`,
        name: `Player ${seq}`,
        level,
        positions,
        confirmed: true,
        ...extra,
    };
}

const fixed = (seed = 1): MultiBalanceOptions => ({ rng: seededRng(seed) });

const totalLevel = (players: Player[]) =>
    players.reduce((s, p) => s + (p.level ?? 0), 0);

const gkCount = (players: Player[]) =>
    players.filter((p) => p.positions?.includes("GK")).length;

/** Roster de N*5 jugadores con niveles rotados y N arqueros. */
function roster(numTeams: number): Player[] {
    const total = numTeams * 5;
    const players: Player[] = [];
    for (let i = 0; i < numTeams; i++) {
        players.push(player(((i % 4) + 1) as PlayerLevel, ["GK"]));
    }
    for (let i = numTeams; i < total; i++) {
        const positions: Position[] = [["DEF"], ["MID"], ["FWD"]][i % 3] as Position[];
        players.push(player(((i % 4) + 1) as PlayerLevel, positions));
    }
    return players;
}

/** Helper para armar un torneo simple de test. */
function makeTeams(n: number): MultiTeam[] {
    const { teams } = balanceIntoTeams(roster(n), n, fixed(n));
    return teams;
}

// ========================
// CA — Balanceo: paridad numérica
// ========================

describe("balanceIntoTeams — paridad numérica (diff ≤ 1 entre equipos)", () => {
    it.each([
        [3, 15], [3, 16], [3, 17], [4, 20], [4, 22], [4, 23],
    ])("N=%i con %i jugadores", (n, count) => {
        const players = Array.from({ length: count }, (_, i) =>
            player(((i % 4) + 1) as PlayerLevel),
        );
        const { teams } = balanceIntoTeams(players, n, fixed(count));
        const sizes = teams.map((t) => t.players.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(count);
        expect(teams).toHaveLength(n);
    });
});

// ========================
// CA — Balanceo: todos los jugadores repartidos, sin duplicados
// ========================

describe("balanceIntoTeams — reparte a todos sin duplicar", () => {
    it("cada jugador aparece exactamente una vez", () => {
        const players = roster(4);
        const { teams } = balanceIntoTeams(players, 4, fixed(4));
        const allIds = teams.flatMap((t) => t.players.map((p) => p.id));
        expect(allIds).toHaveLength(players.length);
        expect(new Set(allIds).size).toBe(players.length);
    });
});

// ========================
// CA — Balanceo: 1 GK por equipo con ≥ N arqueros
// ========================

describe("balanceIntoTeams — distribución de arqueros", () => {
    it("con N arqueros, cada equipo tiene exactamente 1", () => {
        const { teams } = balanceIntoTeams(roster(3), 3, fixed(3));
        teams.forEach((t) => expect(gkCount(t.players)).toBe(1));
    });

    it("warning cuando hay menos arqueros que equipos", () => {
        const players = [
            player(2, ["GK"]),
            ...Array.from({ length: 14 }, () => player(2, ["MID"])),
        ];
        const { warnings } = balanceIntoTeams(players, 3, fixed(1));
        expect(warnings.some((w) => w.includes("arquero"))).toBe(true);
    });
});

// ========================
// CA — Balanceo: nivel parejo entre equipos
// ========================

describe("balanceIntoTeams — minimiza el rango de nivel", () => {
    it("15 jugadores de nivel uniforme → rango de nivel 0", () => {
        const players = Array.from({ length: 15 }, () => player(2));
        const { teams, quality } = balanceIntoTeams(players, 3, fixed(2));
        expect(quality.levelSpread).toBe(0);
        const levels = teams.map((t) => totalLevel(t.players));
        expect(Math.max(...levels) - Math.min(...levels)).toBe(0);
    });

    it("colores y nombres por defecto asignados", () => {
        const { teams } = balanceIntoTeams(roster(4), 4, fixed(4));
        expect(teams.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4"]);
        expect(teams.map((t) => t.name)).toEqual(["Equipo 1", "Equipo 2", "Equipo 3", "Equipo 4"]);
        expect(teams.map((t) => t.color)).toEqual(["red", "blue", "green", "orange"]);
    });
});

// ========================
// CA — Fixtures round-robin C(N,2)
// ========================

describe("generateFixtures — round-robin C(N,2)", () => {
    it("N=3 genera 3 fixtures", () => {
        const fixtures = generateFixtures(makeTeams(3));
        expect(fixtures).toHaveLength(3);
    });

    it("N=4 genera 6 fixtures", () => {
        const fixtures = generateFixtures(makeTeams(4));
        expect(fixtures).toHaveLength(6);
    });

    it("cada par juega exactamente una vez, ids determinísticos", () => {
        const teams = makeTeams(4);
        const fixtures = generateFixtures(teams);
        const pairs = fixtures.map((f) => [f.home, f.away].sort().join("-"));
        expect(new Set(pairs).size).toBe(fixtures.length);
        expect(fixtures[0].id).toBe(makeFixtureId(fixtures[0].home, fixtures[0].away));
        fixtures.forEach((f) => {
            expect(f.scoreHome).toBeNull();
            expect(f.scoreAway).toBeNull();
        });
    });
});

// ========================
// CA — Tabla de posiciones
// ========================

describe("computeStandings — puntos, orden y tolerancia a fixtures parciales", () => {
    const teams: MultiTeam[] = [
        { id: "T1", name: "E1", color: "red", players: [] },
        { id: "T2", name: "E2", color: "blue", players: [] },
        { id: "T3", name: "E3", color: "green", players: [] },
    ];

    it("calcula PTS/GF/DIF y ordena correctamente", () => {
        const fixtures: Fixture[] = [
            { id: "T1_T2", home: "T1", away: "T2", scoreHome: 3, scoreAway: 1 },
            { id: "T1_T3", home: "T1", away: "T3", scoreHome: 0, scoreAway: 2 },
            { id: "T2_T3", home: "T2", away: "T3", scoreHome: 2, scoreAway: 2 },
        ];
        const standings = computeStandings(teams, fixtures);

        // T3: 1G 1E → 4 pts; T1: 1G 1P → 3 pts; T2: 1E 1P → 1 pt
        const byId = Object.fromEntries(standings.map((s) => [s.teamId, s]));
        expect(byId.T3.points).toBe(4);
        expect(byId.T1.points).toBe(3);
        expect(byId.T2.points).toBe(1);

        expect(standings[0].teamId).toBe("T3");
        expect(standings[0].position).toBe(1);
        expect(standings[2].teamId).toBe("T2");
    });

    it("desempata por diferencia de gol y luego goles a favor", () => {
        const fixtures: Fixture[] = [
            { id: "T1_T2", home: "T1", away: "T2", scoreHome: 5, scoreAway: 0 },
            { id: "T1_T3", home: "T1", away: "T3", scoreHome: 0, scoreAway: 1 },
            { id: "T2_T3", home: "T2", away: "T3", scoreHome: 0, scoreAway: 1 },
        ];
        // T3: 2G → 6 pts (campeón). T1 y T2 empatan en pts (3 y 0)... revisemos:
        // T1: gana 5-0, pierde 0-1 → 3 pts, DIF +4. T2: pierde ambos → 0 pts.
        const standings = computeStandings(teams, fixtures);
        expect(standings[0].teamId).toBe("T3");
        expect(standings[1].teamId).toBe("T1");
        expect(standings[1].goalDiff).toBe(4);
    });

    it("tolera fixtures sin marcador (tabla provisional)", () => {
        const fixtures: Fixture[] = [
            { id: "T1_T2", home: "T1", away: "T2", scoreHome: 2, scoreAway: 0 },
            { id: "T1_T3", home: "T1", away: "T3", scoreHome: null, scoreAway: null },
            { id: "T2_T3", home: "T2", away: "T3", scoreHome: null, scoreAway: null },
        ];
        const standings = computeStandings(teams, fixtures);
        const t1 = standings.find((s) => s.teamId === "T1")!;
        expect(t1.played).toBe(1);
        expect(t1.points).toBe(3);
        expect(standings.find((s) => s.teamId === "T3")!.played).toBe(0);
    });
});

// ========================
// CA — allFixturesPlayed / champion
// ========================

describe("allFixturesPlayed y getChampion", () => {
    const teams: MultiTeam[] = [
        { id: "T1", name: "E1", color: "red", players: [] },
        { id: "T2", name: "E2", color: "blue", players: [] },
        { id: "T3", name: "E3", color: "green", players: [] },
    ];

    it("no hay campeón hasta que todos los fixtures tienen marcador", () => {
        const partial: Fixture[] = [
            { id: "T1_T2", home: "T1", away: "T2", scoreHome: 1, scoreAway: 0 },
            { id: "T1_T3", home: "T1", away: "T3", scoreHome: null, scoreAway: null },
            { id: "T2_T3", home: "T2", away: "T3", scoreHome: 0, scoreAway: 0 },
        ];
        expect(allFixturesPlayed(partial)).toBe(false);
        expect(pendingFixturesCount(partial)).toBe(1);
        const standings = computeStandings(teams, partial);
        expect(getChampion(standings, allFixturesPlayed(partial))).toBeNull();
    });

    it("declara campeón cuando todos jugaron", () => {
        const full: Fixture[] = [
            { id: "T1_T2", home: "T1", away: "T2", scoreHome: 1, scoreAway: 0 },
            { id: "T1_T3", home: "T1", away: "T3", scoreHome: 2, scoreAway: 0 },
            { id: "T2_T3", home: "T2", away: "T3", scoreHome: 0, scoreAway: 0 },
        ];
        expect(allFixturesPlayed(full)).toBe(true);
        const standings = computeStandings(teams, full);
        expect(getChampion(standings, true)).toBe("T1"); // 2 victorias
    });
});

// ========================
// CA — Resultado de sesión (balance neto)
// ========================

describe("getTeamNetResult — balance neto de fixtures", () => {
    const fixtures: Fixture[] = [
        { id: "T1_T2", home: "T1", away: "T2", scoreHome: 3, scoreAway: 1 }, // T1 gana
        { id: "T1_T3", home: "T1", away: "T3", scoreHome: 0, scoreAway: 2 }, // T1 pierde
        { id: "T2_T3", home: "T2", away: "T3", scoreHome: 2, scoreAway: 2 }, // empate
    ];

    it("T1 (1G-1P) → empate por balance", () => {
        expect(getTeamNetResult("T1", fixtures)).toBe("draw");
    });
    it("T2 (0G-1P) → derrota", () => {
        expect(getTeamNetResult("T2", fixtures)).toBe("loss");
    });
    it("T3 (1G-0P) → victoria", () => {
        expect(getTeamNetResult("T3", fixtures)).toBe("win");
    });
});

describe("getPlayerSessionResults — cada jugador hereda el resultado de su equipo", () => {
    it("mapea uid → resultado neto", () => {
        const teams: MultiTeam[] = [
            { id: "T1", name: "E1", color: "red", players: [player(2, ["MID"], { uid: "ua" })] },
            { id: "T2", name: "E2", color: "blue", players: [player(2, ["MID"], { uid: "ub" })] },
            { id: "T3", name: "E3", color: "green", players: [player(2, ["MID"], { uid: "uc" })] },
        ];
        const fixtures: Fixture[] = [
            { id: "T1_T2", home: "T1", away: "T2", scoreHome: 3, scoreAway: 1 },
            { id: "T1_T3", home: "T1", away: "T3", scoreHome: 0, scoreAway: 2 },
            { id: "T2_T3", home: "T2", away: "T3", scoreHome: 2, scoreAway: 2 },
        ];
        const results = getPlayerSessionResults({ teams, fixtures });
        expect(results.get("ua")).toBe("draw");
        expect(results.get("ub")).toBe("loss");
        expect(results.get("uc")).toBe("win");
    });
});

// ========================
// CA — Asignación / remoción (joins tardíos)
// ========================

describe("addPlayerToSmallestTeam / removePlayerFromTeams", () => {
    it("asigna al equipo más chico", () => {
        const teams: MultiTeam[] = [
            { id: "T1", name: "E1", color: "red", players: [player(2), player(2)] },
            { id: "T2", name: "E2", color: "blue", players: [player(2)] },
            { id: "T3", name: "E3", color: "green", players: [player(2), player(2)] },
        ];
        const newP = player(3, ["MID"], { uid: "new" });
        const next = addPlayerToSmallestTeam(teams, newP);
        expect(next[1].players.map((p) => p.uid)).toContain("new");
        expect(next[0].players).toHaveLength(2); // inmutable
    });

    it("remueve por uid de todos los equipos", () => {
        const teams: MultiTeam[] = [
            { id: "T1", name: "E1", color: "red", players: [player(2, ["MID"], { uid: "x" })] },
            { id: "T2", name: "E2", color: "blue", players: [player(2)] },
        ];
        const next = removePlayerFromTeams(teams, "x");
        expect(next[0].players).toHaveLength(0);
    });
});

// ========================
// CA — Límites y disponibilidad
// ========================

describe("límites de convocatoria", () => {
    it("maxTeamsFor respeta 5 jugadores/equipo y tope 4", () => {
        expect(maxTeamsFor(14)).toBe(2);
        expect(maxTeamsFor(15)).toBe(3);
        expect(maxTeamsFor(19)).toBe(3);
        expect(maxTeamsFor(20)).toBe(4);
        expect(maxTeamsFor(30)).toBe(4); // tope 4
    });

    it("canUseMultiTeam requiere ≥ 15 confirmados", () => {
        expect(canUseMultiTeam(14)).toBe(false);
        expect(canUseMultiTeam(15)).toBe(true);
    });

    it("validTeamCounts devuelve opciones válidas", () => {
        expect(validTeamCounts(14)).toEqual([]);
        expect(validTeamCounts(15)).toEqual([3]);
        expect(validTeamCounts(20)).toEqual([3, 4]);
    });
});

// ========================
// CA — Validaciones
// ========================

describe("validaciones", () => {
    it("validateNumTeams rechaza fuera de rango o con pocos jugadores", () => {
        expect(() => validateNumTeams(2, 20)).toThrow();
        expect(() => validateNumTeams(5, 30)).toThrow();
        expect(() => validateNumTeams(3, 14)).toThrow(); // < 15
        expect(() => validateNumTeams(3, 15)).not.toThrow();
        expect(() => validateNumTeams(4, 20)).not.toThrow();
    });

    it("validateFixtureScore acepta enteros 0..99 y rechaza el resto", () => {
        expect(() => validateFixtureScore(0)).not.toThrow();
        expect(() => validateFixtureScore(5)).not.toThrow();
        expect(() => validateFixtureScore(-1)).toThrow();
        expect(() => validateFixtureScore(100)).toThrow();
        expect(() => validateFixtureScore(2.5)).toThrow();
        expect(() => validateFixtureScore("3" as unknown)).toThrow();
    });
});

// ========================
// CA — Calidad en vivo (post drag-and-drop)
// ========================

describe("getMultiTeamQuality — recálculo sobre equipos ya formados", () => {
    it("detecta desbalance de nivel tras edición manual", () => {
        const teams: MultiTeam[] = [
            { id: "T1", name: "E1", color: "red", players: [player(4), player(4)] },
            { id: "T2", name: "E2", color: "blue", players: [player(1), player(1)] },
            { id: "T3", name: "E3", color: "green", players: [player(2), player(2)] },
        ];
        const q = getMultiTeamQuality(teams);
        expect(q.levelSpread).toBe(6); // 8 vs 2
        expect(q.cost).toBeGreaterThan(0);
    });
});
