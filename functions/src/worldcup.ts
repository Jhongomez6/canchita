/**
 * ========================
 * WORLD CUP POLL FUNCTIONS
 * ========================
 *
 * Cloud Functions para la polla mundialista FIFA 2026 (fase de grupos):
 * - updateWorldCupMatchResult: super_admin carga/corrige el resultado de un partido
 * - onWorldCupMatchFinished: trigger que recalcula puntos y leaderboard al finalizar
 *
 * Ref: docs/POLLA_MUNDIALISTA_SDD.md
 *
 * Nota: functions/src es un módulo aislado — la lógica de scoring se inlinea aquí
 * (mirror de lib/domain/worldcup.ts). Mantener en sync.
 */

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

const db = admin.firestore();

const MAX_GOALS = 20;
const REGION = "us-central1";
const CHAMPION_POINTS = 10;
const RUNNERUP_POINTS = 5;

// ========================
// SCORING (mirror de lib/domain/worldcup.ts — mantener en sync)
// ========================

function outcome(home: number, away: number): "H" | "A" | "D" {
    if (home > away) return "H";
    if (home < away) return "A";
    return "D";
}

function scoreForPrediction(
    pred: { homeGoals: number; awayGoals: number },
    result: { home: number; away: number },
): 0 | 1 | 3 {
    if (pred.homeGoals === result.home && pred.awayGoals === result.away) return 3;
    return outcome(pred.homeGoals, pred.awayGoals) === outcome(result.home, result.away) ? 1 : 0;
}

/**
 * Lado ganador de un partido de eliminación FINISHED (mirror de lib/domain/worldcup.ts).
 * Por marcador; si terminó empatado (penales) por `advancedTeam`; null si no se puede determinar.
 */
function knockoutWinnerSide(
    match: { score?: { home: number | null; away: number | null }; advancedTeam?: "home" | "away" },
): "home" | "away" | null {
    const home = match.score?.home;
    const away = match.score?.away;
    if (home == null || away == null) return null;
    if (home > away) return "home";
    if (away > home) return "away";
    return match.advancedTeam ?? null;
}

// ========================
// updateWorldCupMatchResult — onCall (solo super_admin)
// ========================

export const updateWorldCupMatchResult = onCall(
    { region: REGION },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const uid = request.auth.uid;

        // Verificar rol super_admin con datos frescos del servidor
        const userSnap = await db.collection("users").doc(uid).get();
        if (userSnap.data()?.adminType !== "super_admin") {
            throw new HttpsError("permission-denied", "Solo el administrador puede cargar resultados");
        }

        const { matchId, homeGoals, awayGoals, advancedTeam } = request.data ?? {};

        if (typeof matchId !== "string" || matchId.length === 0) {
            throw new HttpsError("invalid-argument", "matchId es requerido");
        }
        if (!Number.isInteger(homeGoals) || homeGoals < 0 || homeGoals > MAX_GOALS) {
            throw new HttpsError("invalid-argument", `Goles del local inválidos (0-${MAX_GOALS})`);
        }
        if (!Number.isInteger(awayGoals) || awayGoals < 0 || awayGoals > MAX_GOALS) {
            throw new HttpsError("invalid-argument", `Goles del visitante inválidos (0-${MAX_GOALS})`);
        }

        const matchRef = db.collection("worldcupMatches").doc(matchId);
        const matchSnap = await matchRef.get();
        if (!matchSnap.exists) {
            throw new HttpsError("not-found", "El partido no existe");
        }

        const match = matchSnap.data() as {
            status?: string;
            phase?: string;
            score?: { home: number | null; away: number | null };
            advancedTeam?: "home" | "away";
        };

        // En eliminación, si el partido terminó EMPATADO necesitamos saber quién avanzó
        // (penales). El marcador igual se puntúa como empate; advancedTeam solo sirve
        // para el auto-avance al siguiente cruce.
        const isKnockout = match.phase != null && match.phase !== "GROUP_STAGE";
        const isDraw = homeGoals === awayGoals;
        let advanced: "home" | "away" | null = null;
        if (isKnockout && isDraw) {
            if (advancedTeam !== "home" && advancedTeam !== "away") {
                throw new HttpsError("invalid-argument", "Empate en eliminación: indicá qué equipo avanzó");
            }
            advanced = advancedTeam;
        }

        // Idempotencia: si ya está FINISHED con el mismo marcador y mismo avance, no reescribir.
        if (
            match.status === "FINISHED" &&
            match.score?.home === homeGoals &&
            match.score?.away === awayGoals &&
            (match.advancedTeam ?? null) === advanced
        ) {
            return { ok: true, unchanged: true };
        }

        await matchRef.update({
            "score.home": homeGoals,
            "score.away": awayGoals,
            status: "FINISHED",
            // Guarda el avance solo si aplica; si no, lo limpia (corrección de empate → resultado decisivo).
            advancedTeam: advanced ?? admin.firestore.FieldValue.delete(),
            adminUpdatedAt: new Date().toISOString(),
        });

        // El recálculo del leaderboard y el auto-avance los dispara onWorldCupMatchFinished.
        return { ok: true };
    },
);

