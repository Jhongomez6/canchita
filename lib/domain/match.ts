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
 * - El formato (Fútbol X) se limita a un máximo de Fútbol 11
 */

import { ValidationError } from "./errors";
import { REFUND_DEADLINE_MS } from "./wallet";
import type { Player } from "./player";
import type { Guest } from "./guest";
import type { LocationSnapshot } from "./location";
import type { AdminType, UserProfile } from "./user";
import { isSuperAdmin, isLocationAdmin } from "./user";

// ========================
// TIPOS
// ========================

export type MatchStatus = "open" | "closed";

export type MatchDuration = 30 | 60 | 90 | 120 | 150 | 180;

export interface Match {
    id: string;
    date: string;
    time: string;
    duration?: MatchDuration; // Duración en minutos (30-180, tramos de 30)
    startsAt?: { seconds: number; nanoseconds: number; toDate?(): Date }; // Firestore Timestamp
    locationId: string;
    locationSnapshot: LocationSnapshot;
    createdBy: string;
    maxPlayers: number;
    status: MatchStatus;
    allowGuests?: boolean;
    players: Player[];
    guests?: Guest[];
    teams?: { A: Player[]; B: Player[] };
    teamsConfirmed?: boolean; // true cuando el admin publica los equipos
    teamsConfirmedAt?: string; // ISO string del momento de confirmación
    score?: { A: number; B: number };
    statsProcessed?: boolean;
    previousScore?: { A: number; B: number };
    mvpVotes?: Record<string, string>; // { voterId: votedPlayerId_or_GuestName }
    closedAt?: string; // ISO String to track 12-hour limit
    isPrivate?: boolean; // If true, hide from Explore
    creatorAdminType?: AdminType; // Tier del admin al crear el partido
    creatorSnapshot?: { name: string; photoURL?: string; photoURLThumb?: string; phone?: string }; // Snapshot del creador al crear
    remindersSent?: Record<string, boolean>; // Tracks sent notifications to avoid duplicate push dispatches
    instructions?: string; // Instrucciones libres del organizador para los jugadores (máx 500 chars)
    payments?: Record<string, boolean>; // key → hasPaid; key = uid para jugadores, "guest_{invitedBy}_{name}" para invitados
    deposit?: number; // centavos COP; valores válidos: 500000 ($5k) o 1000000 ($10k)
    teamColors?: { A: string; B: string };
}

