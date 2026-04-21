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
    lastPlayedWeek?: string;        // YYYY-MM-DD del lunes de la última semana con partido jugado
    unbeatenStreak?: number;        // Racha Invicto: partidos consecutivos sin perder (ganados + empatados)
    winStreak?: number;             // Racha de Victorias: partidos ganados consecutivos
    mvpStreak?: number;             // Racha MVP: premios MVP consecutivos
    // Habeas Data / Legal
    createdAt?: string;                // ISO date of profile creation (first login)
    authAcceptedVersion?: string;      // Version of Terms/Privacy accepted at first login
    // Team Admin Application
    applyCTADismissed?: boolean;        // El usuario descartó el banner de "Aplicar como Team Admin"
    // Feature flags
    walletEnabled?: boolean;           // Acceso a la billetera (feature flag por usuario)
    bookingEnabled?: boolean;          // Acceso al módulo de reservas (feature flag por usuario)
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
 * Devuelve la clave YYYY-MM-DD del lunes (hora local) de la semana calendario que
 * contiene `date`. Usa componentes locales para evitar shift de timezone UTC.
 */
export function getMonday(date: Date): string {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, "0");
    const d = String(monday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Calcula racha semanal desde un array de matches cerrados.
 * Racha semanal = cantidad de semanas calendario consecutivas en las que el usuario
 * jugó al menos 1 partido, contando desde la más reciente con ventana de gracia de 1 semana
 * (si la semana actual está vacía pero la anterior tuvo partido, la racha sigue vigente).
 *
 * @param matches - Array de matches cerrados del usuario (cualquier orden)
 * @param today - Fecha de referencia (default: hoy)
 */
export function calcWeeklyStreak(matches: Array<{ date: string }>, today: Date = new Date()): number {
    if (matches.length === 0) return 0;

    const weekSet = new Set<string>();
    matches.forEach(match => {
        weekSet.add(getMonday(new Date(match.date + "T12:00:00")));
    });

    const todayMondayKey = getMonday(today);
    const prevMondayDate = new Date(todayMondayKey + "T12:00:00");
    prevMondayDate.setDate(prevMondayDate.getDate() - 7);
    const prevMondayKey = getMonday(prevMondayDate);

    let startDate: Date;
    if (weekSet.has(todayMondayKey)) {
        startDate = new Date(todayMondayKey + "T12:00:00");
    } else if (weekSet.has(prevMondayKey)) {
        startDate = prevMondayDate;
    } else {
        return 0;
    }

    let streak = 0;
    const current = new Date(startDate);
    for (let i = 0; i < 1000; i++) {
        const key = getMonday(current);
        if (weekSet.has(key)) {
            streak++;
            current.setDate(current.getDate() - 7);
        } else {
            break;
        }
    }
    return streak;
}

/**
 * Aplica un partido jugado al estado previo de racha semanal.
 * Usado al cerrar un partido para actualizar weeklyStreak/lastPlayedWeek sin re-escanear historial.
 *
 * - Mismo lunes que lastPlayedWeek → sin cambios (segundo partido en la misma semana).
 * - lastPlayedWeek exactamente 7 días antes → streak + 1.
 * - Match anterior a lastPlayedWeek (cierre fuera de orden) → sin cambios (delegar a backfill).
 * - Cualquier otro caso → reset a 1.
 */
export function nextWeeklyStreak(
    prev: { weeklyStreak?: number; lastPlayedWeek?: string },
    matchDate: string,
): { weeklyStreak: number; lastPlayedWeek: string } {
    const monday = getMonday(new Date(matchDate + "T12:00:00"));
    const prevStreak = prev.weeklyStreak ?? 0;
    const last = prev.lastPlayedWeek;

    if (!last) {
        return { weeklyStreak: 1, lastPlayedWeek: monday };
    }
    if (monday === last) {
        return { weeklyStreak: prevStreak || 1, lastPlayedWeek: monday };
    }
    if (monday < last) {
        return { weeklyStreak: prevStreak, lastPlayedWeek: last };
    }
    const expectedPrevDate = new Date(monday + "T12:00:00");
    expectedPrevDate.setDate(expectedPrevDate.getDate() - 7);
    const expectedPrev = getMonday(expectedPrevDate);
    if (expectedPrev === last) {
        return { weeklyStreak: prevStreak + 1, lastPlayedWeek: monday };
    }
    return { weeklyStreak: 1, lastPlayedWeek: monday };
}

/**
 * Devuelve la racha semanal a mostrar en UI aplicando la ventana de gracia:
 * si el último partido jugado fue hace más de una semana calendario, la racha expiró → 0.
 */
export function getDisplayedWeeklyStreak(
    user: Pick<UserProfile, "weeklyStreak" | "lastPlayedWeek">,
    today: Date = new Date(),
): number {
    const streak = user.weeklyStreak ?? 0;
    if (streak <= 0 || !user.lastPlayedWeek) return 0;

    const todayMondayKey = getMonday(today);
    const prevMondayDate = new Date(todayMondayKey + "T12:00:00");
    prevMondayDate.setDate(prevMondayDate.getDate() - 7);
    const threshold = getMonday(prevMondayDate);
    return user.lastPlayedWeek >= threshold ? streak : 0;
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
 * Verifica si el usuario tiene acceso a la billetera.
 * Super admins siempre tienen acceso; otros usuarios requieren el flag walletEnabled.
 */
export function hasWalletAccess(profile: UserProfile): boolean {
    return isSuperAdmin(profile) || profile.walletEnabled === true;
}

/**
 * Verifica si el usuario tiene acceso al módulo de reservas.
 * Super admins siempre tienen acceso; otros usuarios requieren el flag bookingEnabled.
 */
export function hasBookingAccess(profile: UserProfile): boolean {
    return isSuperAdmin(profile) || profile.bookingEnabled === true;
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
 * Verifica si un admin puede configurar depósito en sus partidos.
 * Solo super_admin y location_admin pueden — team_admin no.
 * El dinero de depósitos va al admin de la plataforma (cuenta Wompi centralizada).
 */
export function canUseDeposit(profile: UserProfile): boolean {
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
