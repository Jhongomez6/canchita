/**
 * ========================
 * XP & LEVELS — CLOUD FUNCTIONS
 * ========================
 *
 * Specification-Driven Development (SDD): docs/XP_LEVELS_SYSTEM_SDD.md
 *
 * Triggers (server-only — los rules deniegan escritura del cliente a xp/xpLevel/xpTier/achievements):
 *  1. awardXpOnMatchStatsProcessed — match.statsProcessed false→true: otorga XP por
 *     jugar, ganar/empatar, puntualidad. NO MVP (eso se otorga al incrementar mvpAwards).
 *  2. awardXpOnKudoCreated         — playerKudos created: +5 al recipient, +2 al giver (cap 5/match).
 *  3. awardXpOnReviewCreated       — matchReviews created: +10 al user que envió la review.
 *  4. awardXpAndCheckAchievements  — users updated: si cambió mvpAwards, otorga MVP XP.
 *     Si cambiaron stats relevantes, revisa y desbloquea achievements.
 *  5. cleanupOldXpEvents           — scheduled mensual: borra xpEvents > 90 días.
 *
 * Callables admin:
 *  - recalculateUserXp(uid)     — recalcula desde cero (rescate).
 *  - backfillAllUsersXp()        — migración inicial one-shot.
 *
 * IMPORTANTE — DUPLICACIÓN INTENCIONAL:
 * Las constantes XP_AMOUNTS, la curva, el catálogo de achievements, etc. se duplican
 * en este archivo desde `lib/domain/xp.ts` (cliente). Esta es la convención del proyecto
 * (ver postMatchReview.ts). Cualquier cambio en uno DEBE replicarse en el otro.
 */

import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

const NOTIFICATION_TTL_MS = 10 * 24 * 60 * 60 * 1000;
const XP_EVENT_RETENTION_DAYS = 90;
const REGION = "us-central1";

// ========================
// CONSTANTES — MANTENER EN SYNC CON lib/domain/xp.ts
// ========================

const CURVE_EXPONENT = 1.45;
const CURVE_BASE = 50;
const MAX_LEVEL = 50;
const MIN_LEVEL = 1;

type XpTier = "suplente" | "titular" | "estrella" | "capitan" | "leyenda";

type XpSource =
    | "match_confirmed"
    | "match_confirmed_early"
    | "match_played"
    | "match_won"
    | "match_drawn"
    | "match_punctual"
    | "match_mvp"
    | "match_no_show"
    | "match_late"
    | "kudo_received"
    | "kudo_given"
    | "post_match_review_done"
    | "weekly_streak_milestone"
    | "commitment_streak_milestone"
    | "achievement_bonus"
    | "backfill_v1";

type AchievementId =
    | "first_match" | "matches_10" | "matches_25" | "matches_50" | "matches_100" | "matches_250"
    | "first_win" | "wins_10" | "wins_25" | "wins_50"
    | "first_mvp" | "mvp_5" | "mvp_10" | "mvp_25"
    | "weekly_streak_3" | "weekly_streak_5" | "weekly_streak_10" | "weekly_streak_25"
    | "commitment_streak_10" | "commitment_streak_25" | "commitment_streak_50"
    | "first_kudo_received" | "kudos_10" | "kudos_25" | "kudos_50" | "kudos_100"
    | "perfect_month" | "early_bird"
    | "veteran_year" | "review_master" | "all_tiers";

const XP_AMOUNTS = {
    MATCH_CONFIRMED: 5,
    MATCH_CONFIRMED_EARLY_BONUS: 5,
    MATCH_PLAYED: 25,
    MATCH_WON_BONUS: 10,
    MATCH_DRAWN_BONUS: 5,
    MATCH_PUNCTUAL: 5,
    MATCH_MVP: 50,
    MATCH_NO_SHOW: -50,
    MATCH_LATE: -10,
    KUDO_RECEIVED: 5,
    KUDO_GIVEN: 2,
    KUDO_CAP_PER_MATCH: 5,
    POST_MATCH_REVIEW: 10,
    WEEKLY_STREAK_MILESTONE: 20,
    COMMITMENT_STREAK_MILESTONE: 30,
} as const;

const TIER_LABEL: Record<XpTier, string> = {
    suplente: "Suplente",
    titular: "Titular",
    estrella: "Estrella",
    capitan: "Capitán",
    leyenda: "Leyenda",
};

// Achievement definitions: same shape as lib/domain/xp.ts but check() takes raw stats.
interface AchievementCheckContext {
    played: number;
    won: number;
    mvpAwards: number;
    kudosTotal: number;
    weeklyStreak: number;
    commitmentStreak: number;
    earlyConfirmCount: number;
    reviewCount: number;
    daysSinceFirstMatch: number;
    perfectMonths: number;
    xpTier: XpTier;
}

