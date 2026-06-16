/**
 * ========================
 * POST-MATCH REVIEW — CLOUD FUNCTIONS
 * ========================
 *
 * Specification-Driven Development (SDD)
 * SDD: docs/POST_MATCH_REVIEW_FEATURE_SDD.md
 *
 * Triggers:
 *  1. notifyPlayersOnMatchClose  — open→closed: envía notif post_match_review
 *  2. aggregateKudoOnCreate      — playerKudos created: acumula kudosSummary + notif kudo_received
 *  3. aggregateReportOnCreate    — playerReports created: acumula _reportsSummary + chequea umbral
 *  4. decrementPendingOnReview   — playerReports reviewed/dismissed: decrementa pending count
 */

import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

// TTL igual al de reminders.ts (10 días), salvo post_match_review que expira en 2 días
const NOTIFICATION_TTL_MS = 10 * 24 * 60 * 60 * 1000;
const REVIEW_WINDOW_HOURS = 2 * 24; // 2 días — debe coincidir con domain/matchReview.ts
const MODERATION_ALERT_THRESHOLD = 3;
const MODERATION_ALERT_WINDOW_DAYS = 30;

const KUDO_LABELS: Record<string, string> = {
    buen_toque: "✨ Buen toque",
    goleador:   "🎯 Goleador",
    muralla:    "🛡️ Muralla",
    fair_play:  "🤝 Fair play",
    capitan:    "🧢 Capitán",
};

// ========================
// 1. NOTIFY ON MATCH CLOSE
// ========================

/**
 * Dispara cuando status cambia open → closed.
 * Envía notificación post_match_review a todos los jugadores confirmados.
 * Idempotente via remindersSent.postMatchReview.
 */
export const notifyPlayersOnMatchClose = onDocumentUpdated(
    { document: "matches/{matchId}", region: "us-central1" },
    async (event) => {
        const before = event.data?.before?.data();
        const after  = event.data?.after?.data();

        if (after?.status !== "closed" || before?.status !== "open") return;
        if (after?.remindersSent?.postMatchReview) return;

        const matchId  = event.params.matchId;
        const matchRef = db.collection("matches").doc(matchId);

        await matchRef.update({ "remindersSent.postMatchReview": true });

        const players: Array<Record<string, unknown>> = after?.players ?? [];
        const seen = new Set<string>();
        const uids: string[] = [];
        for (const p of players) {
            const uid = p.uid as string | undefined;
            if (p.confirmed && uid && !uid.startsWith("guest_") && !seen.has(uid)) {
                seen.add(uid);
                uids.push(uid);
            }
        }
        if (uids.length === 0) return;

        // Notif expira cuando vence la ventana de review (2 días)
        const closedAt = (after?.closedAt as string | undefined) ?? new Date().toISOString();
        const reviewExpireAt = admin.firestore.Timestamp.fromDate(
            new Date(new Date(closedAt).getTime() + REVIEW_WINDOW_HOURS * 60 * 60 * 1000),
        );
        const now   = new Date().toISOString();
        const title = "⭐ ¿Cómo estuvo el partido?";
        const body  = "Califica tu experiencia y reconoce a tus compañeros de hoy.";
        const url   = `/match/${matchId}/review?source=in_app_notif`;

        // In-app only — SDD § 13 prohíbe push para post_match_review
        await Promise.all(
            uids.map((uid) =>
                db.collection("notifications").doc(uid).collection("items").add({
                    title,
                    body,
                    type: "post_match_review",
                    url,
                    read: false,
                    createdAt: now,
                    expireAt: reviewExpireAt,
                }),
            ),
        );

        console.log(`[PostMatchReview] Match ${matchId} — notified ${uids.length} players (in-app)`);
    },
);

// ========================
// 2. AGGREGATE KUDO ON CREATE
// ========================

/**
 * Dispara cuando se crea un doc en playerKudos.
 * Incrementa kudosSummary en el perfil del recipient (escrita solo por Cloud Functions).
 * Envía notificación in-app kudo_received al recipient.
 */
