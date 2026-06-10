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

        const { matchId, homeGoals, awayGoals } = request.data ?? {};

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

        const match = matchSnap.data() as { status?: string; score?: { home: number | null; away: number | null } };

        // Idempotencia: si ya está FINISHED con el mismo marcador, no reescribir.
        if (
            match.status === "FINISHED" &&
            match.score?.home === homeGoals &&
            match.score?.away === awayGoals
        ) {
            return { ok: true, unchanged: true };
        }

        await matchRef.update({
            "score.home": homeGoals,
            "score.away": awayGoals,
            status: "FINISHED",
            adminUpdatedAt: new Date().toISOString(),
        });

        // El recálculo del leaderboard lo dispara el trigger onWorldCupMatchFinished.
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

        console.log(`[WorldCup] match ${matchId} FINISHED → ${predsSnap.size} predicciones, ${affectedUserIds.size} usuarios`);
    },
);

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