interface AchievementDef {
    id: AchievementId;
    label: string;
    xpBonus: number;
    check: (c: AchievementCheckContext) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
    { id: "first_match", label: "Debut", xpBonus: 50, check: (c) => c.played >= 1 },
    { id: "matches_10", label: "Habitué", xpBonus: 100, check: (c) => c.played >= 10 },
    { id: "matches_25", label: "Veterano", xpBonus: 200, check: (c) => c.played >= 25 },
    { id: "matches_50", label: "Imparable", xpBonus: 400, check: (c) => c.played >= 50 },
    { id: "matches_100", label: "Centenario", xpBonus: 1000, check: (c) => c.played >= 100 },
    { id: "matches_250", label: "Inquilino del Predio", xpBonus: 2500, check: (c) => c.played >= 250 },
    { id: "first_win", label: "Primera Victoria", xpBonus: 50, check: (c) => c.won >= 1 },
    { id: "wins_10", label: "Ganador", xpBonus: 150, check: (c) => c.won >= 10 },
    { id: "wins_25", label: "Triunfador", xpBonus: 300, check: (c) => c.won >= 25 },
    { id: "wins_50", label: "Implacable", xpBonus: 600, check: (c) => c.won >= 50 },
    { id: "first_mvp", label: "Primer MVP", xpBonus: 100, check: (c) => c.mvpAwards >= 1 },
    { id: "mvp_5", label: "Figura Repetida", xpBonus: 300, check: (c) => c.mvpAwards >= 5 },
    { id: "mvp_10", label: "Figura del Predio", xpBonus: 600, check: (c) => c.mvpAwards >= 10 },
    { id: "mvp_25", label: "Crack Indiscutido", xpBonus: 1500, check: (c) => c.mvpAwards >= 25 },
    { id: "weekly_streak_3", label: "Constante", xpBonus: 50, check: (c) => c.weeklyStreak >= 3 },
    { id: "weekly_streak_5", label: "Constancia", xpBonus: 200, check: (c) => c.weeklyStreak >= 5 },
    { id: "weekly_streak_10", label: "Inquebrantable", xpBonus: 500, check: (c) => c.weeklyStreak >= 10 },
    { id: "weekly_streak_25", label: "Maratonista", xpBonus: 1500, check: (c) => c.weeklyStreak >= 25 },
    { id: "commitment_streak_10", label: "Puntual", xpBonus: 150, check: (c) => c.commitmentStreak >= 10 },
    { id: "commitment_streak_25", label: "Reloj Suizo", xpBonus: 400, check: (c) => c.commitmentStreak >= 25 },
    { id: "commitment_streak_50", label: "Compromiso Total", xpBonus: 1000, check: (c) => c.commitmentStreak >= 50 },
    { id: "first_kudo_received", label: "Primer Reconocimiento", xpBonus: 50, check: (c) => c.kudosTotal >= 1 },
    { id: "kudos_10", label: "Apreciado", xpBonus: 100, check: (c) => c.kudosTotal >= 10 },
    { id: "kudos_25", label: "Querido", xpBonus: 200, check: (c) => c.kudosTotal >= 25 },
    { id: "kudos_50", label: "Admirado", xpBonus: 400, check: (c) => c.kudosTotal >= 50 },
    { id: "kudos_100", label: "Ídolo", xpBonus: 800, check: (c) => c.kudosTotal >= 100 },
    { id: "perfect_month", label: "Mes Perfecto", xpBonus: 300, check: (c) => c.perfectMonths >= 1 },
    { id: "early_bird", label: "Madrugador", xpBonus: 150, check: (c) => c.earlyConfirmCount >= 10 },
    { id: "veteran_year", label: "Aniversario", xpBonus: 500, check: (c) => c.daysSinceFirstMatch >= 365 },
    { id: "review_master", label: "Crítico", xpBonus: 200, check: (c) => c.reviewCount >= 20 },
    { id: "all_tiers", label: "Leyenda Confirmada", xpBonus: 2000, check: (c) => c.xpTier === "leyenda" },
];

// ========================
// FUNCIONES PURAS DE CURVA
// ========================

function xpForLevel(level: number): number {
    if (level <= MIN_LEVEL) return 0;
    if (level > MAX_LEVEL) return Math.floor(CURVE_BASE * Math.pow(MAX_LEVEL - 1, CURVE_EXPONENT));
    return Math.floor(CURVE_BASE * Math.pow(level - 1, CURVE_EXPONENT));
}

