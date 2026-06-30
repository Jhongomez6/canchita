/**
 * ========================
 * TEAM DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Lógica pura del algoritmo de balanceo de equipos.
 * No depende de Firebase ni React.
 *
 * ESPECIFICACIÓN (v2 — Optimización Multi-objetivo):
 * - 2 equipos: A y B
 * - Los 2 mejores arqueros (por nivel) se reparten primero (1 a cada equipo,
 *   con orden de equipo aleatorio para no sesgar). Los GKs extra van al pool.
 * - El resto se reparte con un snake-draft greedy (paridad → posición → nivel).
 * - Se generan N candidatos (multi-start), cada uno refinado por una pasada de
 *   mejora local (hill climbing) que intercambia jugadores de campo si baja el
 *   costo. Se conserva el candidato de MENOR costo.
 * - Función de costo multi-objetivo: nivel + concentración de cracks +
 *   desbalance de posición + reparto de sexo (pesos configurables).
 * - El RNG es inyectable para tests deterministas.
 * - Advertencia si hay 0 o 1 arquero, o si la diferencia de nivel es alta.
 *
 * Garantías estructurales:
 * - Paridad numérica: diferencia máxima de 1 jugador entre equipos.
 * - 1 arquero por equipo cuando hay ≥ 2 GKs (los swaps no tocan a los arqueros).
 * - 100% puro: sin Firebase, sin React, determinista bajo un RNG fijo.
 */

import type { Player, Position } from "./player";

// ========================
// TIPOS
// ========================

export interface Team {
    name: string;
    players: Player[];
    score: number;
}

/** Pesos de cada término del costo. Mayor peso = criterio más prioritario. */
export interface BalanceWeights {
    level: number;    // diferencia de nivel total entre equipos
    star: number;     // diferencia de jugadores "crack" (nivel 4)
    position: number; // desbalance de posiciones primarias
    sex: number;      // diferencia de mujeres entre equipos
}

export const DEFAULT_WEIGHTS: BalanceWeights = {
    level: 10,   // prioridad máxima: nivel
    star: 6,     // luego: no concentrar cracks
    sex: 4,      // luego: repartir mujeres
    position: 3, // y repartir posiciones
};

export interface BalanceOptions {
    candidates?: number;      // multi-start (default 100)
    weights?: BalanceWeights; // default DEFAULT_WEIGHTS
    rng?: () => number;       // inyectable para tests (default Math.random)
}

export interface BalanceQuality {
    levelDiff: number;          // |scoreA - scoreB|
    starDiff: number;           // |cracksA - cracksB| (nivel 4)
    positionImbalance: number;  // Σ |primaryCountA(pos) - primaryCountB(pos)|
    sexDiff: number;            // |mujeresA - mujeresB|
    cost: number;               // costo ponderado total (menor = mejor)
    candidatesEvaluated: number;
}

export interface BalanceResult {
    teamA: Team;
    teamB: Team;
    warnings: string[];
    quality: BalanceQuality;
}

export interface TeamSummary {
    count: number;
    totalLevel: number;
    positionsCount: Record<Position, number>;
}

// ========================
// HELPERS
// ========================

/** Orden de posición para display: GK → DEF → MID → FWD */
const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

/** Nivel saneado al rango válido [0..4]. 0 representa nivel ausente. */
const levelOf = (p: Player): number => {
    const n = p.level ?? 0;
    return n < 0 ? 0 : n > 4 ? 4 : n;
};

const isCrack = (p: Player) => levelOf(p) >= 4;
const isFemale = (p: Player) => p.sex === "F";
const primaryPosOf = (p: Player): Position => p.positions?.[0] ?? "MID";
const playerKey = (p: Player) => p.id || p.name;