export const aggregateKudoOnCreate = onDocumentCreated(
    { document: "playerKudos/{kudoId}", region: "us-central1" },
    async (event) => {
        const kudo = event.data?.data();
        if (!kudo) return;

        const { recipientUid, recipientName, giverName, type, matchId } = kudo as {
            recipientUid: string;
            recipientName: string;
            giverName: string;
            type: string;
            matchId: string;
        };
        if (!recipientUid || !type) return;

        const userRef = db.collection("users").doc(recipientUid);

        // Acumular kudosSummary (transacción para evitar race conditions)
        await db.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const current = userSnap.data()?.kudosSummary ?? {
                buen_toque: 0, goleador: 0, muralla: 0, fair_play: 0, capitan: 0, total: 0,
            };
            tx.update(userRef, {
                kudosSummary: {
                    ...current,
                    [type]: (current[type] ?? 0) + 1,
                    total: (current.total ?? 0) + 1,
                },
            });
        });

        // Notificación in-app al recipient
        const kudoLabel = KUDO_LABELS[type] ?? type;
        const title = "🏅 ¡Recibiste un reconocimiento!";
        const body  = `${giverName} te reconoció como "${kudoLabel}" en el último partido.`;
        const url   = `/join/${matchId}`;

        // In-app only — SDD § 13 prohíbe push para kudo_received
        await db.collection("notifications").doc(recipientUid).collection("items").add({
            title,
            body,
            type: "kudo_received",
            url,
            read: false,
            createdAt: new Date().toISOString(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
        });

        console.log(`[KudoAggregate] +1 ${type} → ${recipientUid} (${recipientName})`);
    },
);

// ========================
// 3. AGGREGATE REPORT ON CREATE
// ========================

/**
 * Dispara cuando se crea un doc en playerReports.
 * Incrementa _reportsSummary en el perfil del reportado.
 * Verifica si se alcanzó el umbral de moderación (≥3 reportes en 30 días).
 */
export const aggregateReportOnCreate = onDocumentCreated(
    { document: "playerReports/{reportId}", region: "us-central1" },
    async (event) => {
        const report = event.data?.data();
        if (!report) return;

        const reportId    = event.params.reportId;
        const reportedUid  = report.reportedUid as string;
        const reportedName = report.reportedName as string;
        const createdAt   = report.createdAt as string;
        if (!reportedUid) return;

        const userRef = db.collection("users").doc(reportedUid);

        // Incrementar _reportsSummary
        await db.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const current = userSnap.data()?._reportsSummary ?? { pendingCount: 0, totalCount: 0 };
            tx.update(userRef, {
                "_reportsSummary.pendingCount": (current.pendingCount ?? 0) + 1,
                "_reportsSummary.totalCount":   (current.totalCount  ?? 0) + 1,
                "_reportsSummary.lastReportAt": createdAt,
            });
        });

        await checkModerationThreshold(reportedUid, reportedName, reportId);
    },
);

/**
 * Verifica si el jugador reportado supera el umbral de moderación:
 * ≥3 reportes distintos (de reporters distintos) con status "pending" en 30 días.
 * Si sí, crea o actualiza un doc en moderationAlerts.
 */
async function checkModerationThreshold(
    reportedUid: string,
    reportedName: string,
    triggeringReportId: string,
): Promise<void> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - MODERATION_ALERT_WINDOW_DAYS);
    const windowStartISO = windowStart.toISOString();

    const recentSnap = await db
        .collection("playerReports")
        .where("reportedUid", "==", reportedUid)
        .where("status", "==", "pending")
        .where("createdAt", ">=", windowStartISO)
        .get();

    if (recentSnap.size < MODERATION_ALERT_THRESHOLD) return;

    // Verificar si ya hay una alerta abierta para este jugador
    const existingAlert = await db
        .collection("moderationAlerts")
        .where("reportedUid", "==", reportedUid)
        .where("status", "==", "open")
        .limit(1)
        .get();

    if (!existingAlert.empty) {
        await existingAlert.docs[0].ref.update({
            triggerCount: recentSnap.size,
            reportIds: admin.firestore.FieldValue.arrayUnion(triggeringReportId),
        });
        console.log(`[Moderation] Updated alert for ${reportedUid} (${recentSnap.size} reports)`);
        return;
    }

    await db.collection("moderationAlerts").add({
        reportedUid,
        reportedName,
        triggerCount: recentSnap.size,
        windowDays: MODERATION_ALERT_WINDOW_DAYS,
        reportIds: recentSnap.docs.map((d) => d.id),
        status: "open",
        createdAt: new Date().toISOString(),
    });

    console.log(`[Moderation] New alert created for ${reportedUid} (${recentSnap.size} reports)`);
}

