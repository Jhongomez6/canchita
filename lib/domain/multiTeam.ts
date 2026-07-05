/**
 * ========================
 * MULTI-TEAM (ROUND-ROBIN) DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD): docs/MULTI_TEAM_ROUND_ROBIN_SDD.md
 *
 * Lógica pura para armar N equipos balanceados (3-4) y correr un torneo
 * round-robin (todos contra todos). No depende de Firebase ni React.
 *
 * ESPECIFICACIÓN:
 * - N ∈ {3, 4}, mínimo 5 jugadores por equipo (mínimo 15 confirmados para habilitar).
 * - El balanceo generaliza el algoritmo de 2 equipos (lib/domain/team.ts):
 *   distribuye 1 arquero por equipo, snake-draft en N cubetas y mejora local
 *   (hill climbing) por swaps entre pares de equipos. Reutiliza la misma función
 *   de costo conceptual (nivel + cracks + posiciones + sexo), midiendo el RANGO
 *   (max - min) entre los N equipos en vez de la diferencia entre 2.
 * - Round-robin: se generan C(N,2) fixtures. Cada par juega una vez.
 * - Tabla de posiciones: 3 pts victoria, 1 empate, 0 derrota. Desempate:
 *   PTS → DIF → GF → orden de creación.
 * - Resultado de sesión del jugador: se deriva del BALANCE NETO de los fixtures
 *   de su equipo (W>L → victoria, W==L → empate, W<L → derrota). Una sola
 *   clasificación por sesión (no por fixture) → stats/XP coherentes con el modo clásico.
 * - El RNG es inyectable para tests deterministas.
 */

import { ValidationError } from "./errors";
import { DEFAULT_WEIGHTS, type BalanceWeights } from "./team";
import type { Player, Position } from "./player";
import type { TeamColor } from "./team-colors";

// ========================
// TIPOS
// ========================

export type TeamId = string; // "T1" | "T2" | "T3" | "T4"

export interface MultiTeam {
    id: TeamId;
    name: string;      // "Equipo 1" (editable por el admin)
    color: TeamColor;  // uno de TEAM_COLOR_CONFIG
    players: Player[]; // incluir photoURL + primaryPosition (regla #2 CLAUDE.md)
}

export interface Fixture {
    id: string;                // determinístico: `${home}_${away}`
    home: TeamId;
    away: TeamId;
    scoreHome: number | null;  // null = no jugado aún
    scoreAway: number | null;
    playedAt?: string;         // ISO, al registrar marcador
}

export interface MultiTeamTournament {
    format: "round_robin";
    numTeams: number;
    teams: MultiTeam[];
    fixtures: Fixture[];
    confirmed: boolean;
    confirmedAt?: string;
    createdAt: string;
}

/** Fila de la tabla de posiciones — CALCULADA, nunca persistida. */
export interface TeamStanding {
    teamId: TeamId;
    played: number;        // PJ
    won: number;           // G
    drawn: number;         // E
    lost: number;          // P
    goalsFor: number;      // GF
    goalsAgainst: number;  // GC
    goalDiff: number;      // DIF
    points: number;        // PTS
    position: number;      // 1..N (tras ordenar)
}

/** Resultado de sesión del jugador para stats/XP. */
export type PlayerSessionResult = "win" | "draw" | "loss";

export interface MultiBalanceQuality {
    levelSpread: number;        // max - min del nivel total entre equipos
    starSpread: number;         // max - min de cracks (nivel 4) entre equipos
    positionImbalance: number;  // Σ_pos (max - min) de la posición primaria entre equipos
    sexSpread: number;          // max - min de mujeres entre equipos
    cost: number;               // costo ponderado total (menor = mejor)
    candidatesEvaluated: number;
}

export interface MultiBalanceResult {
    teams: MultiTeam[];
    warnings: string[];
    quality: MultiBalanceQuality;
}

export interface MultiBalanceOptions {
    candidates?: number;      // multi-start (default 100)
    weights?: BalanceWeights; // default DEFAULT_WEIGHTS (reusado del modo 2-equipos)
    rng?: () => number;       // inyectable para tests (default Math.random)
}

// ========================
// CONSTANTES DE NEGOCIO
// ========================

export const MIN_PLAYERS_PER_TEAM = 5;
export const MIN_CONFIRMED_FOR_MULTI = 15;
export const MIN_TEAMS = 3;
export const MAX_TEAMS = 4;

