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
 * - Los arqueros se reparten primero (1 a cada equipo)
 * - Los demás jugadores se asignan al equipo con menor nivel total
 * - Se asignan por posición: DEF → MID → FWD → restantes
 * - Advertencia si hay 0 o 1 arquero
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
// ALGORITMO DE BALANCEO
// ========================

/**
 * Balancea jugadores en 2 equipos equilibrados.
 *
 * Algoritmo:
 * 1. Separar arqueros del resto
 * 2. Asignar 1 arquero a cada equipo (si hay ≥2)
 * 3. Asignar cada grupo de posición al equipo más débil
 * 4. Asignar comodines restantes al equipo más débil
 */
export function balanceTeams(players: Player[]): BalanceResult {
    const teamA: Team = { name: "Equipo A", players: [], score: 0 };
    const teamB: Team = { name: "Equipo B", players: [], score: 0 };
    const warnings: string[] = [];

    // ---- Helpers ----
    const addToTeam = (team: Team, player: Player) => {
        team.players.push(player);
        team.score += player.level;
    };

    const weakerTeam = () =>
        teamA.score <= teamB.score ? teamA : teamB;

    const teamLessWomen = () => {
        const womenA = teamA.players.filter(p => p.sex === 'F').length;
        const womenB = teamB.players.filter(p => p.sex === 'F').length;
        if (womenA < womenB) return teamA;
        if (womenB < womenA) return teamB;
        // Si tienen la misma cantidad de mujeres, lo mandamos al equipo más débil
        return weakerTeam();
    };

    // ---- 1. Arqueros ----
    const gks = players.filter(
        (p) => p.positions && p.positions.includes("GK")
    );

    const rest = players.filter(
        (p) => !p.positions || !p.positions.includes("GK")
    );

    if (gks.length >= 2) {
        addToTeam(teamA, gks[0]);
        addToTeam(teamB, gks[1]);

        gks.slice(2).forEach((gk) => addToTeam(weakerTeam(), gk));
    } else if (gks.length === 1) {
        addToTeam(weakerTeam(), gks[0]);
        warnings.push("⚠️ Solo hay 1 arquero confirmado");
    } else {
        warnings.push("⚠️ No hay arqueros confirmados");
    }

    // ---- 2. Mujeres (1:1 Distribution) ----
    const women = rest.filter(p => p.sex === 'F')
        .sort((a, b) => b.level - a.level); // Ordenamos de mayor a menor nivel

    const used = new Set<string>();
    const playerKey = (p: Player) => p.id ?? p.name;

    women.forEach((woman) => {
        if (used.has(playerKey(woman))) return;
        addToTeam(teamLessWomen(), woman);
        used.add(playerKey(woman));
    });

    // ---- 3. Resto de jugadores (Hombres / No definidos) por posición ----
    const remainingMen = rest.filter(p => !used.has(playerKey(p)));

    const byPosition = (pos: Position) =>
        remainingMen
            .filter((p) => p.positions?.includes(pos))
            .sort((a, b) => b.level - a.level);

    const assignGroup = (groupPlayers: Player[]) => {
        groupPlayers.forEach((p) => {
            if (used.has(playerKey(p))) return;
            addToTeam(weakerTeam(), p);
            used.add(playerKey(p));
        });
    };

    assignGroup(byPosition("DEF"));
    assignGroup(byPosition("MID"));
    assignGroup(byPosition("FWD"));

    // ---- 4. Restantes (comodines) ----
    remainingMen.forEach((p) => {
        if (used.has(playerKey(p))) return;
        addToTeam(weakerTeam(), p);
    });

    return { teamA, teamB, warnings };
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