/** Fisher-Yates shuffle con RNG inyectable — muta el array in-place y lo retorna */
function shuffle<T>(arr: T[], rng: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ========================
// FUNCIÓN DE COSTO
// ========================

/**
 * Costo multi-objetivo de una partición. Menor es mejor; `cost === 0` ⇒ balance
 * perfecto en los cuatro criterios. Opera sobre arrays planos (sin score cacheado)
 * para evitar desincronización durante la optimización.
 */
function computeQuality(a: Player[], b: Player[], w: BalanceWeights): BalanceQuality {
    const scoreA = a.reduce((s, p) => s + levelOf(p), 0);
    const scoreB = b.reduce((s, p) => s + levelOf(p), 0);

    const levelDiff = Math.abs(scoreA - scoreB);
    const starDiff = Math.abs(a.filter(isCrack).length - b.filter(isCrack).length);
    const sexDiff = Math.abs(a.filter(isFemale).length - b.filter(isFemale).length);
    const positionImbalance = POSITIONS.reduce((sum, pos) =>
        sum + Math.abs(
            a.filter(p => primaryPosOf(p) === pos).length -
            b.filter(p => primaryPosOf(p) === pos).length), 0);

    const cost =
        w.level * levelDiff +
        w.star * starDiff +
        w.position * positionImbalance +
        w.sex * sexDiff;

    return { levelDiff, starDiff, positionImbalance, sexDiff, cost, candidatesEvaluated: 0 };
}

// ========================
// GENERACIÓN DE CANDIDATOS
// ========================

interface Candidate {
    a: Player[];
    b: Player[];
    /** Keys de los arqueros titulares — bloqueados ante swaps para preservar 1 GK/equipo. */
    locked: Set<string>;
}

/**
 * Un candidato: snake-draft greedy con shuffle + orden de GK aleatorio.
 *
 * P1: Paridad numérica (SIEMPRE gana — garantiza dif. máx. 1)
 * P2: Balance de posición primaria (solo cuando tamaños son iguales)
 * P3: Balance de nivel; desempate final aleatorio (sin sesgo hacia A)
 */
function greedyCandidate(players: Player[], rng: () => number): Candidate {
    const a: Player[] = [];
    const b: Player[] = [];
    let scoreA = 0;
    let scoreB = 0;
    const locked = new Set<string>();

    const countPrimary = (team: Player[], pos: Position) =>
        team.filter(p => primaryPosOf(p) === pos).length;

    const target = (pos?: Position): "a" | "b" => {
        // P1: Paridad numérica — siempre gana
        if (a.length < b.length) return "a";
        if (b.length < a.length) return "b";

        // P2: Balance de posición (solo cuando tamaños son iguales)
        if (pos) {
            const pa = countPrimary(a, pos);
            const pb = countPrimary(b, pos);
            if (pa < pb) return "a";
            if (pb < pa) return "b";
        }

        // P3: Balance de nivel; desempate aleatorio
        if (scoreA < scoreB) return "a";
        if (scoreB < scoreA) return "b";
        return rng() < 0.5 ? "a" : "b";
    };

    const add = (p: Player, pos?: Position) => {
        if (target(pos) === "a") { a.push(p); scoreA += levelOf(p); }
        else { b.push(p); scoreB += levelOf(p); }
    };

    // ---- Fase 1: Arqueros — los 2 mejores por nivel, orden de equipo barajado ----
    const gks = players
        .filter(p => p.positions?.includes("GK"))
        .sort((x, y) => levelOf(y) - levelOf(x));

    shuffle(gks.slice(0, 2), rng).forEach(gk => {
        add(gk, "GK");
        locked.add(playerKey(gk));
    });

    // ---- Fase 2: Pool general (resto, incluidos GKs extra) ----
    // Shuffle para variar entre ejecuciones, luego sort estable por nivel desc.
    const pool = shuffle(
        players.filter(p => !locked.has(playerKey(p))),
        rng,
    ).sort((x, y) => levelOf(y) - levelOf(x));

    pool.forEach(p => add(p, primaryPosOf(p)));

    return { a, b, locked };
}

/**
 * Mejora local (hill climbing): aplica repetidamente el intercambio de un jugador
 * de campo de A por uno de B que más reduzca el costo, hasta que ningún swap mejore.
 *
 * Solo intercambia jugadores NO bloqueados (de campo) ⇒ preserva la paridad numérica
 * y la distribución de arqueros. Acepta únicamente mejoras estrictas ⇒ siempre termina.
 */
function improveBySwaps(c: Candidate, w: BalanceWeights): void {
    const EPS = 1e-9;
    const idxs = (team: Player[]) =>
        team.reduce<number[]>((acc, p, i) => {
            if (!c.locked.has(playerKey(p))) acc.push(i);
            return acc;
        }, []);

    let improved = true;
    while (improved) {
        improved = false;
        const base = computeQuality(c.a, c.b, w).cost;
        let bestDelta = -EPS;
        let best: { i: number; j: number } | null = null;

        const aIdx = idxs(c.a);
        const bIdx = idxs(c.b);

        for (const i of aIdx) {
            for (const j of bIdx) {
                // Swap hipotético
                const tmp = c.a[i];
                c.a[i] = c.b[j];
                c.b[j] = tmp;

                const delta = computeQuality(c.a, c.b, w).cost - base;

                // Revertir
                c.b[j] = c.a[i];
                c.a[i] = tmp;

                if (delta < bestDelta) {
                    bestDelta = delta;
                    best = { i, j };
                }
            }
        }

        if (best) {
            const tmp = c.a[best.i];
            c.a[best.i] = c.b[best.j];
            c.b[best.j] = tmp;
            improved = true;
        }
    }
}

// ========================
// ALGORITMO DE BALANCEO
// ========================

/**
 * Balancea jugadores en 2 equipos equilibrados (multi-start + mejora local).
 *
 * 1. Genera `candidates` particiones greedy (cada una con un shuffle distinto).
 * 2. Refina cada candidato con hill climbing sobre la función de costo.
 * 3. Conserva el candidato de menor costo (corta antes si encuentra costo 0).
 * 4. Construye warnings (GKs faltantes + diferencia de nivel alta).
 *
 * El greedy de la v1 es uno de los candidatos posibles ⇒ la calidad nunca empeora.
 */
export function balanceTeams(players: Player[], options: BalanceOptions = {}): BalanceResult {
    const { candidates = 100, weights = DEFAULT_WEIGHTS, rng = Math.random } = options;

    let bestA: Player[] = [];
    let bestB: Player[] = [];
    let bestQuality: BalanceQuality | null = null;
    let evaluated = 0;

    const runs = Math.max(1, Math.floor(candidates));
    for (let i = 0; i < runs; i++) {
        const candidate = greedyCandidate(players, rng);
        improveBySwaps(candidate, weights);
        const q = computeQuality(candidate.a, candidate.b, weights);
        evaluated++;

        if (!bestQuality || q.cost < bestQuality.cost) {
            bestA = candidate.a;
            bestB = candidate.b;
            bestQuality = q;
        }

        if (bestQuality.cost === 0) break; // balance perfecto: no hay nada mejor
    }

    const quality: BalanceQuality = { ...bestQuality!, candidatesEvaluated: evaluated };

    const teamA: Team = {
        name: "Equipo A",
        players: bestA,
        score: bestA.reduce((s, p) => s + levelOf(p), 0),
    };
    const teamB: Team = {
        name: "Equipo B",
        players: bestB,
        score: bestB.reduce((s, p) => s + levelOf(p), 0),
    };

    // ---- Warnings ----
    const warnings: string[] = [];
    const gkCount = players.filter(p => p.positions?.includes("GK")).length;
    if (gkCount === 0) {
        warnings.push("⚠️ No hay arqueros confirmados");
    } else if (gkCount === 1) {
        warnings.push("⚠️ Solo hay 1 arquero confirmado");
    }
    if (quality.levelDiff > 2) {
        warnings.push(`⚠️ Diferencia de nivel entre equipos: ${quality.levelDiff} puntos`);
    }

    return { teamA, teamB, warnings, quality };
}

/**
 * Ordena los jugadores de un equipo para mostrar en la UI.
 * Orden: posición (GK → DEF → MID → FWD) y luego nivel descendente.
 */
export function sortTeamForDisplay(players: Player[]): Player[] {
    return [...players].sort((a, b) => {
        const posA = POSITION_ORDER[a.positions?.[0] ?? 'FWD'] ?? 99;
        const posB = POSITION_ORDER[b.positions?.[0] ?? 'FWD'] ?? 99;
        if (posA !== posB) return posA - posB;
        return b.level - a.level;
    });
}

/**
 * Calcula la calidad de balanceo de dos equipos YA formados, según los mismos
 * criterios que usa `balanceTeams`. Útil para la UI (mostrar la calidad en vivo,
 * incluso tras ediciones manuales con drag-and-drop) y para analytics.
 *
 * `candidatesEvaluated` no aplica en este contexto (se devuelve 0).
 */
export function getBalanceQuality(
    teamA: Player[],
    teamB: Player[],
    weights: BalanceWeights = DEFAULT_WEIGHTS,
): BalanceQuality {
    return computeQuality(teamA, teamB, weights);
}

/**
 * Calcula un resumen de un equipo (conteo, nivel total, posiciones).
 */
export function getTeamSummary(players: Player[]): TeamSummary {
    const totalLevel = players.reduce(
        (sum, p) => sum + (p.level ?? 0),
        0
    );

    const positionsCount: Record<Position, number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
    };

    players.forEach((p) => {
        p.positions?.forEach((pos) => {
            positionsCount[pos]++;
        });
    });

    return {
        count: players.length,
        totalLevel,
        positionsCount,
    };
}