/** Colores por defecto asignados a los equipos, en orden. */
export const TEAM_PALETTE: TeamColor[] = ["red", "blue", "green", "orange"];

// ========================
// HELPERS (espejo de team.ts)
// ========================

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

/** Nivel saneado al rango válido [0..4]. 0 representa nivel ausente. */
const levelOf = (p: Player): number => {
    const n = p.level ?? 0;
    return n < 0 ? 0 : n > 4 ? 4 : n;
};

const isCrack = (p: Player) => levelOf(p) >= 4;
const isFemale = (p: Player) => p.sex === "F";
const primaryPosOf = (p: Player): Position => p.positions?.[0] ?? "MID";
const playerKey = (p: Player) => p.id || p.uid || p.name;

/** Fisher-Yates shuffle con RNG inyectable — muta el array in-place y lo retorna. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ========================
// FUNCIÓN DE COSTO (N equipos)
// ========================

/**
 * Costo multi-objetivo de una partición en N equipos. Menor es mejor;
 * `cost === 0` ⇒ balance perfecto. Para N equipos se usa el RANGO (max - min)
 * de cada métrica entre los equipos (generaliza el |A - B| del caso 2-equipos).
 */
function computeMultiQuality(teams: Player[][], w: BalanceWeights): MultiBalanceQuality {
    const levels = teams.map((t) => t.reduce((s, p) => s + levelOf(p), 0));
    const stars = teams.map((t) => t.filter(isCrack).length);
    const females = teams.map((t) => t.filter(isFemale).length);

    const spread = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);

    const levelSpread = spread(levels);
    const starSpread = spread(stars);
    const sexSpread = spread(females);
    const positionImbalance = POSITIONS.reduce((sum, pos) => {
        const counts = teams.map((t) => t.filter((p) => primaryPosOf(p) === pos).length);
        return sum + spread(counts);
    }, 0);

    const cost =
        w.level * levelSpread +
        w.star * starSpread +
        w.position * positionImbalance +
        w.sex * sexSpread;

    return { levelSpread, starSpread, positionImbalance, sexSpread, cost, candidatesEvaluated: 0 };
}

// ========================
// GENERACIÓN DE CANDIDATOS
// ========================

interface MultiCandidate {
    teams: Player[][];
    /** Keys de los arqueros titulares — bloqueados ante swaps (1 GK/equipo). */
    locked: Set<string>;
}

/**
 * Un candidato: snake-draft greedy en N cubetas con shuffle + reparto de GKs.
 *
 * P1: Paridad numérica (SIEMPRE gana — garantiza dif. máx. 1 entre equipos)
 * P2: Balance de posición primaria (solo entre los equipos empatados en tamaño)
 * P3: Balance de nivel; desempate final aleatorio (sin sesgo)
 */
function greedyMultiCandidate(players: Player[], numTeams: number, rng: () => number): MultiCandidate {
    const teams: Player[][] = Array.from({ length: numTeams }, () => []);
    const levels = new Array(numTeams).fill(0);
    const locked = new Set<string>();

    const countPrimary = (t: number, pos: Position) =>
        teams[t].filter((p) => primaryPosOf(p) === pos).length;

    const target = (pos?: Position): number => {
        let cand = teams.map((_, i) => i);

        // P1: Paridad numérica — el/los equipos más chicos
        const minLen = Math.min(...cand.map((t) => teams[t].length));
        cand = cand.filter((t) => teams[t].length === minLen);
        if (cand.length === 1) return cand[0];

        // P2: Balance de posición
        if (pos) {
            const minPos = Math.min(...cand.map((t) => countPrimary(t, pos)));
            cand = cand.filter((t) => countPrimary(t, pos) === minPos);
            if (cand.length === 1) return cand[0];
        }

        // P3: Balance de nivel
        const minLvl = Math.min(...cand.map((t) => levels[t]));
        cand = cand.filter((t) => levels[t] === minLvl);
        if (cand.length === 1) return cand[0];

        // Desempate aleatorio (sin sesgo hacia el primer equipo)
        return cand[Math.floor(rng() * cand.length)];
    };

    const add = (p: Player, pos?: Position) => {
        const t = target(pos);
        teams[t].push(p);
        levels[t] += levelOf(p);
    };

    // ---- Fase 1: Arqueros — los N mejores por nivel, uno por equipo (orden barajado) ----
    const gks = players
        .filter((p) => p.positions?.includes("GK"))
        .sort((x, y) => levelOf(y) - levelOf(x));

    shuffle(gks.slice(0, numTeams), rng).forEach((gk) => {
        add(gk, "GK");
        locked.add(playerKey(gk));
    });

    // ---- Fase 2: Pool general (resto, incluidos GKs extra) ----
    const pool = shuffle(
        players.filter((p) => !locked.has(playerKey(p))),
        rng,
    ).sort((x, y) => levelOf(y) - levelOf(x));

    pool.forEach((p) => add(p, primaryPosOf(p)));

    return { teams, locked };
}

