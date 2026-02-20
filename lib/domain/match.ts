/**
 * ========================
 * MATCH DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Modelo de dominio para partidos.
 * Tipos, reglas de negocio puras y validaciones.
 *
 * ESPECIFICACIÓN:
 * - Un partido tiene fecha, hora, ubicación, jugadores y estado
 * - maxPlayers define el límite de jugadores confirmados
 * - Status: "open" o "closed"
 * - Los equipos se generan cuando el admin balancea
 */

import { ValidationError } from "./errors";
import type { Player } from "./player";
import type { Guest } from "./guest";
import type { LocationSnapshot } from "./location";

// ========================
// TIPOS
// ========================

export type MatchStatus = "open" | "closed";

export interface Match {
    id: string;
    date: string;
    time: string;
    startsAt?: any; // Firestore Timestamp
    locationId: string;
    locationSnapshot: LocationSnapshot;
    createdBy: string;
    maxPlayers: number;
    status: MatchStatus;
    players: Player[];
    guests?: Guest[];
    teams?: { A: Player[]; B: Player[] };
    score?: { A: number; B: number };
    statsProcessed?: boolean;
    previousScore?: { A: number; B: number };
}

export interface CreateMatchInput {
    date: string;
    time: string;
    locationId: string;
    locationSnapshot: LocationSnapshot;
    createdBy: string;
    maxPlayers: number;
}

export type MatchResult = "win" | "loss" | "draw";

// ========================
// REGLAS DE NEGOCIO
// ========================

/**
 * Cuenta los jugadores confirmados en un partido.
 */
export function getConfirmedCount(players: Player[]): number {
    return players.filter((p) => p.confirmed).length;
}

/**
 * Verifica si un partido está lleno.
 * Regla: confirmados >= maxPlayers.
 */
export function isMatchFull(
    players: Player[],
    maxPlayers: number,
    guestCount: number = 0
): boolean {
    const confirmedCount = getConfirmedCount(players);
    return confirmedCount + guestCount >= maxPlayers;
}

/**
 * Verifica si un jugador ya está en el partido (por UID o nombre).
 */
export function isPlayerInMatch(
    players: Player[],
    uid: string,
    name: string
): boolean {
    return players.some(
        (p) => (p.uid && p.uid === uid) || p.name === name
    );
}

/**
 * Determina el resultado de un equipo dado los scores.
 */
export function determineMatchResult(
    myScore: number,
    opponentScore: number
): MatchResult {
    if (myScore > opponentScore) return "win";
    if (myScore < opponentScore) return "loss";
    return "draw";
}

// ========================
// VALIDACIONES
// ========================

/**
 * Valida los datos de creación de un partido.
 */
export function validateMatchCreation(data: CreateMatchInput): void {
    if (!data.date) {
        throw new ValidationError("La fecha es obligatoria");
    }

    if (!data.time) {
        throw new ValidationError("La hora es obligatoria");
    }

    if (!data.locationId) {
        throw new ValidationError("La ubicación es obligatoria");
    }

    if (!data.createdBy) {
        throw new ValidationError("El creador es obligatorio");
    }

    if (!data.maxPlayers || data.maxPlayers < 2) {
        throw new ValidationError("El partido debe tener al menos 2 jugadores");
    }
}