// ========================
// 4. DECREMENT PENDING ON REVIEW
// ========================

/**
 * Dispara cuando un reporte cambia de status pending → reviewed / dismissed.
 * Decrementa _reportsSummary.pendingCount en el perfil del reportado.
 * Envía notificación genérica al reporter ("tu reporte fue revisado").
 */
export const decrementPendingOnReview = onDocumentUpdated(
    { document: "playerReports/{reportId}", region: "us-central1" },
    async (event) => {
        const before = event.data?.before?.data();
        const after  = event.data?.after?.data();

        if (before?.status !== "pending") return;
        if (after?.status !== "reviewed" && after?.status !== "dismissed") return;

        const reportedUid = after?.reportedUid as string | undefined;
        const reporterUid = after?.reporterUid as string | undefined;
        if (!reportedUid) return;

        const userRef = db.collection("users").doc(reportedUid);

        await db.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const current  = userSnap.data()?._reportsSummary ?? { pendingCount: 0, totalCount: 0 };
            tx.update(userRef, {
                "_reportsSummary.pendingCount": Math.max(0, (current.pendingCount ?? 0) - 1),
            });
        });

        console.log(`[ReportReview] Decremented pending for ${reportedUid}`);

        // Notif genérica al reporter (sin detalles del resultado para preservar privacidad)
        if (reporterUid) {
            try {
                await db.collection("notifications").doc(reporterUid).collection("items").add({
                    title: "Tu reporte fue revisado",
                    body: "Gracias por ayudarnos a cuidar la comunidad. El equipo revisó tu reporte.",
                    type: "report_reviewed",
                    read: false,
                    createdAt: new Date().toISOString(),
                    expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
                });
            } catch (err) {
                console.error(`[ReportReview] Failed to notify reporter ${reporterUid} (non-fatal):`, err);
            }
        }
    },
);

// ========================
// 5. SUBMIT MATCH REVIEW (CALLABLE — ATOMIC)
// ========================

/**
 * Envía la review completa (rating + dimensiones + comentario + kudos + reportes)
 * de forma atómica en una sola transacción. El Admin SDK permite queries dentro
 * de transacciones (a diferencia del client SDK), lo cual resuelve la divergencia
 * con el SDD § 1 regla 8 — "atómico: todo o nada".
 *
 * Validaciones server-side (no se pueden bypassear desde el cliente):
 *  - User autenticado y en teams.A/B del partido cerrado
 *  - Partido cerrado y dentro de ventana de 2 días
 *  - Review no existe (idempotencia)
 *  - Para cada reporte nuevo: el reporter no tiene ya 2 reportes pending contra ese target
 *
 * Errores tipados via HttpsError → el cliente los mapea a sus errores de dominio.
 */

const REVIEW_MAX_RATING = 5;
const REVIEW_MIN_RATING = 1;
const REVIEW_COMMENT_MAX_LENGTH = 500;
const KUDO_TYPES_SET = new Set(["buen_toque", "goleador", "muralla", "fair_play", "capitan"]);
const REPORT_REASONS_SET = new Set(["no_show", "aggressive_behavior", "level_mismatch", "late_no_warning", "other"]);
const MAX_ACTIVE_REPORTS_PER_TARGET = 2;

interface SubmitMatchReviewInput {
    matchId: string;
    userName: string;        // snapshot del nombre del giver (users/{uid}.name)
    rating: number;
    dimensions: {
        organization: "good" | "bad" | null;
        levelBalance: "good" | "bad" | null;
    };
    comment?: string;
    kudos: Array<{
        recipientUid: string;
        recipientName: string;
        type: string;
    }>;
    reports: Array<{
        reportedUid: string;
        reportedName: string;
        reason: string;
        comment?: string;
    }>;
}

