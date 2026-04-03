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
 * - Admin Tiers: super_admin, location_admin, team_admin
 * - Posiciones: entre 1 y 2 (requeridas para jugadores)
 * - Estadísticas: partidos jugados, ganados, perdidos, empatados
 * - Rating inicial: calculado en onboarding (Cold Start)
 * - Location scoping: admins location/team solo operan en locations asignadas
 */

import type { Position } from "./player";
import type { Sex, Foot, CourtSize, TechLevel, PhysLevel, Frequency } from "./rating";

// ========================
// TIPOS
// ========================

export type UserRole = "admin" | "player";
export type AdminType = "super_admin" | "location_admin" | "team_admin";

export interface UserProfile {
    uid: string;
    name: string;
    email?: string;
    photoURL?: string;
    originalGoogleName?: string;
    roles: UserRole[];
    positions: Position[];
    primaryPosition?: Position;
    level?: number;
    notificationsEnabled?: boolean;
    fcmTokens?: string[];
    lastTokenPrefix?: string;
    stats?: UserStats;
    phone?: string;
    // Admin Tier System
    adminType?: AdminType;             // Tier del admin (solo relevante si roles incluye "admin")
    assignedLocationIds?: string[];    // IDs de locations donde puede operar (location/team admins)
    // Onboarding
    initialRatingCalculated?: boolean;
    onboardingCompletedAt?: string;
    rating?: number;
    nameLastChanged?: string;
    age?: number;
    sex?: Sex;
    dominantFoot?: Foot;
    preferredCourt?: CourtSize;
    techLevel?: TechLevel;
    physLevel?: PhysLevel;
    hasSchool?: boolean;
    hasTournaments?: boolean;
    frequency?: Frequency;
    mvpAwards?: number;
    // Habeas Data / Legal
    createdAt?: string;                // ISO date of profile creation (first login)
    authAcceptedVersion?: string;      // Version of Terms/Privacy accepted at first login
    // Soft-anonymization (set on account deletion — personal data wiped, traza conservada)
    deleted?: boolean;
    deletedAt?: string;                // ISO date of anonymization
}

export interface UserStats {
    played: number;
    won: number;
    lost: number;
    draw: number;
    lateArrivals?: number;
    noShows?: number;
    commitmentScore?: number; // 0-100
}

// ========================
// REGLAS DE NEGOCIO
// ========================

/**
 * Calcula el Commitment Score (COM) en display a partir de las stats del jugador.
 *
 * Fórmula: Math.max(0, Math.min(99, 99 - noShows×20 - lateArrivals×6 + played))
 *
 * - Base: 99 puntos
 * - No-show: -20 (no recupera)
 * - Late arrival: -6 netos (-5 penalización + no aporta el +1 de recuperación)
 * - Presente a tiempo: +1 recuperación (played excluye no-shows)
 *
 * No se almacena en Firestore — siempre computado desde noShows, lateArrivals y played.
 */
export function calcCommitmentScore(stats: Pick<UserStats, "noShows" | "lateArrivals" | "played">): number {
    const noShows = stats.noShows ?? 0;
    const lateArrivals = stats.lateArrivals ?? 0;
    const played = stats.played ?? 0;
    return Math.max(0, Math.min(99, 99 - noShows * 20 - lateArrivals * 6 + played));
}

/**
 * Verifica si un perfil tiene rol de admin (cualquier tier).
 */
export function isAdmin(profile: UserProfile): boolean {
    return profile.roles.includes("admin");
}

/**
 * Verifica si un perfil es Super Admin (control total de la plataforma).
 */
export function isSuperAdmin(profile: UserProfile): boolean {
    return isAdmin(profile) && profile.adminType === "super_admin";
}

/**
 * Verifica si un perfil es Location Admin (dueño de cancha).
 * Puede crear partidos públicos y privados en sus locations asignadas.
 */
export function isLocationAdmin(profile: UserProfile): boolean {
    return isAdmin(profile) && profile.adminType === "location_admin";
}

/**
 * Verifica si un perfil es Team Admin (organizador de equipo amateur).
 * Solo puede crear partidos privados en sus locations asignadas.
 * Puede ser Player simultáneamente.
 */
export function isTeamAdmin(profile: UserProfile): boolean {
    return isAdmin(profile) && profile.adminType === "team_admin";
}

/**
 * Verifica si un admin puede crear partidos públicos.
 * Solo super_admin y location_admin pueden.
 */
export function canCreatePublicMatch(profile: UserProfile): boolean {
    return isSuperAdmin(profile) || isLocationAdmin(profile);
}

/**
 * Verifica si un admin puede operar en una location específica.
 * Super Admin puede operar en cualquier location.
 * Location/Team Admin solo en sus locations asignadas.
 */
export function canManageLocation(profile: UserProfile, locationId: string): boolean {
    if (isSuperAdmin(profile)) return true;
    return profile.assignedLocationIds?.includes(locationId) ?? false;
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
