/**
 * ========================
 * PLAYER DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Modelo de dominio para jugadores.
 * Centraliza el tipo Position y las validaciones de jugadores.
 *
 * ESPECIFICACIÓN:
 * - Posiciones permitidas: GK, DEF, MID, FWD
 * - Máximo 2 posiciones por jugador
 * - Nivel entre 1 y 3
 * - Nombre obligatorio, mínimo 2 caracteres
 */

import { ValidationError } from "./errors";

// ========================
// TIPOS Y CONSTANTES
// ========================

export type Position = "GK" | "DEF" | "MID" | "FWD";

export const ALLOWED_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export const POSITION_LABELS: Record<Position, string> = {
    GK: "Portero",
    DEF: "Defensa",
    MID: "Medio",
    FWD: "Delantero",
};

export const POSITION_ICONS: Record<Position, string> = {
    GK: "🧤",
    DEF: "🛡️",
    MID: "⚙️",
    FWD: "⚡",
};

export type PlayerLevel = 1 | 2 | 3;

export type AttendanceStatus = "present" | "late" | "no_show";

export interface Player {
    id?: string;
    uid?: string;
    name: string;
    level: PlayerLevel;
    positions: Position[];
    confirmed: boolean;
    attendance?: AttendanceStatus;
    isWaitlist?: boolean;
    waitlistJoinedAt?: string;
}

// ========================
// VALIDACIONES
// ========================

/**
 * Valida el nombre de un jugador.
 * Regla: Obligatorio, mínimo 2 caracteres.
 */
export function validatePlayerName(name: string): void {
    if (!name || typeof name !== "string") {
        throw new ValidationError("El nombre del jugador es obligatorio");
    }

    if (name.trim().length < 2) {
        throw new ValidationError(
            "El nombre del jugador debe tener al menos 2 caracteres"
        );
    }
}

/**
 * Valida el nivel de un jugador.
 * Regla: Entre 1 y 3.
 */
export function validateLevel(level: number): void {
    if (level < 1 || level > 3) {
        throw new ValidationError("El nivel debe ser 1, 2, o 3");
    }
}

/**
 * Valida las posiciones de un jugador.
 * Regla: Entre 1 y 2 posiciones, sin duplicados, solo posiciones permitidas.
 */
export function validatePositions(positions: Position[]): void {
    if (!Array.isArray(positions)) {
        throw new ValidationError("Las posiciones deben ser un array");
    }

    if (positions.length < 1) {
        throw new ValidationError("Debe tener al menos 1 posición");
    }

    if (positions.length > 2) {
        throw new ValidationError("Puede tener máximo 2 posiciones");
    }

    const unique = new Set(positions);
    if (unique.size !== positions.length) {
        throw new ValidationError("No se permiten posiciones duplicadas");
    }

    for (const pos of positions) {
        if (!ALLOWED_POSITIONS.includes(pos)) {
            throw new ValidationError(
                `Posición inválida: ${pos}. Permitidas: ${ALLOWED_POSITIONS.join(", ")}`
            );
        }
    }
}
