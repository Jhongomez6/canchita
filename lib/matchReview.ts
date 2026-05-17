/**
 * ========================
 * POST-MATCH REVIEW API
 * ========================
 *
 * Specification-Driven Development (SDD)
 * SDD: docs/POST_MATCH_REVIEW_FEATURE_SDD.md
 *
 * Capa de API Firestore para reviews, kudos y reportes post-partido.
 * Usa tipos y validaciones de lib/domain/matchReview.ts.
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "./firebase";
import type {
    MatchReview,
    PlayerKudo,
    PlayerReport,
    KudoType,
    ReportReason,
    AdminReportAction,
    ModerationAlert,
    DimensionValue,
} from "./domain/matchReview";
import { reviewDocId } from "./domain/matchReview";
import {
    ReviewNotEligibleError,
    ReviewWindowExpiredError,
    ReviewAlreadyExistsError,
    ActiveReportLimitError,
    ValidationError,
} from "./domain/errors";

// ========================
// SUBMIT (CALLABLE — ATOMIC)
// ========================

export interface MatchReviewSubmitPayload {
    userName: string;  // snapshot del giver — se persiste como giverName en kudos
    rating: number;
    dimensions: { organization: DimensionValue; levelBalance: DimensionValue };
    comment?: string;
    kudos: Array<{ recipientUid: string; recipientName: string; type: KudoType }>;
    reports: Array<{ reportedUid: string; reportedName: string; reason: ReportReason; comment?: string }>;
}

export interface MatchReviewSubmitResult {
    reviewId: string;
    kudosCreated: number;
    reportsCreated: number;
}

/** Errores transitorios que justifican 1 reintento automático. */
function isTransientCallableError(e: unknown): boolean {
    if (!e || typeof e !== "object") return false;
    const code = (e as { code?: string }).code;
    return (
        code === "functions/unavailable" ||
        code === "functions/deadline-exceeded" ||
        code === "functions/internal" ||
        code === "unavailable" ||
        code === "deadline-exceeded" ||
        code === "internal"
    );
}

/**
 * Mapea HttpsError codes del Cloud Function callable a errores de dominio tipados.
 * Esto preserva el contrato de error que el resto del código ya espera.
 */
function mapCallableError(e: unknown): Error {
    if (!e || typeof e !== "object") return new Error("Error desconocido");
    const code = (e as { code?: string }).code ?? "";
    const message = (e as { message?: string }).message ?? "Error al enviar";

    if (code.endsWith("already-exists")) return new ReviewAlreadyExistsError();
    if (code.endsWith("resource-exhausted")) return new ActiveReportLimitError();
    if (code.endsWith("failed-precondition")) {
        // Distingue "ventana cerrada" del resto por contenido del mensaje
        if (/ventana/i.test(message)) return new ReviewWindowExpiredError();
        return new ReviewNotEligibleError();
    }
    if (code.endsWith("permission-denied") || code.endsWith("not-found")) {
        return new ReviewNotEligibleError();
    }
    if (code.endsWith("invalid-argument")) return new ValidationError(message);

    return e as Error;
}

/**
 * Envía la review completa (rating + dimensiones + comentario + kudos + reportes)
 * de forma atómica vía Cloud Function callable. El servidor valida elegibilidad y
 * límite de reportes activos dentro de una sola transacción (el Admin SDK permite
 * queries dentro de transacciones, a diferencia del client SDK).
 *
 * Reintenta una sola vez (backoff 2s) ante errores transitorios de red.
 */
export async function submitMatchReview(
    matchId: string,
    payload: MatchReviewSubmitPayload,
): Promise<MatchReviewSubmitResult> {
    const fn = httpsCallable<
        { matchId: string } & MatchReviewSubmitPayload,
        MatchReviewSubmitResult
    >(getFunctions(app), "submitMatchReview");

    const run = async () => {
        const result = await fn({ matchId, ...payload });
        return result.data;
    };

    try {
        return await run();
    } catch (e) {
        if (!isTransientCallableError(e)) throw mapCallableError(e);
        await new Promise((r) => setTimeout(r, 2000));
        try {
            return await run();
        } catch (e2) {
            throw mapCallableError(e2);
        }
    }
}

// ========================
// READ FUNCTIONS (JUGADOR)
// ========================