export interface CreateMatchInput {
    date: string;
    time: string;
    duration: MatchDuration;
    locationId: string;
    locationSnapshot: LocationSnapshot;
    createdBy: string;
    maxPlayers: number;
    allowGuests?: boolean;
    isPrivate?: boolean;
    creatorAdminType?: AdminType;
    creatorSnapshot?: { name: string; photoURL?: string; photoURLThumb?: string; phone?: string };
    deposit?: number; // centavos COP; 500000 ($5k) o 1000000 ($10k)
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

/**
 * Determina si un admin puede ver la página /match/[id].
 *
 * Reglas:
 * - super_admin ve todo
 * - Creador siempre ve su partido
 * - team_admin: solo creador + super_admin
 * - location_admin: creador + otros location_admin de la misma locationId + super_admin
 * - super_admin (privado): solo el owner
 * - super_admin (público): owner + location_admins de la misma locationId
 * - Legacy (sin creatorAdminType): se trata como super_admin público
 */
export function canViewMatchAdmin(
    viewerProfile: UserProfile,
    match: { createdBy: string; locationId: string; isPrivate?: boolean; creatorAdminType?: AdminType }
): boolean {
    if (isSuperAdmin(viewerProfile)) return true;
    if (viewerProfile.uid === match.createdBy) return true;

    const creatorType = match.creatorAdminType;

    if (creatorType === "team_admin") return false;

    if (creatorType === "location_admin") {
        return isLocationAdmin(viewerProfile)
            && (viewerProfile.assignedLocationIds?.includes(match.locationId) ?? false);
    }

    // super_admin match o legacy (sin creatorAdminType)
    if (creatorType === "super_admin" || !creatorType) {
        if (match.isPrivate) return false;
        return isLocationAdmin(viewerProfile)
            && (viewerProfile.assignedLocationIds?.includes(match.locationId) ?? false);
    }

    return false;
}

// ========================
// MATCH LIFECYCLE PHASES
// ========================

export type MatchPhase = "recruiting" | "full" | "gameday" | "postgame" | "closed";

/**
 * Determina la fase actual del partido para controlar la UI.
 * Usado por la página admin para progressive disclosure.
 */
export function getMatchPhase(
    match: Pick<Match, "status" | "teams" | "score" | "date">,
    confirmedCount: number,
    maxPlayers: number,
    today: string
): MatchPhase {
    if (match.status === "closed") return "closed";
    if (match.score && match.teams) return "postgame";
    if (match.date === today && match.teams) return "gameday";
    if (confirmedCount >= maxPlayers || match.teams) return "full";
    return "recruiting";
}

/**
 * Devuelve la tab por defecto según la fase del partido.
 */
export function getDefaultTabForPhase(phase: MatchPhase): "dashboard" | "players" | "teams" | "settings" {
    switch (phase) {
        case "recruiting": return "dashboard";
        case "full": return "teams";
        case "gameday": return "teams";
        case "postgame": return "teams";
        case "closed": return "dashboard";
    }
}

/**
 * Retorna el formato del partido (ej: "Fútbol 6").
 * Limitado a un máximo de "Fútbol 11" (22 jugadores).
 */
export function getMatchFormat(maxPlayers: number): string {
    const perTeam = Math.floor(maxPlayers / 2);
    const capped = Math.min(perTeam, 11);
    return `Fútbol ${capped}`;
}

// ========================
// MATCH TIMELINE
// ========================

export type TimelineStep = "joining" | "teams_confirmed" | "mvp_voting" | "closed";

export interface TimelineState {
    currentStep: TimelineStep;
    completedSteps: TimelineStep[];
    stepIndex: number;
    totalSteps: number;
}

const TIMELINE_STEPS: TimelineStep[] = ["joining", "teams_confirmed", "mvp_voting", "closed"];

/**
 * Calcula el estado del timeline del partido para la vista de jugadores.
 * Lógica pura, sin dependencias externas.
 */
export function getMatchTimelineState(
    match: Pick<Match, "status" | "teams" | "teamsConfirmed">,
): TimelineState {
    let stepIndex: number;

    if (match.status === "closed") {
        stepIndex = 3; // closed
    } else if (match.teamsConfirmed && match.teams) {
        stepIndex = 1; // teams_confirmed
    } else {
        stepIndex = 0; // joining
    }

    const completedSteps = TIMELINE_STEPS.slice(0, stepIndex + 1);
    const currentStep = TIMELINE_STEPS[stepIndex];

    return {
        currentStep,
        completedSteps,
        stepIndex,
        totalSteps: TIMELINE_STEPS.length,
    };
}

// ========================
// DEPÓSITO / REEMBOLSO
// ========================

/**
 * Determina si el depósito de un partido es reembolsable.
 * Regla: reembolsable si faltan más de 24 horas para el inicio.
 * Si no hay startsAt (partido legacy), se considera reembolsable.
 */
export function isDepositRefundable(
    startsAt: { seconds: number } | undefined,
    nowMs: number = Date.now()
): boolean {
    if (!startsAt) return true;
    const matchMs = startsAt.seconds * 1000;
    const deadlineMs = matchMs - REFUND_DEADLINE_MS;
    return nowMs < deadlineMs;
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

    const validDurations: MatchDuration[] = [30, 60, 90, 120, 150, 180];
    if (!data.duration || !validDurations.includes(data.duration)) {
        throw new ValidationError("La duración debe ser entre 30 y 180 minutos (en tramos de 30)");
    }
}