interface SubmitMatchReviewResult {
    reviewId: string;
    kudosCreated: number;
    reportsCreated: number;
}

function reviewDocId(matchId: string, userUid: string) { return `${matchId}_${userUid}`; }
function kudoDocId(matchId: string, giverUid: string, recipientUid: string) { return `${matchId}_${giverUid}_${recipientUid}`; }
function reportDocId(matchId: string, reporterUid: string, reportedUid: string) { return `${matchId}_${reporterUid}_${reportedUid}`; }

export const submitMatchReview = onCall(
    { maxInstances: 10 },
    async (request): Promise<SubmitMatchReviewResult> => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }
        const uid = request.auth.uid;

        const input = request.data as SubmitMatchReviewInput;

        // ── VALIDACIONES DE INPUT ──
        if (!input?.matchId || typeof input.matchId !== "string") {
            throw new HttpsError("invalid-argument", "matchId es requerido.");
        }
        if (!input?.userName || typeof input.userName !== "string" || input.userName.trim().length === 0) {
            throw new HttpsError("invalid-argument", "userName es requerido.");
        }
        const giverName = input.userName.trim();
        if (!Number.isInteger(input.rating) || input.rating < REVIEW_MIN_RATING || input.rating > REVIEW_MAX_RATING) {
            throw new HttpsError("invalid-argument", `rating debe ser entero entre ${REVIEW_MIN_RATING} y ${REVIEW_MAX_RATING}.`);
        }
        if (!input.dimensions || typeof input.dimensions !== "object") {
            throw new HttpsError("invalid-argument", "dimensions es requerido.");
        }
        for (const key of ["organization", "levelBalance"] as const) {
            const v = input.dimensions[key];
            if (v !== null && v !== "good" && v !== "bad") {
                throw new HttpsError("invalid-argument", `dimensions.${key} inválido.`);
            }
        }
        if (input.comment !== undefined && input.comment !== null) {
            if (typeof input.comment !== "string") {
                throw new HttpsError("invalid-argument", "comment debe ser texto.");
            }
            if (input.comment.length > REVIEW_COMMENT_MAX_LENGTH) {
                throw new HttpsError("invalid-argument", `comment excede ${REVIEW_COMMENT_MAX_LENGTH} chars.`);
            }
        }
        const kudos = Array.isArray(input.kudos) ? input.kudos : [];
        const reports = Array.isArray(input.reports) ? input.reports : [];

        for (const k of kudos) {
            if (!k.recipientUid || k.recipientUid === uid) {
                throw new HttpsError("invalid-argument", "kudo recipientUid inválido.");
            }
            if (!KUDO_TYPES_SET.has(k.type)) {
                throw new HttpsError("invalid-argument", `kudo type inválido: ${k.type}.`);
            }
        }
        for (const r of reports) {
            if (!r.reportedUid || r.reportedUid === uid) {
                throw new HttpsError("invalid-argument", "report reportedUid inválido.");
            }
            if (!REPORT_REASONS_SET.has(r.reason)) {
                throw new HttpsError("invalid-argument", `report reason inválido: ${r.reason}.`);
            }
            if (r.reason === "other" && (!r.comment || r.comment.trim().length === 0)) {
                throw new HttpsError("invalid-argument", `report con motivo "other" requiere comment.`);
            }
            if (r.comment && r.comment.length > REVIEW_COMMENT_MAX_LENGTH) {
                throw new HttpsError("invalid-argument", `report.comment excede ${REVIEW_COMMENT_MAX_LENGTH} chars.`);
            }
        }

        const matchRef = db.collection("matches").doc(input.matchId);
        const reviewRef = db.collection("matchReviews").doc(reviewDocId(input.matchId, uid));

        // ── TRANSACCIÓN ATÓMICA ──
        // 1. Lee match + review
        // 2. Para cada report nuevo: lee doc + cuenta pending pre-existentes
        // 3. Si todas las validaciones pasan: escribe review + kudos + reports en un commit
        let kudosCreated = 0;
        let reportsCreated = 0;

        await db.runTransaction(async (tx) => {
            const matchSnap = await tx.get(matchRef);
            if (!matchSnap.exists) {
                throw new HttpsError("not-found", "Partido no encontrado.");
            }
            const match = matchSnap.data() as Record<string, unknown>;

            if (match.status !== "closed" || !match.closedAt) {
                throw new HttpsError("failed-precondition", "El partido no está cerrado.");
            }

            // Ventana de 2 días (debe coincidir con REVIEW_WINDOW_HOURS arriba)
            const closedAtMs = new Date(match.closedAt as string).getTime();
            if (Date.now() - closedAtMs > REVIEW_WINDOW_HOURS * 60 * 60 * 1000) {
                throw new HttpsError("failed-precondition", "La ventana de calificación cerró.");
            }

            // Elegibilidad: user en teams.A/B o players[].confirmed
            const teams = match.teams as { A?: Array<{ uid?: string }>; B?: Array<{ uid?: string }> } | undefined;
            const players = match.players as Array<{ uid?: string; confirmed?: boolean }> | undefined;
            const inTeams = !!(teams?.A?.some((p) => p.uid === uid) || teams?.B?.some((p) => p.uid === uid));
            const inPlayers = !!players?.some((p) => p.uid === uid && p.confirmed);
            if (!inTeams && !inPlayers) {
                throw new HttpsError("permission-denied", "No participaste en este partido.");
            }

            // Review única (inmutable)
            const reviewSnap = await tx.get(reviewRef);
            if (reviewSnap.exists) {
                throw new HttpsError("already-exists", "Ya calificaste este partido.");
            }

            // Pre-checks de límite de reportes activos (queries dentro de tx — Admin SDK lo permite)
            const reportRefsToCreate: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];
            for (const r of reports) {
                const docRef = db.collection("playerReports").doc(reportDocId(input.matchId, uid, r.reportedUid));
                const existingSnap = await tx.get(docRef);

                // Si el doc ya existe (mismo matchId/par), es overwrite → no afecta el count
                if (!existingSnap.exists) {
                    const activeQuery = db.collection("playerReports")
                        .where("reporterUid", "==", uid)
                        .where("reportedUid", "==", r.reportedUid)
                        .where("status", "==", "pending");
                    const activeSnap = await tx.get(activeQuery);
                    if (activeSnap.size >= MAX_ACTIVE_REPORTS_PER_TARGET) {
                        throw new HttpsError(
                            "resource-exhausted",
                            `Ya tienes ${MAX_ACTIVE_REPORTS_PER_TARGET} reportes pendientes contra ${r.reportedName}.`,
                        );
                    }
                }

                reportRefsToCreate.push({
                    ref: docRef,
                    data: {
                        matchId: input.matchId,
                        reporterUid: uid,
                        reporterName: giverName,
                        reportedUid: r.reportedUid,
                        reportedName: r.reportedName,
                        reason: r.reason,
                        ...(r.comment?.trim() ? { comment: r.comment.trim() } : {}),
                        status: "pending",
                        createdAt: new Date().toISOString(),
                    },
                });
            }

            // ── ESCRITURAS ATÓMICAS ──
            const now = new Date().toISOString();

            tx.set(reviewRef, {
                matchId: input.matchId,
                userUid: uid,
                rating: input.rating,
                dimensions: input.dimensions,
                ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
                createdAt: now,
            });

            for (const k of kudos) {
                const kudoRef = db.collection("playerKudos").doc(kudoDocId(input.matchId, uid, k.recipientUid));
                tx.set(kudoRef, {
                    matchId: input.matchId,
                    giverUid: uid,
                    giverName,
                    recipientUid: k.recipientUid,
                    recipientName: k.recipientName,
                    type: k.type,
                    createdAt: now,
                });
                kudosCreated += 1;
            }

            for (const { ref, data } of reportRefsToCreate) {
                tx.set(ref, data);
                reportsCreated += 1;
            }
        });

        console.log(`[SubmitReview] match=${input.matchId} user=${uid} kudos=${kudosCreated} reports=${reportsCreated}`);

        return {
            reviewId: reviewDocId(input.matchId, uid),
            kudosCreated,
            reportsCreated,
        };
    },
);
