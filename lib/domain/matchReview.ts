/**
 * ========================
 * POST-MATCH REVIEW DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * SDD: docs/POST_MATCH_REVIEW_FEATURE_SDD.md
 *
 * ESPECIFICACIÓN clave:
 * - Solo jugadores con uid en teams.A/B pueden enviar review.
 * - Ventana de envío: 2 días desde closedAt.
 * - Reviews son inmutables una vez enviadas.
 * - 1 kudo por compañero por partido. Solo a users con uid. No a uno mismo.
 * - Límite: máximo 2 reportes activos (pending) por par reporter→reportado.
 * - Reportes son privados (solo reporter + admin).
 */

import { ValidationError } from "./errors";
import type { Match } from "./match";

// ========================
// TIPOS
// ========================

export type KudoType =
    | "buen_toque"
    | "goleador"
    | "muralla"
    | "fair_play"
    | "capitan";

export const KUDO_TYPES: KudoType[] = [
    "buen_toque",
    "goleador",
    "muralla",
    "fair_play",
    "capitan",
];

export type ReportReason =
    | "no_show"
    | "aggressive_behavior"
    | "level_mismatch"
    | "late_no_warning"
    | "other";

export const REPORT_REASONS: ReportReason[] = [
    "no_show",
    "aggressive_behavior",
    "level_mismatch",
    "late_no_warning",
    "other",
];

export type ReportStatus = "pending" | "reviewed" | "dismissed";

export type AdminReportAction = "warning" | "suspension" | "dismissed";

export type DimensionValue = "good" | "bad" | null;

export interface MatchReviewDimensions {
    organization: DimensionValue;  // organización del partido
    levelBalance: DimensionValue;  // equipos parejos
}

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface MatchReview {
    id?: string;           // {matchId}_{userUid}
    matchId: string;
    userUid: string;
    rating: Rating;
    dimensions: MatchReviewDimensions;
    comment?: string;
    createdAt: string;     // ISO
}

export interface PlayerKudo {
    id?: string;           // {matchId}_{giverUid}_{recipientUid}
    matchId: string;
    giverUid: string;
    giverName: string;     // snapshot
    recipientUid: string;  // siempre uid — no guests
    recipientName: string; // snapshot
    type: KudoType;
    createdAt: string;
}

export interface PlayerReport {
    id?: string;           // {matchId}_{reporterUid}_{reportedUid}
    matchId: string;
    reporterUid: string;
    reporterName?: string; // snapshot del autor — solo visible para admin. Opcional por compat con reportes viejos
    reportedUid: string;
    reportedName: string;  // snapshot
    reason: ReportReason;
    comment?: string;
    status: ReportStatus;
    createdAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    adminAction?: AdminReportAction;
    adminNote?: string;
}

export interface UserKudosSummary {
    buen_toque: number;
    goleador: number;
    muralla: number;
    fair_play: number;
    capitan: number;
    total: number;
}

export interface UserReportsSummary {
    pendingCount: number;
    totalCount: number;
    lastReportAt?: string;
}

export interface ModerationAlert {
    id?: string;
    reportedUid: string;
    reportedName: string;
    triggerCount: number;  // ≥3
    windowDays: 30;
    reportIds: string[];
    status: "open" | "resolved";
    createdAt: string;
    resolvedAt?: string;
    resolvedBy?: string;
}

// ========================
// METADATA DE PRESENTACIÓN
// ========================

export const KUDO_META: Record<KudoType, { emoji: string; label: string }> = {
    buen_toque: { emoji: "✨", label: "Buen toque" },
    goleador:   { emoji: "🎯", label: "Goleador" },
    muralla:    { emoji: "🛡️", label: "Muralla" },
    fair_play:  { emoji: "🤝", label: "Fair play" },
    capitan:    { emoji: "🧢", label: "Capitán" },
};

export const REPORT_REASON_META: Record<
    ReportReason,
    { label: string; requiresComment: boolean }