function calcLevelFromXp(xp: number): number {
    if (xp <= 0) return MIN_LEVEL;
    for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) {
        if (xp >= xpForLevel(level)) return level;
    }
    return MIN_LEVEL;
}

function calcTierFromLevel(level: number): XpTier {
    if (level <= 10) return "suplente";
    if (level <= 20) return "titular";
    if (level <= 30) return "estrella";
    if (level <= 40) return "capitan";
    return "leyenda";
}

function ovrFromLevel(level: number): number {
    return Math.max(50, Math.min(99, 49 + level));
}

function buildXpEventId(uid: string, source: XpSource, contextId: string): string {
    return `${uid}_${source}_${contextId}`;
}

/**
 * Espejo server-side de `hasXpAccess(profile)` en lib/domain/user.ts.
 * Solo super_admins o usuarios con la FF `xpEnabled === true` acumulan XP,
 * desbloquean achievements y reciben notifs del sistema. El retroactivo al activar
 * la FF se hace mediante el script `scripts/backfillXp.js` (no por background accumulation).
 */
function hasXpAccess(userData: Record<string, unknown>): boolean {
    if (userData.xpEnabled === true) return true;
    const roles = userData.roles;
    const isAdmin = Array.isArray(roles) && roles.includes("admin");
    return isAdmin && userData.adminType === "super_admin";
}

// ========================
// HELPER CENTRAL: awardXp
// ========================

interface AwardXpInput {
    uid: string;
    source: XpSource;
    contextId: string;
    amount: number;
    reason: string;
}

interface AwardXpResult {
    skipped: boolean;         // true si era idempotente (evento ya existía)
    levelChanged: boolean;
    tierChanged: boolean;
    fromLevel: number;
    toLevel: number;
    fromTier: XpTier;
    toTier: XpTier;
    newXp: number;
}

/**
 * Otorga XP a un usuario de forma atómica e idempotente.
 *
 * Idempotencia: el doc xpEvents/{uid}_{source}_{contextId} es único y determinístico.
 * Si ya existe, la transacción aborta silenciosamente sin modificar el user.
 *
 * Regla de piso: el XP nunca baja del threshold del nivel actual.
 * Side-effects (notif de level-up) se disparan POST-COMMIT en el caller, no acá.
 */
async function awardXp(input: AwardXpInput): Promise<AwardXpResult> {
    const eventId = buildXpEventId(input.uid, input.source, input.contextId);
    const eventRef = db.collection("xpEvents").doc(eventId);
    const userRef = db.collection("users").doc(input.uid);

    return await db.runTransaction(async (tx) => {
        const [eventSnap, userSnap] = await Promise.all([tx.get(eventRef), tx.get(userRef)]);

        if (eventSnap.exists) {
            // Idempotente: ya se otorgó este evento. Sin cambios.
            const u = userSnap.data() ?? {};
            const lvl = (u.xpLevel as number | undefined) ?? MIN_LEVEL;
            const tr = (u.xpTier as XpTier | undefined) ?? calcTierFromLevel(lvl);
            return {
                skipped: true,
                levelChanged: false,
                tierChanged: false,
                fromLevel: lvl,
                toLevel: lvl,
                fromTier: tr,
                toTier: tr,
                newXp: (u.xp as number | undefined) ?? 0,
            };
        }

        if (!userSnap.exists) {
            // User no existe (borrado entre eventos). Skip silencioso.
            console.warn(`[awardXp] User ${input.uid} no existe; skipping ${input.source}/${input.contextId}`);
            return {
                skipped: true,
                levelChanged: false, tierChanged: false,
                fromLevel: MIN_LEVEL, toLevel: MIN_LEVEL,
                fromTier: "suplente", toTier: "suplente",
                newXp: 0,
            };
        }

        const u = userSnap.data() ?? {};

        // Feature flag: solo otorgar XP a usuarios con xpEnabled o super_admin.
        // No escribir xpEvents tampoco — al activar la FF, el retroactivo lo hace
        // backfillAllUsersXp / scripts/backfillXp.js desde stats acumulados.
        if (!hasXpAccess(u)) {
            const lvl = (u.xpLevel as number | undefined) ?? MIN_LEVEL;
            const tr = (u.xpTier as XpTier | undefined) ?? calcTierFromLevel(lvl);
            return {
                skipped: true,
                levelChanged: false, tierChanged: false,
                fromLevel: lvl, toLevel: lvl,
                fromTier: tr, toTier: tr,
                newXp: (u.xp as number | undefined) ?? 0,
            };
        }

        const currentXp = (u.xp as number | undefined) ?? 0;
        const currentLevel = (u.xpLevel as number | undefined) ?? calcLevelFromXp(currentXp);
        const currentTier = (u.xpTier as XpTier | undefined) ?? calcTierFromLevel(currentLevel);

        const levelFloor = xpForLevel(currentLevel);
        const newXp = Math.max(levelFloor, currentXp + input.amount);
        const newLevel = calcLevelFromXp(newXp);
        const newTier = calcTierFromLevel(newLevel);

        const now = new Date().toISOString();

        tx.set(eventRef, {
            uid: input.uid,
            source: input.source,
            contextId: input.contextId,
            amount: input.amount,
            reason: input.reason,
            createdAt: now,
        });

        tx.update(userRef, {
            xp: newXp,
            xpLevel: newLevel,
            xpTier: newTier,
            xpLastEvent: now,
        });

        return {
            skipped: false,
            levelChanged: newLevel !== currentLevel,
            tierChanged: newTier !== currentTier,
            fromLevel: currentLevel,
            toLevel: newLevel,
            fromTier: currentTier,
            toTier: newTier,
            newXp,
        };
    });
}