// ========================
// setWorldCupChampions — onCall (solo super_admin)
// ========================

export const setWorldCupChampions = onCall(
    { region: REGION },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const userSnap = await db.collection("users").doc(request.auth.uid).get();
        if (userSnap.data()?.adminType !== "super_admin") {
            throw new HttpsError("permission-denied", "Solo el administrador puede definir el campeón");
        }

        const { champion, runnerUp } = request.data ?? {};
        if (typeof champion !== "string" || champion.length === 0) {
            throw new HttpsError("invalid-argument", "Campeón inválido");
        }
        if (typeof runnerUp !== "string" || runnerUp.length === 0) {
            throw new HttpsError("invalid-argument", "Subcampeón inválido");
        }
        if (champion === runnerUp) {
            throw new HttpsError("invalid-argument", "Campeón y subcampeón deben ser distintos");
        }

        await db.collection("config").doc("worldcup").set({ champion, runnerUp }, { merge: true });

        // Recalcular el leaderboard de todos los usuarios con predicción de bracket.
        const bracketSnap = await db.collection("worldcupBracketPredictions").get();
        for (const doc of bracketSnap.docs) {
            await recalcUserLeaderboard(doc.id);
        }

        return { ok: true, recalculated: bracketSnap.size };
    },
);

// ========================
// clearWorldCupChampions — onCall (solo super_admin)
// Deja campeón/subcampeón en blanco y quita el bonus del leaderboard.
// ========================

export const clearWorldCupChampions = onCall(
    { region: REGION },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const userSnap = await db.collection("users").doc(request.auth.uid).get();
        if (userSnap.data()?.adminType !== "super_admin") {
            throw new HttpsError("permission-denied", "Solo el administrador puede borrar el campeón");
        }

        await db.collection("config").doc("worldcup").update({
            champion: admin.firestore.FieldValue.delete(),
            runnerUp: admin.firestore.FieldValue.delete(),
        });

        // Recalcular para quitar el bonus de todos los usuarios con bracket.
        const bracketSnap = await db.collection("worldcupBracketPredictions").get();
        for (const doc of bracketSnap.docs) {
            await recalcUserLeaderboard(doc.id);
        }

        return { ok: true, recalculated: bracketSnap.size };
    },
);

// ========================
// redeemWorldCupCode — onCall
// Activa el acceso del usuario (worldCupEnabled) si el código coincide.
// ========================

export const redeemWorldCupCode = onCall(
    { region: REGION },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const uid = request.auth.uid;

        const raw = request.data?.code;
        if (typeof raw !== "string" || raw.trim().length === 0) {
            throw new HttpsError("invalid-argument", "Ingresá un código");
        }
        const code = raw.trim().toUpperCase();

        const secretSnap = await db.collection("config").doc("worldcupSecret").get();
        const realCode = (secretSnap.data()?.accessCode as string | undefined)?.trim().toUpperCase();

        if (!realCode) {
            throw new HttpsError("failed-precondition", "La polla aún no tiene un código activo");
        }
        if (code !== realCode) {
            throw new HttpsError("permission-denied", "Código inválido");
        }

        await db.collection("users").doc(uid).update({ worldCupEnabled: true });
        return { ok: true };
    },
);

// ========================
// onWorldCupMatchFinished — trigger de recálculo
// ========================

export const onWorldCupMatchFinished = onDocumentUpdated(
    { document: "worldcupMatches/{matchId}", region: REGION },
    async (event) => {
        const before = event.data?.before?.data();
        const after = event.data?.after?.data();
        if (!before || !after) return;

        // Recalcular si: pasó a FINISHED, o si ya era FINISHED y cambió el marcador (corrección).
        const becameFinished = before.status !== "FINISHED" && after.status === "FINISHED";
        const scoreChanged =
            after.status === "FINISHED" &&
            (before.score?.home !== after.score?.home || before.score?.away !== after.score?.away);
        if (!becameFinished && !scoreChanged) return;

        const matchId = event.params.matchId;
        const result = { home: after.score?.home as number, away: after.score?.away as number };
        if (result.home == null || result.away == null) return;

        // 1. Puntuar todas las predicciones de este partido (batch).
        const predsSnap = await db
            .collection("worldcupPredictions")
            .where("matchId", "==", matchId)
            .get();

        const affectedUserIds = new Set<string>();
        let batch = db.batch();
        let ops = 0;
        for (const doc of predsSnap.docs) {
            const p = doc.data() as { userId: string; homeGoals: number; awayGoals: number };
            const points = scoreForPrediction(p, result);
            batch.update(doc.ref, { points });
            affectedUserIds.add(p.userId);
            if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
        }
        if (ops > 0) await batch.commit();

        // 2. Recalcular el agregado de leaderboard de cada usuario afectado DESDE CERO.
        //    (evita drift en correcciones de resultado)
        for (const userId of affectedUserIds) {
            await recalcUserLeaderboard(userId);
        }

        // 3. Auto-avance del cuadro: si es eliminación, propagar el ganador/perdedor
        //    al slot de la ronda siguiente (octavos → final se llenan solos).
        if (after.phase && after.phase !== "GROUP_STAGE") {
            await propagateBracket(matchId, after);
        }

        console.log(`[WorldCup] match ${matchId} FINISHED → ${predsSnap.size} predicciones, ${affectedUserIds.size} usuarios`);
    },
);