> = {
    no_show:             { label: "No se presentó al partido", requiresComment: false },
    aggressive_behavior: { label: "Comportamiento agresivo o antideportivo", requiresComment: false },
    level_mismatch:      { label: "Nivel declarado muy distinto al real", requiresComment: false },
    late_no_warning:     { label: "Llegó muy tarde sin avisar", requiresComment: false },
    other:               { label: "Otro", requiresComment: true },
};

// ========================
// CONSTANTES DE NEGOCIO
// ========================

export const REVIEW_WINDOW_HOURS = 2 * 24;          // 2 días desde closedAt
export const HOME_CARD_DELAY_HOURS = 0;              // trigger inmediato
export const MVP_VOTING_WINDOW_HOURS = 2;            // ventana real del MVP (lib/mvp.ts)
export const MAX_ACTIVE_REPORTS_PER_TARGET = 2;      // máx pending por par reporter→reportado
export const MODERATION_ALERT_THRESHOLD = 3;         // ≥3 reportes distintos en 30d → alerta
export const MODERATION_ALERT_WINDOW_DAYS = 30;
export const COMMENT_MAX_LENGTH = 500;

const MS_PER_HOUR = 60 * 60 * 1000;

// ========================
// HELPERS DE ID DETERMINÍSTICO
// ========================

/** Doc id determinístico para `matchReviews`. Garantiza idempotencia. */
export function reviewDocId(matchId: string, userUid: string): string {
    return `${matchId}_${userUid}`;
}

/** Doc id determinístico para `playerKudos`. */
export function kudoDocId(matchId: string, giverUid: string, recipientUid: string): string {
    return `${matchId}_${giverUid}_${recipientUid}`;
}

/** Doc id determinístico para `playerReports`. */
export function reportDocId(matchId: string, reporterUid: string, reportedUid: string): string {
    return `${matchId}_${reporterUid}_${reportedUid}`;
}

/** Key de localStorage para persistir el "user descartó la card de home". */
export function reviewCardDismissKey(matchId: string, userUid: string): string {
    return `review_card_dismissed_${matchId}_${userUid}`;
}

// ========================
// ELEGIBILIDAD
// ========================

/**
 * Verifica si el usuario estuvo en el partido cerrado.
 * Usa teams.A/B como fuente principal; players[] como fallback para partidos
 * sin equipos balanceados.
 */
export function wasUserInMatch(
    match: Pick<Match, "players" | "teams">,
    userUid: string,
): boolean {
    if (match.teams) {
        const inA = match.teams.A?.some((p) => p.uid === userUid) ?? false;
        const inB = match.teams.B?.some((p) => p.uid === userUid) ?? false;
        if (inA || inB) return true;
    }
    return match.players?.some((p) => p.uid === userUid && p.confirmed) ?? false;
}

/** Indica si la ventana de 2 días desde closedAt ya expiró. */
export function isReviewWindowExpired(closedAt: string, now: Date = new Date()): boolean {
    const elapsed = now.getTime() - new Date(closedAt).getTime();
    return elapsed > REVIEW_WINDOW_HOURS * MS_PER_HOUR;
}

/** Devuelve el Date en que expira la ventana de review. */
export function getReviewWindowEnd(closedAt: string): Date {
    return new Date(new Date(closedAt).getTime() + REVIEW_WINDOW_HOURS * MS_PER_HOUR);
}

/** Horas transcurridas desde el cierre del partido. */
export function hoursSinceClose(closedAt: string, now: Date = new Date()): number {
    return (now.getTime() - new Date(closedAt).getTime()) / MS_PER_HOUR;
}

/**
 * Indica si el usuario puede enviar review:
 * partido cerrado + dentro de ventana + estuvo en el partido.
 */
export function canSubmitReview(
    match: Pick<Match, "status" | "closedAt" | "players" | "teams">,
    userUid: string,
    now: Date = new Date(),
): boolean {
    if (match.status !== "closed" || !match.closedAt) return false;
    if (!wasUserInMatch(match, userUid)) return false;
    return !isReviewWindowExpired(match.closedAt, now);
}

