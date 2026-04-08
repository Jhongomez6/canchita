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
    photoURLThumb?: string;     // 96×96 WebP — avatares pequeños
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
    commitmentStreak?: number;      // Racha de Compromiso: partidos consecutivos siendo puntual (sin late, sin no_show). Se resetea con cualquier falta
    weeklyStreak?: number;          // Racha Semanal: semanas consecutivas con al menos 1 partido jugado
    unbeatenStreak?: number;        // Racha Invicto: partidos consecutivos sin perder (ganados + empatados)
    winStreak?: number;             // Racha de Victorias: partidos ganados consecutivos
    mvpStreak?: number;             // Racha MVP: premios MVP consecutivos
    // Habeas Data / Legal
    createdAt?: string;                // ISO date of profile creation (first login)
    authAcceptedVersion?: string;      // Version of Terms/Privacy accepted at first login
    // Team Admin Application
    applyCTADismissed?: boolean;        // El usuario descartó el banner de "Aplicar como Team Admin"
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
 * Calcula racha semanal desde un array de matches cerrados.
 * Racha semanal = cantidad de semanas calendario consecutivas (hacia atrás desde hoy)
 * en las que el usuario jugó al menos 1 partido.
 *
 * @param matches - Array de matches cerrados del usuario, ordenados descendente por fecha
 * @returns Número de semanas consecutivas con al menos 1 partido
 */
export function calcWeeklyStreak(matches: Array<{ date: string }>): number {
    if (matches.length === 0) return 0;

    // Agrupar matches por semana calendario (lun-dom)
    const weekMap = new Map<string, boolean>();

    matches.forEach(match => {
        const date = new Date(match.date);
        // Calcular el lunes de esa semana
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Ajustar a lunes
        const monday = new Date(date.setDate(diff));
        const weekKey = monday.toISOString().split('T')[0]; // YYYY-MM-DD del lunes
        weekMap.set(weekKey, true);
    });

    // Obtener semanas únicas ordenadas descendente
    const weeks = Array.from(weekMap.keys()).sort().reverse();

    if (weeks.length === 0) return 0;

    // Contar desde la semana más reciente hacia atrás hasta encontrar un hueco
    let streak = 0;
    const today = new Date();
    const todayMonday = new Date(today);
    const todayDay = todayMonday.getDay();
    const todayDiff = todayMonday.getDate() - todayDay + (todayDay === 0 ? -6 : 1);
    todayMonday.setDate(todayDiff);
    // Empezar desde esta semana y contar hacia atrás
    const currentWeekDate = new Date(todayMonday);

    for (let i = 0; i < 1000; i++) { // Límite de seguridad
        const weekKey = currentWeekDate.toISOString().split('T')[0];
        if (weekMap.has(weekKey)) {
            streak++;
            currentWeekDate.setDate(currentWeekDate.getDate() - 7);
        } else {
            break;
        }
    }

    return streak;
}

/**
 * Calcula racha invicto (sin perder): partidos ganados + empatados consecutivos.
 * Cuenta desde el partido más reciente hacia atrás hasta encontrar la primera derrota.
 *
 * @param matches - Array de matches cerrados del usuario con resultado (won, draw, lost), ordenados descendente por fecha
 * @returns Número de partidos consecutivos sin perder (ganados + empatados)
 */
export function calcUnbeatableStreak(matches: Array<{ won?: boolean; draw?: boolean; lost?: boolean }>): number {
    if (matches.length === 0) return 0;

    let streak = 0;
    for (const match of matches) {
        if (match.lost) {
            break;
        }
        if (match.won || match.draw) {
            streak++;
        }
    }
    return streak;
}

/**
 * Calcula racha de victorias: partidos ganados consecutivos.
 * Cuenta desde el partido más reciente hacia atrás hasta encontrar un no-win.
 *
 * @param matches - Array de matches cerrados del usuario con resultado (won), ordenados descendente por fecha
 * @returns Número de partidos ganados consecutivos
 */
export function calcWinStreak(matches: Array<{ won?: boolean }>): number {
    if (matches.length === 0) return 0;

    let streak = 0;
    for (const match of matches) {
        if (match.won) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

/**
 * Calcula racha MVP: premios MVP consecutivos desde el más reciente.
 * Requiere info de qué partidos tuvo MVP (se calcula al cerrar match).
 *
 * @param matches - Array de matches cerrados del usuario con flag mvp, ordenados descendente por fecha
 * @returns Número de partidos consecutivos con MVP
 */
export function calcMvpStreak(matches: Array<{ mvp?: boolean }>): number {
    if (matches.length === 0) return 0;

    let streak = 0;
    for (const match of matches) {
        if (match.mvp) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
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