/**
 * Auto-avance del cuadro: cuando un partido de eliminación finaliza, escribe el
 * equipo ganador (o perdedor, para el 3er puesto) en el slot de la ronda siguiente
 * que lo referencia vía homeSource/awaySource. Idempotente.
 */
async function propagateBracket(
    matchId: string,
    match: FirebaseFirestore.DocumentData,
): Promise<void> {
    const winnerSide = knockoutWinnerSide(match);
    if (!winnerSide) {
        console.log(`[WorldCup] #${matchId} empate sin avance definido — no se propaga aún`);
        return;
    }
    const winner = winnerSide === "home" ? match.homeTeam : match.awayTeam;
    const loser = winnerSide === "home" ? match.awayTeam : match.homeTeam;
    if (!winner?.code) {
        // El ganador todavía es placeholder (no debería pasar si las rondas terminan en orden).
        console.warn(`[WorldCup] #${matchId} ganador sin resolver — no se propaga`);
        return;
    }

    const [homeDeps, awayDeps] = await Promise.all([
        db.collection("worldcupMatches").where("homeSource.matchId", "==", matchId).get(),
        db.collection("worldcupMatches").where("awaySource.matchId", "==", matchId).get(),
    ]);

    const writes: Promise<unknown>[] = [];
    for (const doc of homeDeps.docs) {
        const src = doc.data().homeSource as { type: "winner" | "loser" };
        writes.push(doc.ref.update({ homeTeam: src.type === "winner" ? winner : loser }));
    }
    for (const doc of awayDeps.docs) {
        const src = doc.data().awaySource as { type: "winner" | "loser" };
        writes.push(doc.ref.update({ awayTeam: src.type === "winner" ? winner : loser }));
    }
    await Promise.all(writes);
    console.log(`[WorldCup] #${matchId} → propagado ${winner.name} a ${writes.length} slot(s)`);
}

/**
 * Recalcula el entry de leaderboard de un usuario desde todas sus predicciones puntuadas.
 * Usa transaction para evitar carreras entre triggers concurrentes del mismo usuario.
 */
async function recalcUserLeaderboard(userId: string): Promise<void> {
    const predsSnap = await db
        .collection("worldcupPredictions")
        .where("userId", "==", userId)
        .get();

    let matchPoints = 0;
    let exactHits = 0;
    let resultHits = 0;
    let predictions = 0;
    let displayName = "";
    let photoURLThumb: string | undefined;

    for (const doc of predsSnap.docs) {
        const p = doc.data() as { points?: number; displayName?: string; photoURLThumb?: string };
        predictions++;
        if (p.displayName) displayName = p.displayName;
        if (p.photoURLThumb) photoURLThumb = p.photoURLThumb;
        if (p.points === 3) { matchPoints += 3; exactHits++; }
        else if (p.points === 1) { matchPoints += 1; resultHits++; }
    }

    // Bonus de bracket (campeón/subcampeón) si el torneo ya tiene resultado real.
    const [bracketSnap, configSnap] = await Promise.all([
        db.collection("worldcupBracketPredictions").doc(userId).get(),
        db.collection("config").doc("worldcup").get(),
    ]);
    const config = configSnap.data() as { champion?: string; runnerUp?: string } | undefined;
    let bracketPoints = 0;
    let championHit = false;
    let runnerUpHit = false;
    if (bracketSnap.exists && config?.champion && config?.runnerUp) {
        const b = bracketSnap.data() as { champion?: string; runnerUp?: string; displayName?: string; photoURLThumb?: string };
        if (b.champion === config.champion) { bracketPoints += CHAMPION_POINTS; championHit = true; }
        if (b.runnerUp === config.runnerUp) { bracketPoints += RUNNERUP_POINTS; runnerUpHit = true; }
        if (!displayName && b.displayName) displayName = b.displayName;
        if (!photoURLThumb && b.photoURLThumb) photoURLThumb = b.photoURLThumb;
    }

    // Fallback al perfil si nada traía snapshot de nombre.
    if (!displayName) {
        const userSnap = await db.collection("users").doc(userId).get();
        displayName = userSnap.data()?.name ?? "Jugador";
        if (!photoURLThumb) photoURLThumb = userSnap.data()?.photoURLThumb;
    }

    const entry: Record<string, unknown> = {
        userId,
        displayName,
        points: matchPoints + bracketPoints,
        exactHits,
        resultHits,
        predictions,
        bracketPoints,
        championHit,
        runnerUpHit,
        updatedAt: new Date().toISOString(),
    };
    if (photoURLThumb) entry.photoURLThumb = photoURLThumb;

    await db.runTransaction(async (tx) => {
        tx.set(db.collection("worldcupLeaderboard").doc(userId), entry);
    });
}