/**
 * Mejora local (hill climbing): repite el intercambio de un jugador de campo
 * entre CUALQUIER par de equipos que más reduzca el costo, hasta que ningún swap
 * mejore. Solo intercambia jugadores NO bloqueados ⇒ preserva la paridad numérica
 * y la distribución de arqueros. Acepta solo mejoras estrictas ⇒ siempre termina.
 */
function improveMultiBySwaps(teams: Player[][], locked: Set<string>, w: BalanceWeights): void {
    const EPS = 1e-9;
    const fieldIdxs = (t: number) =>
        teams[t].reduce<number[]>((acc, p, i) => {
            if (!locked.has(playerKey(p))) acc.push(i);
            return acc;
        }, []);

    let improved = true;
    while (improved) {
        improved = false;
        const base = computeMultiQuality(teams, w).cost;
        let bestDelta = -EPS;
        let best: { ti: number; tj: number; i: number; j: number } | null = null;

        for (let ti = 0; ti < teams.length; ti++) {
            for (let tj = ti + 1; tj < teams.length; tj++) {
                const ai = fieldIdxs(ti);
                const bj = fieldIdxs(tj);
                for (const i of ai) {
                    for (const j of bj) {
                        // Swap hipotético
                        const tmp = teams[ti][i];
                        teams[ti][i] = teams[tj][j];
                        teams[tj][j] = tmp;

                        const delta = computeMultiQuality(teams, w).cost - base;

                        // Revertir
                        teams[tj][j] = teams[ti][i];
                        teams[ti][i] = tmp;

                        if (delta < bestDelta) {
                            bestDelta = delta;
                            best = { ti, tj, i, j };
                        }
                    }
                }
            }
        }

        if (best) {
            const { ti, tj, i, j } = best;
            const tmp = teams[ti][i];
            teams[ti][i] = teams[tj][j];
            teams[tj][j] = tmp;
            improved = true;
        }
    }
}

// ========================
// ALGORITMO DE BALANCEO
// ========================

/**
 * Balancea jugadores en N equipos equilibrados (multi-start + mejora local).
 *
 * 1. Genera `candidates` particiones greedy (cada una con un shuffle distinto).
 * 2. Refina cada candidato con hill climbing sobre la función de costo.
 * 3. Conserva el candidato de menor costo (corta antes si encuentra costo 0).
 * 4. Asigna id/nombre/color por defecto a cada equipo y construye warnings.
 */
export function balanceIntoTeams(
    players: Player[],
    numTeams: number,
    options: MultiBalanceOptions = {},
): MultiBalanceResult {
    validateNumTeams(numTeams, players.length);

    const { candidates = 100, weights = DEFAULT_WEIGHTS, rng = Math.random } = options;

    let bestTeams: Player[][] = [];
    let bestQuality: MultiBalanceQuality | null = null;
    let evaluated = 0;

    const runs = Math.max(1, Math.floor(candidates));
    for (let i = 0; i < runs; i++) {
        const candidate = greedyMultiCandidate(players, numTeams, rng);
        improveMultiBySwaps(candidate.teams, candidate.locked, weights);
        const q = computeMultiQuality(candidate.teams, weights);
        evaluated++;

        if (!bestQuality || q.cost < bestQuality.cost) {
            bestTeams = candidate.teams;
            bestQuality = q;
        }

        if (bestQuality.cost === 0) break; // balance perfecto
    }

    const quality: MultiBalanceQuality = { ...bestQuality!, candidatesEvaluated: evaluated };

    const teams: MultiTeam[] = bestTeams.map((teamPlayers, idx) => ({
        id: `T${idx + 1}`,
        name: `Equipo ${idx + 1}`,
        color: TEAM_PALETTE[idx] ?? "slate",
        players: teamPlayers,
    }));

    // ---- Warnings ----
    const warnings: string[] = [];
    const gkCount = players.filter((p) => p.positions?.includes("GK")).length;
    if (gkCount < numTeams) {
        warnings.push(`⚠️ Hay ${gkCount} arquero(s) para ${numTeams} equipos`);
    }
    if (quality.levelSpread > 2) {
        warnings.push(`⚠️ Diferencia de nivel entre equipos: ${quality.levelSpread} puntos`);
    }

    return { teams, warnings, quality };
}