// ========================
// HELPER: Notif de level-up / tier-up
// ========================

async function sendLevelUpNotif(uid: string, result: AwardXpResult) {
    if (!result.levelChanged) return;
    try {
        const ovr = ovrFromLevel(result.toLevel);
        const title = result.tierChanged
            ? `🎉 ¡Nuevo Tier: ${TIER_LABEL[result.toTier]}!`
            : `⚡ Subiste al Nivel ${ovr}`;
        const body = result.tierChanged
            ? `Pasaste de ${TIER_LABEL[result.fromTier]} a ${TIER_LABEL[result.toTier]}. Tu nivel ahora es ${ovr}.`
            : `Tu nivel ahora es ${ovr}. ¡Seguí así!`;

        await db.collection("notifications").doc(uid).collection("items").add({
            title,
            body,
            type: result.tierChanged ? "xp_tier_up" : "xp_level_up",
            url: "/profile#xp",
            read: false,
            createdAt: new Date().toISOString(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
        });
    } catch (err) {
        console.error(`[awardXp] Notif level-up failed for ${uid} (non-fatal):`, err);
    }
}

async function sendAchievementNotif(uid: string, achievement: AchievementDef) {
    try {
        await db.collection("notifications").doc(uid).collection("items").add({
            title: `🏅 Logro desbloqueado: ${achievement.label}`,
            body: `Ganaste +${achievement.xpBonus} XP de bonus.`,
            type: "xp_achievement",
            url: "/profile#achievements",
            read: false,
            createdAt: new Date().toISOString(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
        });
    } catch (err) {
        console.error(`[awardXp] Notif achievement failed for ${uid}/${achievement.id} (non-fatal):`, err);
    }
}

// ========================
// TRIGGER 1: awardXpOnMatchStatsProcessed
// ========================

interface PlayerRef {
    uid?: string;
    name: string;
    confirmed?: boolean;
    attendance?: "present" | "late" | "no_show";
}

/**
 * Dispara cuando match.statsProcessed pasa false→true (admin guardó el resultado).
 * Otorga XP por jugar, ganar/empatar, puntualidad a cada jugador con uid.
 * NO incluye MVP (eso lo hace el trigger 4 al cambiar mvpAwards).
 *
 * Idempotencia: flag `match.xpAwarded === true` luego del primer procesamiento.
 * Re-cierres del partido NO duplican XP.
 */
export const awardXpOnMatchStatsProcessed = onDocumentUpdated(
    { document: "matches/{matchId}", region: REGION },
    async (event) => {
        const before = event.data?.before?.data();
        const after = event.data?.after?.data();
        if (!before || !after) return;

        // Trigger condition: statsProcessed pasa false→true
        if (before.statsProcessed === true || after.statsProcessed !== true) return;

        // Idempotencia adicional: si xpAwarded ya está marcado, skip
        if (after.xpAwarded === true) return;

        const matchId = event.params.matchId;
        const matchRef = db.collection("matches").doc(matchId);

        const score = after.score as { A: number; B: number } | undefined;
        const teams = after.teams as { A: PlayerRef[]; B: PlayerRef[] } | undefined;
        const players = (after.players ?? []) as PlayerRef[];

        if (!teams) {
            console.warn(`[awardXpOnMatchStatsProcessed] Match ${matchId} sin teams; skipping XP`);
            await matchRef.update({ xpAwarded: true });
            return;
        }

        // Determinar a qué equipo perteneció cada uid
        const teamOfUid = new Map<string, "A" | "B">();
        for (const p of teams.A ?? []) if (p.uid) teamOfUid.set(p.uid, "A");
        for (const p of teams.B ?? []) if (p.uid) teamOfUid.set(p.uid, "B");

        // Mapa de attendance por uid (del array players)
        const attendanceOfUid = new Map<string, PlayerRef["attendance"]>();
        for (const p of players) {
            if (p.uid && !p.uid.startsWith("guest_")) attendanceOfUid.set(p.uid, p.attendance ?? "present");
        }

        // Para cada jugador con uid: calcular eventos XP
        const processed: string[] = [];
        for (const [uid, team] of teamOfUid.entries()) {
            const attendance = attendanceOfUid.get(uid) ?? "present";
            const wasNoShow = attendance === "no_show";
            const wasLate = attendance === "late";

            let won = false;
            let drawn = false;
            if (score) {
                const myScore = team === "A" ? score.A : score.B;
                const oppScore = team === "A" ? score.B : score.A;
                if (myScore > oppScore) won = true;
                else if (myScore === oppScore) drawn = true;
            }

            const events: Array<{ source: XpSource; amount: number; reason: string }> = [];

            if (wasNoShow) {
                events.push({ source: "match_no_show", amount: XP_AMOUNTS.MATCH_NO_SHOW, reason: "Faltaste al partido sin avisar" });
            } else {
                events.push({ source: "match_confirmed", amount: XP_AMOUNTS.MATCH_CONFIRMED, reason: "Confirmaste tu lugar" });
                events.push({ source: "match_played", amount: XP_AMOUNTS.MATCH_PLAYED, reason: "Jugaste el partido" });
                if (won) {
                    events.push({ source: "match_won", amount: XP_AMOUNTS.MATCH_WON_BONUS, reason: "Ganaron el partido" });
                } else if (drawn) {
                    events.push({ source: "match_drawn", amount: XP_AMOUNTS.MATCH_DRAWN_BONUS, reason: "Empataron el partido" });
                }
                if (wasLate) {
                    events.push({ source: "match_late", amount: XP_AMOUNTS.MATCH_LATE, reason: "Llegaste tarde al partido" });
                } else {
                    events.push({ source: "match_punctual", amount: XP_AMOUNTS.MATCH_PUNCTUAL, reason: "Llegaste a tiempo" });
                }
            }

            let lastResult: AwardXpResult | null = null;
            for (const ev of events) {
                try {
                    const r = await awardXp({
                        uid,
                        source: ev.source,
                        contextId: matchId,
                        amount: ev.amount,
                        reason: ev.reason,
                    });
                    if (!r.skipped) lastResult = r;
                } catch (err) {
                    console.error(`[awardXpOnMatchStatsProcessed] ${uid} ${ev.source}:`, err);
                }
            }

            if (lastResult) {
                await sendLevelUpNotif(uid, lastResult);
            }
            processed.push(uid);
        }

        // Marca el match como procesado para idempotencia
        await matchRef.update({ xpAwarded: true });

        console.log(`[awardXpOnMatchStatsProcessed] Match ${matchId} — XP otorgado a ${processed.length} jugadores`);
    },
);

// ========================
// TRIGGER 2: awardXpOnKudoCreated
// ========================

/**
 * Otorga +5 XP al recipient y +2 XP al giver por un kudo.
 * Cap: máximo 5 kudos cuentan por jugador por partido (giver y receiver por separado).
 * El cap se garantiza por idempotencia: contextId = `${matchId}_${otherPartyUid}` y solo el primer kudo cuenta.
 * (Doc id del kudo es `${matchId}_${giverUid}_${recipientUid}`, único por par — no se puede dar dos kudos
 *  al mismo recipient en el mismo match; el cap real es 1 kudo por par por match).
 */
export const awardXpOnKudoCreated = onDocumentCreated(
    { document: "playerKudos/{kudoId}", region: REGION },
    async (event) => {
        const kudo = event.data?.data();
        if (!kudo) return;
        const { matchId, giverUid, recipientUid } = kudo as {
            matchId: string; giverUid: string; recipientUid: string;
        };
        if (!matchId || !giverUid || !recipientUid) return;

        try {
            // XP al recipient
            const recRes = await awardXp({
                uid: recipientUid,
                source: "kudo_received",
                contextId: `${matchId}_${giverUid}`,
                amount: XP_AMOUNTS.KUDO_RECEIVED,
                reason: "Recibiste un reconocimiento de un compañero",
            });
            if (!recRes.skipped) await sendLevelUpNotif(recipientUid, recRes);

            // XP al giver
            const giverRes = await awardXp({
                uid: giverUid,
                source: "kudo_given",
                contextId: `${matchId}_${recipientUid}`,
                amount: XP_AMOUNTS.KUDO_GIVEN,
                reason: "Diste un reconocimiento a un compañero",
            });
            if (!giverRes.skipped) await sendLevelUpNotif(giverUid, giverRes);
        } catch (err) {
            console.error(`[awardXpOnKudoCreated] error:`, err);
        }
    },
);

// ========================
// TRIGGER 3: awardXpOnReviewCreated
// ========================

/**
 * Otorga +10 XP al user por completar el post-match review.
 * Idempotente por matchId.
 * También incrementa el contador reviewCount (para achievement "Crítico").
 */
export const awardXpOnReviewCreated = onDocumentCreated(
    { document: "matchReviews/{reviewId}", region: REGION },
    async (event) => {
        const review = event.data?.data();
        if (!review) return;
        const { matchId, userUid } = review as { matchId: string; userUid: string };
        if (!matchId || !userUid) return;

        try {
            // Incrementa contador reviewCount (para achievement "review_master")
            await db.collection("users").doc(userUid).update({
                reviewCount: admin.firestore.FieldValue.increment(1),
            });

            const res = await awardXp({
                uid: userUid,
                source: "post_match_review_done",
                contextId: matchId,
                amount: XP_AMOUNTS.POST_MATCH_REVIEW,
                reason: "Calificaste el partido",
            });
            if (!res.skipped) await sendLevelUpNotif(userUid, res);
        } catch (err) {
            console.error(`[awardXpOnReviewCreated] error:`, err);
        }
    },
);

// ========================
// TRIGGER 4: awardXpAndCheckAchievements
// ========================

/**
 * Trigger central para:
 *  (a) Otorgar XP por MVP cuando `mvpAwards` se incrementa.
 *  (b) Detectar y desbloquear achievements al cambiar stats/streaks/kudosSummary.
 *
 * Evita loops infinitos porque:
 *  - Solo actúa si cambian campos "fuente" (stats, mvpAwards, kudosSummary, streaks, etc.)
 *  - Sus propias escrituras (xp/xpLevel/xpTier/achievements) NO disparan re-procesamiento
 *    porque la condición de cambio se hace sobre campos diferentes.
 */
export const awardXpAndCheckAchievements = onDocumentUpdated(
    { document: "users/{uid}", region: REGION },
    async (event) => {
        const before = event.data?.before?.data() ?? {};
        const after = event.data?.after?.data() ?? {};
        const uid = event.params.uid;

        // Evita loops: si solo cambiaron campos del propio sistema XP, no procesamos.
        const sourcesChanged = (
            (before.mvpAwards ?? 0) !== (after.mvpAwards ?? 0)
            || JSON.stringify(before.stats ?? {}) !== JSON.stringify(after.stats ?? {})
            || JSON.stringify(before.kudosSummary ?? {}) !== JSON.stringify(after.kudosSummary ?? {})
            || (before.weeklyStreak ?? 0) !== (after.weeklyStreak ?? 0)
            || (before.commitmentStreak ?? 0) !== (after.commitmentStreak ?? 0)
            || (before.earlyConfirmCount ?? 0) !== (after.earlyConfirmCount ?? 0)
            || (before.reviewCount ?? 0) !== (after.reviewCount ?? 0)
            || (before.perfectMonths ?? 0) !== (after.perfectMonths ?? 0)
            || (before.firstMatchAt ?? "") !== (after.firstMatchAt ?? "")
        );
        if (!sourcesChanged) return;

        // (a) MVP: si mvpAwards aumentó, otorgar XP por cada nuevo MVP
        const mvpBefore = (before.mvpAwards as number | undefined) ?? 0;
        const mvpAfter = (after.mvpAwards as number | undefined) ?? 0;
        if (mvpAfter > mvpBefore) {
            for (let n = mvpBefore + 1; n <= mvpAfter; n++) {
                try {
                    const res = await awardXp({
                        uid,
                        source: "match_mvp",
                        contextId: `mvp_${n}`, // contextId único por orden de MVP
                        amount: XP_AMOUNTS.MATCH_MVP,
                        reason: `Fuiste MVP del partido (#${n})`,
                    });
                    if (!res.skipped) await sendLevelUpNotif(uid, res);
                } catch (err) {
                    console.error(`[awardXpAndCheckAchievements] MVP XP failed for ${uid}:`, err);
                }
            }
        }

        // (b) Achievements: reconstruir contexto y desbloquear los que correspondan
        await checkAndUnlockAchievements(uid, after);
    },
);

async function checkAndUnlockAchievements(uid: string, userData: Record<string, unknown>) {
    // Feature flag: usuarios sin xpEnabled no desbloquean logros ni reciben notifs.
    if (!hasXpAccess(userData)) return;

    const stats = (userData.stats as { played?: number; won?: number } | undefined) ?? {};
    const xpLevel = (userData.xpLevel as number | undefined) ?? MIN_LEVEL;
    const xpTier = (userData.xpTier as XpTier | undefined) ?? calcTierFromLevel(xpLevel);

    const firstMatchAt = userData.firstMatchAt as string | undefined;
    const daysSinceFirstMatch = firstMatchAt
        ? Math.floor((Date.now() - new Date(firstMatchAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

    const ctx: AchievementCheckContext = {
        played: stats.played ?? 0,
        won: stats.won ?? 0,
        mvpAwards: (userData.mvpAwards as number | undefined) ?? 0,
        kudosTotal: ((userData.kudosSummary as { total?: number } | undefined)?.total) ?? 0,
        weeklyStreak: (userData.weeklyStreak as number | undefined) ?? 0,
        commitmentStreak: (userData.commitmentStreak as number | undefined) ?? 0,
        earlyConfirmCount: (userData.earlyConfirmCount as number | undefined) ?? 0,
        reviewCount: (userData.reviewCount as number | undefined) ?? 0,
        daysSinceFirstMatch,
        perfectMonths: (userData.perfectMonths as number | undefined) ?? 0,
        xpTier,
    };

    const already = (userData.achievements as Record<string, unknown> | undefined) ?? {};
    const alreadyIds = new Set(Object.keys(already));

    const toUnlock = ACHIEVEMENTS.filter((a) => !alreadyIds.has(a.id) && a.check(ctx));
    if (toUnlock.length === 0) return;

    const userRef = db.collection("users").doc(uid);
    const now = new Date().toISOString();

    // Marcar achievements como desbloqueados (update único con todos los campos)
    const updates: Record<string, unknown> = {};
    for (const ach of toUnlock) {
        updates[`achievements.${ach.id}`] = { unlockedAt: now, xpBonus: ach.xpBonus };
    }
    await userRef.update(updates);

    // Otorgar XP bonus por cada achievement + notif
    for (const ach of toUnlock) {
        try {
            const res = await awardXp({
                uid,
                source: "achievement_bonus",
                contextId: ach.id,
                amount: ach.xpBonus,
                reason: `Logro: ${ach.label}`,
            });
            await sendAchievementNotif(uid, ach);
            if (!res.skipped) await sendLevelUpNotif(uid, res);
        } catch (err) {
            console.error(`[checkAndUnlockAchievements] ${uid} ${ach.id}:`, err);
        }
    }

    console.log(`[Achievements] ${uid} desbloqueó ${toUnlock.length}: ${toUnlock.map((a) => a.id).join(", ")}`);
}

// ========================
// TRIGGER 5: cleanupOldXpEvents (scheduled)
// ========================

/**
 * Borra xpEvents con más de 90 días. Corre el 1ro de cada mes a las 3 AM UTC.
 * La fuente de verdad del XP es users/{uid}.xp; los eventos solo son auditoría/historial.
 */
export const cleanupOldXpEvents = onSchedule(
    { schedule: "0 3 1 * *", region: REGION, maxInstances: 1 },
    async () => {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - XP_EVENT_RETENTION_DAYS);
        const cutoffIso = threshold.toISOString();

        const expired = await db
            .collection("xpEvents")
            .where("createdAt", "<", cutoffIso)
            .limit(500)
            .get();

        if (expired.empty) {
            console.log("[cleanupOldXpEvents] Sin eventos viejos para limpiar");
            return;
        }

        const batch = db.batch();
        for (const doc of expired.docs) batch.delete(doc.ref);
        await batch.commit();

        console.log(`[cleanupOldXpEvents] Borrados ${expired.size} eventos (>${XP_EVENT_RETENTION_DAYS}d)`);
    },
);

// ========================
// CALLABLE: recalculateUserXp (admin)
// ========================

/**
 * Recalcula el XP de un usuario desde cero usando estimateHistoricalXp.
 * Útil cuando datos se corrompen o se desincronizan. Solo admin.
 *
 * NO BORRA xpEvents — solo sobrescribe xp/xpLevel/xpTier en el user.
 */
export const recalculateUserXp = onCall(
    { maxInstances: 5, region: REGION },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }

        // Check admin
        const callerSnap = await db.collection("users").doc(request.auth.uid).get();
        const callerData = callerSnap.data() ?? {};
        const isAdmin = callerData.role === "admin" || (Array.isArray(callerData.roles) && callerData.roles.includes("admin"));
        if (!isAdmin) {
            throw new HttpsError("permission-denied", "Solo admins pueden recalcular XP.");
        }

        const targetUid = request.data?.uid as string | undefined;
        if (!targetUid) {
            throw new HttpsError("invalid-argument", "uid es requerido.");
        }

        const targetSnap = await db.collection("users").doc(targetUid).get();
        if (!targetSnap.exists) {
            throw new HttpsError("not-found", `User ${targetUid} no existe.`);
        }
        const userData = targetSnap.data() ?? {};

        const xp = estimateHistoricalXp(userData);
        const level = calcLevelFromXp(xp);
        const tier = calcTierFromLevel(level);

        await db.collection("users").doc(targetUid).update({
            xp,
            xpLevel: level,
            xpTier: tier,
            xpLastEvent: new Date().toISOString(),
        });

        return { uid: targetUid, xp, level, tier };
    },
);

// ========================
// CALLABLE: backfillAllUsersXp (admin, one-shot)
// ========================

/**
 * Migración inicial: recorre todos los users y estima su XP histórico desde stats.
 * Idempotente: usa source="backfill_v1" + contextId="history" → mismo doc, no duplica.
 * Solo admin. Puede correrse varias veces — el flag _migration.xpBackfillV1 indica si ya pasó.
 *
 * Procesa hasta 500 users por ejecución (para Cloud Functions cold start budget).
 * Si hay más, debe re-llamarse.
 */
export const backfillAllUsersXp = onCall(
    { maxInstances: 1, region: REGION, timeoutSeconds: 540, memory: "512MiB" },
    async (request): Promise<{ processed: number; skipped: number; hasMore: boolean }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

        const callerSnap = await db.collection("users").doc(request.auth.uid).get();
        const callerData = callerSnap.data() ?? {};
        const isAdmin = callerData.role === "admin" || (Array.isArray(callerData.roles) && callerData.roles.includes("admin"));
        if (!isAdmin) throw new HttpsError("permission-denied", "Solo admins pueden ejecutar el backfill.");

        // Procesa users que aún no tienen el flag de migración
        const BATCH = 500;
        const candidates = await db.collection("users")
            .limit(BATCH)
            .get();

        let processed = 0;
        let skipped = 0;

        for (const doc of candidates.docs) {
            const data = doc.data() ?? {};
            const alreadyMigrated = data._migration?.xpBackfillV1 != null;
            const hasXp = typeof data.xp === "number";

            if (alreadyMigrated || hasXp) {
                skipped += 1;
                continue;
            }

            const xp = estimateHistoricalXp(data);
            const level = calcLevelFromXp(xp);
            const tier = calcTierFromLevel(level);
            const now = new Date().toISOString();

            try {
                // 1) Setear xp/level/tier
                await doc.ref.update({
                    xp,
                    xpLevel: level,
                    xpTier: tier,
                    xpLastEvent: now,
                    "_migration.xpBackfillV1": { runAt: now, version: 1 },
                });

                // 2) Crear evento de auditoría para que aparezca en historial
                const eventId = buildXpEventId(doc.id, "backfill_v1", "history");
                await db.collection("xpEvents").doc(eventId).set({
                    uid: doc.id,
                    source: "backfill_v1",
                    contextId: "history",
                    amount: xp,
                    reason: "XP calculado desde tu historia previa",
                    createdAt: now,
                });

                processed += 1;
            } catch (err) {
                console.error(`[backfillAllUsersXp] Failed for ${doc.id}:`, err);
            }
        }

        const hasMore = candidates.size >= BATCH;
        console.log(`[backfillAllUsersXp] processed=${processed} skipped=${skipped} hasMore=${hasMore}`);
        return { processed, skipped, hasMore };
    },
);

// ========================
// HELPER: estimateHistoricalXp
// ========================

/**
 * Estima el XP histórico de un user desde sus stats actuales.
 * MANTENER EN SYNC con lib/domain/xp.ts → estimateHistoricalXp().
 */
function estimateHistoricalXp(userData: Record<string, unknown>): number {
    const stats = (userData.stats as Record<string, number> | undefined) ?? {};
    const played = stats.played ?? 0;
    const won = stats.won ?? 0;
    const draw = stats.draw ?? 0;
    const noShows = stats.noShows ?? 0;
    const lateArrivals = stats.lateArrivals ?? 0;
    const mvp = (userData.mvpAwards as number | undefined) ?? 0;
    const kudos = ((userData.kudosSummary as { total?: number } | undefined)?.total) ?? 0;

    const xp =
        played * XP_AMOUNTS.MATCH_PLAYED
        + won * XP_AMOUNTS.MATCH_WON_BONUS
        + draw * XP_AMOUNTS.MATCH_DRAWN_BONUS
        + mvp * XP_AMOUNTS.MATCH_MVP
        + kudos * XP_AMOUNTS.KUDO_RECEIVED
        + noShows * XP_AMOUNTS.MATCH_NO_SHOW
        + lateArrivals * XP_AMOUNTS.MATCH_LATE;

    return Math.max(0, xp);
}
