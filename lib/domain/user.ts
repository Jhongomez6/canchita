/**
 * ========================
 * USER DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Modelo de dominio para usuarios/perfiles.
 *
 * ESPECIFICACIÓN:
 * - Roles: "admin" o "player"
 * - Posiciones: entre 1 y 2 (requeridas para jugadores)
 * - Estadísticas: partidos jugados, ganados, perdidos, empatados
 */

import type { Position } from "./player";

// ========================
// TIPOS
// ========================

export type UserRole = "admin" | "player";

export interface UserProfile {
    uid: string;
    name: string;
    role: UserRole;
    positions: Position[];
    level?: number;
    notificationsEnabled?: boolean;
    fcmTokens?: string[];
    stats?: UserStats;
}

export interface UserStats {
    played: number;
    won: number;
    lost: number;
    draw: number;
}

// ========================
// REGLAS DE NEGOCIO
// ========================

/**
 * Verifica si un perfil tiene rol de admin.
 */
export function isAdmin(profile: UserProfile): boolean {
    return profile.role === "admin";
}

/**
 * Verifica si un perfil está completo (tiene posiciones seleccionadas).
 * Regla: Los jugadores deben tener al menos 1 posición.
 */
export function isProfileComplete(profile: UserProfile): boolean {
    if (profile.role === "admin") return true;
    return profile.positions.length > 0;
}