/**
 * Calcula la calidad de N equipos YA formados (p. ej. tras drag-and-drop manual).
 * Análogo a `getBalanceQuality` del modo 2-equipos.
 */
export function getMultiTeamQuality(
    teams: MultiTeam[],
    weights: BalanceWeights = DEFAULT_WEIGHTS,
): MultiBalanceQuality {
    return computeMultiQuality(teams.map((t) => t.players), weights);
}

// ========================
// FIXTURES (round-robin)
// ========================

/** Id determinístico de un fixture. */
export function makeFixtureId(home: TeamId, away: TeamId): string {
    return `${home}_${away}`;
}

/**
 * Genera todos los enfrentamientos de un round-robin simple: C(N,2) fixtures.
 * N=3 → 3 fixtures; N=4 → 6 fixtures. Todos empiezan sin marcador (pendientes).
 */
export function generateFixtures(teams: MultiTeam[]): Fixture[] {
    const fixtures: Fixture[] = [];
    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            fixtures.push({
                id: makeFixtureId(teams[i].id, teams[j].id),
                home: teams[i].id,
                away: teams[j].id,
                scoreHome: null,
                scoreAway: null,
            });
        }
    }
    return fixtures;
}

/** Indica si todos los fixtures tienen marcador cargado. */
export function allFixturesPlayed(fixtures: Fixture[]): boolean {
    return fixtures.length > 0 && fixtures.every((f) => f.scoreHome != null && f.scoreAway != null);
}

/** Cantidad de fixtures aún sin marcador. */
export function pendingFixturesCount(fixtures: Fixture[]): number {
    return fixtures.filter((f) => f.scoreHome == null || f.scoreAway == null).length;
}

// ========================
// TABLA DE POSICIONES
// ========================

/**
 * Calcula la tabla de posiciones desde los fixtures. Pura y tolerante a fixtures
 * incompletos (los cuenta solo si tienen ambos marcadores → tabla provisional).
 * Orden: PTS → DIF → GF → orden de creación del equipo.
 */
export function computeStandings(teams: MultiTeam[], fixtures: Fixture[]): TeamStanding[] {
    const map = new Map<TeamId, TeamStanding>();
    teams.forEach((t) =>
        map.set(t.id, {
            teamId: t.id,
            played: 0, won: 0, drawn: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, position: 0,
        }),
    );

    for (const f of fixtures) {
        if (f.scoreHome == null || f.scoreAway == null) continue;
        const h = map.get(f.home);
        const a = map.get(f.away);
        if (!h || !a) continue;

        h.played++; a.played++;
        h.goalsFor += f.scoreHome; h.goalsAgainst += f.scoreAway;
        a.goalsFor += f.scoreAway; a.goalsAgainst += f.scoreHome;

        if (f.scoreHome > f.scoreAway) {
            h.won++; h.points += 3; a.lost++;
        } else if (f.scoreHome < f.scoreAway) {
            a.won++; a.points += 3; h.lost++;
        } else {
            h.drawn++; a.drawn++; h.points++; a.points++;
        }
    }

    const standings = [...map.values()];
    standings.forEach((s) => (s.goalDiff = s.goalsFor - s.goalsAgainst));

    const order = new Map(teams.map((t, i) => [t.id, i]));
    standings.sort(
        (x, y) =>
            y.points - x.points ||
            y.goalDiff - x.goalDiff ||
            y.goalsFor - x.goalsFor ||
            (order.get(x.teamId) ?? 0) - (order.get(y.teamId) ?? 0),
    );
    standings.forEach((s, i) => (s.position = i + 1));

    return standings;
}

/**
 * Devuelve el campeón (teamId de la posición 1) SOLO cuando todos los fixtures
 * tienen marcador. Antes de eso no hay campeón definitivo (solo líder provisional).
 */
export function getChampion(standings: TeamStanding[], allPlayed: boolean): TeamId | null {
    if (!allPlayed || standings.length === 0) return null;
    return standings[0].teamId;
}

// ========================
// RESULTADO DE SESIÓN (stats/XP)
// ========================

/**
 * Resultado de sesión de un equipo a partir del BALANCE NETO de sus fixtures:
 * W > L → victoria, W == L → empate, W < L → derrota. Ignora fixtures sin marcador.
 */
