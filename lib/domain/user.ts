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
 * - Roles: array de "admin" y/o "player" (multi-rol)
 * - Posiciones: entre 1 y 2 (requeridas para jugadores)
 * - Estadísticas: partidos jugados, ganados, perdidos, empatados
 * - Rating inicial: calculado en onboarding (Cold Start)
 */

import type { Position } from "./player";
import type { Sex, Foot, CourtSize, TechLevel, PhysLevel, Frequency } from "./rating";

// ========================
// TIPOS
// ========================

export type UserRole = "admin" | "player";

export interface UserProfile {
    uid: string;
    name: string;
    roles: UserRole[];
    positions: Position[];
    level?: number;
    notificationsEnabled?: boolean;
    fcmTokens?: string[];
    stats?: UserStats;
    // Onboarding
    initialRatingCalculated?: boolean;
    onboardingCompletedAt?: string;
    rating?: number;
    age?: number;
    sex?: Sex;
    dominantFoot?: Foot;
    preferredCourt?: CourtSize;
    techLevel?: TechLevel;
    physLevel?: PhysLevel;
    hasSchool?: boolean;
    hasTournaments?: boolean;
    frequency?: Frequency;
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
    return profile.roles.includes("admin");
}

/**
 * Verifica si un perfil tiene rol de player.
 */
export function isPlayer(profile: UserProfile): boolean {
    return profile.roles.includes("player");
}

/**
 * Verifica si un perfil está completo (tiene posiciones seleccionadas).
 * Regla: Los jugadores deben tener al menos 1 posición.
 * Si solo es admin (sin rol player), se considera completo.
 */
export function isProfileComplete(profile: UserProfile): boolean {
    if (!profile.roles.includes("player")) return true;
    return profile.positions.length > 0;
}