/** Lee la review del jugador para un partido. Null si no la envió. */
export async function getMyReview(
    matchId: string,
    userUid: string,
): Promise<MatchReview | null> {
    const snap = await getDoc(doc(db, "matchReviews", reviewDocId(matchId, userUid)));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as MatchReview;
}

/**
 * Lee los kudos que el jugador otorgó en un partido específico.
 * Usado en la UI para marcar qué compañeros ya recibieron kudo.
 */
export async function getKudosGivenInMatch(
    matchId: string,
    giverUid: string,
): Promise<PlayerKudo[]> {
    const q = query(
        collection(db, "playerKudos"),
        where("giverUid", "==", giverUid),
        where("matchId", "==", matchId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlayerKudo);
}

/**
 * Devuelve el Set de matchIds que el usuario ya calificó.
 * Una sola query usando el índice (userUid + createdAt). Pensado para filtrar
 * la card de home contra varios partidos cerrados pendientes.
 */
export async function getMyReviewedMatchIds(
    userUid: string,
    sinceISO?: string,
): Promise<Set<string>> {
    const constraints = [
        where("userUid", "==", userUid),
        orderBy("createdAt", "desc"),
        limit(50),
    ];
    const q = query(collection(db, "matchReviews"), ...constraints);
    const snap = await getDocs(q);
    const ids = new Set<string>();
    snap.docs.forEach((d) => {
        const data = d.data() as MatchReview;
        if (!sinceISO || data.createdAt >= sinceISO) ids.add(data.matchId);
    });
    return ids;
}

/** Lee los kudos recibidos por un jugador (para su FIFA Card / perfil). */
export async function getKudosReceivedByPlayer(
    recipientUid: string,
    limitN = 20,
): Promise<PlayerKudo[]> {
    const q = query(
        collection(db, "playerKudos"),
        where("recipientUid", "==", recipientUid),
        orderBy("createdAt", "desc"),
        limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlayerKudo);
}

// ========================
// ADMIN QUERIES
// ========================

/** Lee todas las reviews de un partido (admin). */
export async function getReviewsForMatch(matchId: string): Promise<MatchReview[]> {
    const q = query(
        collection(db, "matchReviews"),
        where("matchId", "==", matchId),
        orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MatchReview);
}

/** Lee reportes pendientes de revisión (admin — panel de moderación). */
export async function getPendingReports(limitN = 50): Promise<PlayerReport[]> {
    const q = query(
        collection(db, "playerReports"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlayerReport);
}

/** Lee todos los reportes contra un jugador específico (admin). */
export async function getReportsForPlayer(
    reportedUid: string,
    limitN = 50,
): Promise<PlayerReport[]> {
    const q = query(
        collection(db, "playerReports"),
        where("reportedUid", "==", reportedUid),
        orderBy("createdAt", "desc"),
        limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlayerReport);
}

/** Lee alertas de moderación abiertas (admin). */
export async function getModerationAlerts(
    statusFilter: "open" | "resolved" = "open",
    limitN = 50,
): Promise<ModerationAlert[]> {
    const q = query(
        collection(db, "moderationAlerts"),
        where("status", "==", statusFilter),
        orderBy("createdAt", "desc"),
        limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ModerationAlert);
}

/**
 * Actualiza el estado de un reporte (admin).
 * Cambia status a "reviewed" o "dismissed", registra la acción y quién la tomó.
 */
export async function updateReportStatus(
    reportId: string,
    status: "reviewed" | "dismissed",
    adminUid: string,
    action?: AdminReportAction,
    adminNote?: string,
): Promise<void> {
    const updates: Record<string, unknown> = {
        status,
        reviewedAt: new Date().toISOString(),
        reviewedBy: adminUid,
    };
    if (action) updates.adminAction = action;
    if (adminNote?.trim()) updates.adminNote = adminNote.trim();
    await updateDoc(doc(db, "playerReports", reportId), updates);
}

/** Resuelve una alerta de moderación (admin). */
export async function resolveModerationAlert(
    alertId: string,
    adminUid: string,
): Promise<void> {
    await updateDoc(doc(db, "moderationAlerts", alertId), {
        status: "resolved",
        resolvedAt: new Date().toISOString(),
        resolvedBy: adminUid,
    });
}

/** Cuenta reportes pendientes (para el badge del nav). */
export async function getPendingReportsCount(): Promise<number> {
    const q = query(
        collection(db, "playerReports"),
        where("status", "==", "pending"),
        limit(99),
    );
    const snap = await getDocs(q);
    return snap.size;
}
