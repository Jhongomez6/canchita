/**
 * ========================
 * TEAM ADMIN APPLICATION DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ver: docs/TEAM_ADMIN_APPLICATION_SDD.md
 *
 * Modelo de dominio para las solicitudes de acceso como Team Admin.
 * - Tipo TeamAdminApplication
 * - Validación canApply() (gates de acceso al formulario)
 * - buildProfileSnapshot() (captura el perfil al momento de enviar)
 */

import { calcCommitmentScore, type UserProfile } from "./user";

// ========================
// TIPOS
// ========================

export type ApplicationStatus = "pending" | "approved" | "rejected";

export type GroupSize = "5-10" | "11-20" | "21-40" | "40+";
export type OrganizingFrequency = "weekly" | "2-3x-week" | "monthly";
export type OrganizerExperience = "<3m" | "3-12m" | "1-3y" | "3y+";
export type VenueAgreement = "yes" | "no" | "in-progress";
export type FeedbackWillingness = "yes-call" | "survey-only" | "no";

export interface ApplicationProfileSnapshot {
    name: string;
    phone: string;
    played: number;
    noShows?: number;
    commitmentScore?: number;   // Calculado con calcCommitmentScore(), no almacenado en perfil
    weeklyStreak?: number;
    memberSince?: string;       // profile.createdAt
}

export interface TeamAdminApplication {
    uid: string;
    appliedAt: string;          // ISO timestamp
    status: ApplicationStatus;
    reviewedBy?: string;        // UID del super_admin que revisó
    reviewedAt?: string;        // ISO timestamp de la revisión
    rejectionReason?: string;

    // Snapshot del perfil al momento de aplicar (inmutable)
    profileSnapshot: ApplicationProfileSnapshot;

    // Paso 1 — Tu grupo
    groupSize: GroupSize;
    frequency: OrganizingFrequency;
    experience: OrganizerExperience;
    venueName: string;
    venueCity: string;
    hasVenueAgreement: VenueAgreement;

    // Paso 2 — Herramientas y motivación
    currentCommunicationChannel: string;
    toolsFeedback: string;      // Herramientas previas: qué gusta/disgusta
    problemToSolve: string;     // Problema a resolver con La Canchita

    // Paso 3 — Uso y compromiso
    useCases: string[];
    socialLink?: string;
    feedbackWillingness: FeedbackWillingness;
    groupDescription?: string;  // Opcional, max 280 chars
    termsAccepted: boolean;
}

// ========================
// REGLAS DE NEGOCIO
// ========================

export type ApplicationValidationResult =
    | { ok: true }
    | { ok: false; reason: string };

/**
 * Verifica si un usuario puede acceder al formulario de aplicación.
 *
 * Gates obligatorios (bloquean el formulario):
 * 1. Onboarding completado (initialRatingCalculated === true)
 * 2. Teléfono verificado (profile.phone)
 * 3. No tener una solicitud pendiente activa
 *
 * Las stats (played, noShows, commitmentScore) son informativas para el admin
 * pero no bloquean la aplicación.
 */
export function canApply(
    profile: UserProfile,
    existingApplication?: TeamAdminApplication | null
): ApplicationValidationResult {
    if (!profile.initialRatingCalculated)
        return { ok: false, reason: "Debes completar tu perfil de jugador primero" };
    if (!profile.phone)
        return { ok: false, reason: "Necesitas verificar tu número de teléfono" };
    if (existingApplication?.status === "pending")
        return { ok: false, reason: "Ya tienes una solicitud en revisión" };
    return { ok: true };
}

/**
 * Construye el snapshot del perfil que se guarda en la solicitud.
 * Se captura en el momento del submit y no se actualiza después.
 */
export function buildProfileSnapshot(profile: UserProfile): ApplicationProfileSnapshot {
    const commitmentScore = profile.stats
        ? calcCommitmentScore(profile.stats)
        : undefined;

    return {
        name: profile.name,
        phone: profile.phone!,
        played: profile.stats?.played ?? 0,
        noShows: profile.stats?.noShows,
        commitmentScore,
        weeklyStreak: profile.weeklyStreak,
        memberSince: profile.createdAt,
    };
}