/**
 * Indica si corresponde mostrar el card de review en home.
 * Inmediato: solo depende de que no haya enviado y esté dentro de ventana.
 */
export function shouldShowHomeCard(
    closedAt: string,
    hasSubmitted: boolean,
    now: Date = new Date(),
): boolean {
    if (hasSubmitted) return false;
    return !isReviewWindowExpired(closedAt, now);
}

/**
 * Indica si corresponde mostrar el banner del MVP en la review screen.
 * Muestra si: cerró hace <2h Y el user aún no votó el MVP.
 */
export function shouldShowMvpBanner(
    closedAt: string,
    hasVotedMvp: boolean,
    now: Date = new Date(),
): boolean {
    if (hasVotedMvp) return false;
    return hoursSinceClose(closedAt, now) < MVP_VOTING_WINDOW_HOURS;
}

// ========================
// LÍMITE DE REPORTES ACTIVOS
// ========================

/**
 * Indica si el reporter ya alcanzó el límite de reportes "pending" contra
 * el mismo jugador. El cupo se libera cuando el admin procesa un reporte.
 */
export function hasReachedActiveReportLimit(
    previousReports: Array<Pick<PlayerReport, "reporterUid" | "reportedUid" | "status">>,
    reporterUid: string,
    reportedUid: string,
): boolean {
    const activeCount = previousReports.filter(
        (r) =>
            r.reporterUid === reporterUid
            && r.reportedUid === reportedUid
            && r.status === "pending",
    ).length;
    return activeCount >= MAX_ACTIVE_REPORTS_PER_TARGET;
}

// ========================
// VALIDACIONES
// ========================

export function validateRating(rating: unknown): asserts rating is Rating {
    if (typeof rating !== "number" || !Number.isInteger(rating)) {
        throw new ValidationError("El rating debe ser un número entero");
    }
    if (rating < 1 || rating > 5) {
        throw new ValidationError("El rating debe estar entre 1 y 5");
    }
}

export function validateDimensions(dim: unknown): asserts dim is MatchReviewDimensions {
    if (!dim || typeof dim !== "object") {
        throw new ValidationError("Las dimensiones son requeridas");
    }
    const d = dim as Record<string, unknown>;
    for (const key of ["organization", "levelBalance"] as const) {
        const v = d[key];
        if (v !== null && v !== "good" && v !== "bad") {
            throw new ValidationError(`La dimensión "${key}" debe ser "good", "bad" o null`);
        }
    }
}

export function validateComment(comment: unknown): asserts comment is string | undefined {
    if (comment === undefined || comment === null) return;
    if (typeof comment !== "string") {
        throw new ValidationError("El comentario debe ser texto");
    }
    if (comment.length > COMMENT_MAX_LENGTH) {
        throw new ValidationError(`El comentario no puede exceder ${COMMENT_MAX_LENGTH} caracteres`);
    }
}

export function validateKudoType(t: unknown): asserts t is KudoType {
    if (typeof t !== "string" || !KUDO_TYPES.includes(t as KudoType)) {
        throw new ValidationError("Tipo de reconocimiento inválido");
    }
}

export function validateReportReason(r: unknown): asserts r is ReportReason {
    if (typeof r !== "string" || !REPORT_REASONS.includes(r as ReportReason)) {
        throw new ValidationError("Motivo de reporte inválido");
    }
}

export function validateReportPayload(payload: {
    reason: ReportReason;
    comment?: string;
}): void {
    validateReportReason(payload.reason);
    validateComment(payload.comment);
    if (REPORT_REASON_META[payload.reason].requiresComment) {
        if (!payload.comment || payload.comment.trim().length === 0) {
            throw new ValidationError(
                `El motivo "${REPORT_REASON_META[payload.reason].label}" requiere un comentario`,
            );
        }
    }
}

// ========================
// DEFAULTS
// ========================

export function emptyKudosSummary(): UserKudosSummary {
    return {
        buen_toque: 0,
        goleador: 0,
        muralla: 0,
        fair_play: 0,
        capitan: 0,
        total: 0,
    };
}
