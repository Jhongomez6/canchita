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
 * ESPECIFICACIÓN:
 * - 2 equipos: A y B
 * - Los arqueros se reparten primero (1 a cada equipo, extras al pool)
 * - Todos los demás jugadores se iteran juntos, ordenados por nivel desc
 * - Sistema de 3 prioridades para cada asignación:
 *     P1: Paridad numérica (siempre gana)
 *     P2: Balance de posición (desempata cuando tamaños iguales)
 *     P3: Balance de nivel (último desempate)
 * - Advertencia si hay 0 o 1 arquero
 * - Advertencia si la diferencia de nivel entre equipos es alta
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

export interface BalanceResult {
    teamA: Team;
    teamB: Team;
    warnings: string[];
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

/** Fisher-Yates shuffle — muta el array in-place y lo retorna */
function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ========================
// ALGORITMO DE BALANCEO
// ========================

/**
 * Balancea jugadores en 2 equipos equilibrados.
 *
 * Algoritmo:
 * 1. Separar arqueros → asignar 1 por equipo → extras al pool general
 * 2. Mujeres se distribuyen junto con el pool general (no como fase aparte)
 * 3. Pool general ordenado por nivel desc → Snake Draft con 3 prioridades
 * 4. Warnings: GKs faltantes + diferencia de nivel alta
 */
export function balanceTeams(players: Player[]): BalanceResult {
    const teamA: Team = { name: "Equipo A", players: [], score: 0 };
    const teamB: Team = { name: "Equipo B", players: [], score: 0 };
    const warnings: string[] = [];

    // ---- Helpers ----
    const addToTeam = (team: Team, player: Player) => {
        team.players.push(player);
        team.score += (player.level ?? 0);
    };

    const countPos = (team: Team, pos: Position) =>
        team.players.filter(p => p.positions?.includes(pos)).length;

    /**
     * getTargetTeam: Decide qué equipo recibe al siguiente jugador.
     *
     * P1: Paridad numérica (SIEMPRE gana — garantiza dif. máx. 1)
     * P2: Balance de posición (solo cuando tamaños son iguales)
     * P3: Balance de nivel / Snake Draft (último desempate)
     */
    const getTargetTeam = (pos?: Position) => {
        // P1: Paridad numérica — siempre gana
        if (teamA.players.length < teamB.players.length) return teamA;
        if (teamB.players.length < teamA.players.length) return teamB;

        // P2: Balance de posición (solo cuando tamaños son iguales)
        if (pos) {
            const posA = countPos(teamA, pos);
            const posB = countPos(teamB, pos);
            if (posA < posB) return teamA;
            if (posB < posA) return teamB;
        }

        // P3: Balance de nivel (Snake Draft)
        return teamA.score <= teamB.score ? teamA : teamB;
    };

    const used = new Set<string>();
    const playerKey = (p: Player) => p.id || p.name;

    // ---- Fase 1: Arqueros (máx. 1 por equipo, extras al pool) ----
    const gks = players.filter(p => p.positions?.includes("GK"))
        .sort((a, b) => b.level - a.level);

    // Asignar hasta 2 GKs (1 por equipo), el resto va al pool general
    const gksToAssign = gks.slice(0, 2);
    const gksExtra = gks.slice(2);

    if (gks.length === 0) {
        warnings.push("⚠️ No hay arqueros confirmados");
    } else if (gks.length === 1) {
        warnings.push("⚠️ Solo hay 1 arquero confirmado");
    }

    gksToAssign.forEach(gk => {
        addToTeam(getTargetTeam("GK"), gk);
        used.add(playerKey(gk));
    });

    // Marcar GKs extras como usados para la fase de GK, pero NO los marcamos
    // en 'used' — irán al pool general como jugadores de campo
    // (No hacemos nada aquí, simplemente no los agregamos a 'used')

    // ---- Fase 2: Pool general (todos los no-GK + GKs extras) ----
    // Shuffle primero para que jugadores del mismo nivel varíen entre ejecuciones,
    // luego sort estable por nivel desc → produce distribuciones diferentes cada vez
    const pool = shuffle(
        players.filter(p => !used.has(playerKey(p)))
    ).sort((a, b) => b.level - a.level);

    pool.forEach(p => {
        // Usar la posición primaria para el desempate de posición
        const primaryPos = p.positions?.[0];
        addToTeam(getTargetTeam(primaryPos), p);
    });

    // ---- Fase 3: Warnings adicionales ----
    const scoreDiff = Math.abs(teamA.score - teamB.score);
    if (scoreDiff > 2) {
        warnings.push(`⚠️ Diferencia de nivel entre equipos: ${scoreDiff} puntos`);
    }

    return { teamA, teamB, warnings };
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