export function getTeamNetResult(teamId: TeamId, fixtures: Fixture[]): PlayerSessionResult {
    let won = 0;
    let lost = 0;
    for (const f of fixtures) {
        if (f.scoreHome == null || f.scoreAway == null) continue;
        if (f.home === teamId) {
            if (f.scoreHome > f.scoreAway) won++;
            else if (f.scoreHome < f.scoreAway) lost++;
        } else if (f.away === teamId) {
            if (f.scoreAway > f.scoreHome) won++;
            else if (f.scoreAway < f.scoreHome) lost++;
        }
    }
    if (won > lost) return "win";
    if (won < lost) return "loss";
    return "draw";
}

/**
 * Mapa uid → resultado de sesión para todos los jugadores con uid del torneo.
 * Cada jugador hereda el resultado neto de su equipo. Base para stats/XP.
 */
export function getPlayerSessionResults(
    tournament: Pick<MultiTeamTournament, "teams" | "fixtures">,
): Map<string, PlayerSessionResult> {
    const result = new Map<string, PlayerSessionResult>();
    for (const team of tournament.teams) {
        const r = getTeamNetResult(team.id, tournament.fixtures);
        for (const p of team.players) {
            if (p.uid) result.set(p.uid, r);
        }
    }
    return result;
}

// ========================
// ASIGNACIÓN (joins tardíos)
// ========================

/**
 * Asigna un jugador al equipo con MENOS jugadores (desempate: menor orden).
 * Devuelve una copia nueva de los equipos (pura). Usado por joins que ocurren
 * después de generar los equipos multi. Los fixtures no cambian.
 */
export function addPlayerToSmallestTeam(teams: MultiTeam[], player: Player): MultiTeam[] {
    if (teams.length === 0) return teams;
    let smallest = 0;
    for (let i = 1; i < teams.length; i++) {
        if (teams[i].players.length < teams[smallest].players.length) smallest = i;
    }
    return teams.map((t, i) =>
        i === smallest ? { ...t, players: [...t.players, player] } : t,
    );
}

/** Quita a un jugador (por uid o nombre) de todos los equipos. Pura. */
export function removePlayerFromTeams(teams: MultiTeam[], uidOrName: string): MultiTeam[] {
    return teams.map((t) => ({
        ...t,
        players: t.players.filter((p) => p.uid !== uidOrName && p.name !== uidOrName),
    }));
}

// ========================
// DISPONIBILIDAD / LÍMITES
// ========================

/** Máximo de equipos posible según la cantidad de confirmados. */
export function maxTeamsFor(confirmedCount: number): number {
    return Math.min(MAX_TEAMS, Math.floor(confirmedCount / MIN_PLAYERS_PER_TEAM));
}

/** Indica si se puede habilitar el modo multi-equipo con la convocatoria actual. */
export function canUseMultiTeam(confirmedCount: number): boolean {
    return confirmedCount >= MIN_CONFIRMED_FOR_MULTI && maxTeamsFor(confirmedCount) >= MIN_TEAMS;
}

/** Opciones de N válidas para un número de confirmados dado (p. ej. [3] o [3, 4]). */
export function validTeamCounts(confirmedCount: number): number[] {
    const max = maxTeamsFor(confirmedCount);
    const opts: number[] = [];
    for (let n = MIN_TEAMS; n <= max; n++) opts.push(n);
    return opts;
}

// ========================
// VALIDACIONES
// ========================

export function validateNumTeams(numTeams: number, playerCount: number): void {
    if (!Number.isInteger(numTeams)) {
        throw new ValidationError("El número de equipos debe ser un entero");
    }
    if (numTeams < MIN_TEAMS || numTeams > MAX_TEAMS) {
        throw new ValidationError(`El número de equipos debe estar entre ${MIN_TEAMS} y ${MAX_TEAMS}`);
    }
    if (playerCount < numTeams * MIN_PLAYERS_PER_TEAM) {
        throw new ValidationError(
            `Se necesitan al menos ${numTeams * MIN_PLAYERS_PER_TEAM} jugadores para ${numTeams} equipos`,
        );
    }
}

export function validateFixtureScore(score: unknown): asserts score is number {
    if (typeof score !== "number" || !Number.isInteger(score)) {
        throw new ValidationError("El marcador debe ser un número entero");
    }
    if (score < 0) {
        throw new ValidationError("El marcador no puede ser negativo");
    }
    if (score > 99) {
        throw new ValidationError("El marcador no puede superar 99");
    }
}
