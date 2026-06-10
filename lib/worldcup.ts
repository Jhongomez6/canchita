/**
 * ========================
 * WORLD CUP POLL CLIENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/POLLA_MUNDIALISTA_SDD.md
 *
 * Lecturas de partidos/predicciones/leaderboard + escritura de predicción propia
 * + llamada a Cloud Function para cargar resultados (admin).
 */

import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
    getDocs,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";
import type {
    WCMatch,
    WCPrediction,
    WCLeaderboardEntry,
    WCConfig,
    WCBracketPrediction,
} from "./domain/worldcup";

const functions = getFunctions(app);

// ========================
// CONFIG
// ========================

/** Lee la config global de la polla. Si el doc no existe, la polla está apagada. */
export async function getWorldCupConfig(): Promise<WCConfig> {
    const snap = await getDoc(doc(db, "config", "worldcup"));
    if (!snap.exists()) return { pollEnabled: false };
    const d = snap.data();
    return {
        pollEnabled: d.pollEnabled === true,
        bracketDeadlineMs: typeof d.bracketDeadlineMs === "number" ? d.bracketDeadlineMs : undefined,
        champion: d.champion ?? undefined,
        runnerUp: d.runnerUp ?? undefined,
        joinByCodeOpen: d.joinByCodeOpen === true,
    };
}

// ========================
// PARTIDOS
// ========================

/** Todos los partidos de grupos, ordenados por hora de inicio. */
export async function getWorldCupMatches(): Promise<WCMatch[]> {
    const q = query(collection(db, "worldcupMatches"), orderBy("kickoffMs", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WCMatch);
}

/**
 * Partidos sin resultado cuyo kickoff ya pasó (para la página admin).
 * Ordenados por hora ascendente (los más viejos primero).
 */
export async function getPendingResultMatches(): Promise<WCMatch[]> {
    const q = query(
        collection(db, "worldcupMatches"),
        where("status", "==", "SCHEDULED"),
        orderBy("kickoffMs", "asc"),
    );
    const snap = await getDocs(q);
    const now = Date.now();
    return snap.docs
        .map((d) => d.data() as WCMatch)
        .filter((m) => m.kickoffMs <= now);
}

// ========================
// PREDICCIONES
// ========================

/** Todas las predicciones del usuario actual. */
export async function getUserPredictions(userId: string): Promise<WCPrediction[]> {
    const q = query(collection(db, "worldcupPredictions"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WCPrediction);
}

/**
 * Crea o actualiza la predicción del usuario para un partido.
 * El candado por tiempo (now < kickoff) lo refuerzan las Firestore rules.
 *
 * @param snapshot - displayName/photoURLThumb del usuario, para mostrar predicciones
 *                   ajenas sin join a /users.
 * @param createdAt - ISO de creación de la predicción existente (si la hay). Se pasa
 *                   desde el estado de la UI para NO leer el doc aquí: leer una predicción
 *                   inexistente de un partido futuro es rechazado por las rules (el read
 *                   ajeno solo se permite tras el kickoff).
 */
export async function savePrediction(
    userId: string,
    matchId: string,
    homeGoals: number,
    awayGoals: number,
    snapshot: { displayName: string; photoURLThumb?: string },
    createdAt?: string,
): Promise<void> {
    const id = `${userId}_${matchId}`;
    const ref = doc(db, "worldcupPredictions", id);
    const nowISO = new Date().toISOString();

    const data: Record<string, unknown> = {
        id,
        userId,
        matchId,
        homeGoals,
        awayGoals,
        displayName: snapshot.displayName,
        updatedAt: nowISO,
        createdAt: createdAt ?? nowISO,
    };
    // Evitar escribir undefined (Firestore lo rechaza)
    if (snapshot.photoURLThumb) data.photoURLThumb = snapshot.photoURLThumb;

    await setDoc(ref, data, { merge: true });
}

/**
 * Predicciones de todos los usuarios para un partido.
 * Las rules solo permiten leer ajenas si el partido ya arrancó.
 */
export async function getMatchPredictions(matchId: string): Promise<WCPrediction[]> {
    const q = query(collection(db, "worldcupPredictions"), where("matchId", "==", matchId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WCPrediction);
}

// ========================
// LEADERBOARD
// ========================

/** Top N del leaderboard, ordenado por puntos y desempatado por aciertos exactos. */
export async function getLeaderboard(max: number = 200): Promise<WCLeaderboardEntry[]> {
    const q = query(
        collection(db, "worldcupLeaderboard"),
        orderBy("points", "desc"),
        orderBy("exactHits", "desc"),
        firestoreLimit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WCLeaderboardEntry);
}

/** Entry de leaderboard del usuario actual (null si aún no puntuó). */
export async function getUserLeaderboardEntry(userId: string): Promise<WCLeaderboardEntry | null> {
    const snap = await getDoc(doc(db, "worldcupLeaderboard", userId));
    return snap.exists() ? (snap.data() as WCLeaderboardEntry) : null;
}

// ========================
// BRACKET — CAMPEÓN / SUBCAMPEÓN
// ========================

/** Predicción de bracket del usuario (null si no eligió aún). */
export async function getUserBracketPrediction(userId: string): Promise<WCBracketPrediction | null> {
    const snap = await getDoc(doc(db, "worldcupBracketPredictions", userId));
    return snap.exists() ? (snap.data() as WCBracketPrediction) : null;
}

/**
 * Guarda/actualiza la elección de campeón y subcampeón.
 * El candado por deadline lo refuerzan las Firestore rules.
 *
 * @param createdAt - ISO de creación previa (desde la UI) para no leer el doc.
 */
export async function saveBracketPrediction(
    userId: string,
    champion: string,
    runnerUp: string,
    snapshot: { displayName: string; photoURLThumb?: string },
    createdAt?: string,
): Promise<void> {
    const ref = doc(db, "worldcupBracketPredictions", userId);
    const nowISO = new Date().toISOString();
    const data: Record<string, unknown> = {
        userId,
        champion,
        runnerUp,
        displayName: snapshot.displayName,
        updatedAt: nowISO,
        createdAt: createdAt ?? nowISO,
    };
    if (snapshot.photoURLThumb) data.photoURLThumb = snapshot.photoURLThumb;
    await setDoc(ref, data, { merge: true });
}

/** Elecciones de bracket de todos (solo legible tras el deadline por las rules). */
export async function getBracketPredictions(): Promise<WCBracketPrediction[]> {
    const snap = await getDocs(collection(db, "worldcupBracketPredictions"));
    return snap.docs.map((d) => d.data() as WCBracketPrediction);
}

// ========================
// ADMIN — CARGA DE RESULTADOS (Cloud Function)
// ========================

/**
 * Carga o corrige el resultado de un partido. Solo super_admin (validado en la CF).
 * Dispara el recálculo automático del leaderboard.
 */
export async function updateMatchResult(
    matchId: string,
    homeGoals: number,
    awayGoals: number,
): Promise<void> {
    const fn = httpsCallable(functions, "updateWorldCupMatchResult");
    await fn({ matchId, homeGoals, awayGoals });
}

/**
 * Define el campeón y subcampeón real del torneo. Solo super_admin (validado en CF).
 * Recalcula el bonus de bracket de todos los usuarios.
 */
export async function setChampions(champion: string, runnerUp: string): Promise<void> {
    const fn = httpsCallable(functions, "setWorldCupChampions");
    await fn({ champion, runnerUp });
}

/**
 * Borra el campeón/subcampeón definidos (los deja en blanco) y quita el bonus.
 * Solo super_admin (validado en la CF).
 */
export async function clearChampions(): Promise<void> {
    const fn = httpsCallable(functions, "clearWorldCupChampions");
    await fn({});
}

// ========================
// CÓDIGO DE ACCESO (activación por código)
// ========================

/**
 * Canjea el código de acceso. Si es válido, la CF activa worldCupEnabled del usuario.
 * El perfil se refresca solo (AuthContext) o el caller redirige tras el éxito.
 */
export async function redeemAccessCode(code: string): Promise<void> {
    const fn = httpsCallable(functions, "redeemWorldCupCode");
    await fn({ code });
}

/** Lee el código de acceso actual (solo super_admin por rules). "" si no hay. */
export async function getAccessCode(): Promise<string> {
    const snap = await getDoc(doc(db, "config", "worldcupSecret"));
    return snap.exists() ? (snap.data().accessCode ?? "") : "";
}

/** Define/cambia el código de acceso (solo super_admin por rules). */
export async function setAccessCode(code: string): Promise<void> {
    await setDoc(doc(db, "config", "worldcupSecret"), { accessCode: code.trim() }, { merge: true });
}

/** Muestra/oculta el acceso por código en el menú para todos (solo super_admin). */
export async function setJoinByCodeOpen(open: boolean): Promise<void> {
    await setDoc(doc(db, "config", "worldcup"), { joinByCodeOpen: open }, { merge: true });
}

export interface WCParticipant {
    uid: string;
    name: string;
    email?: string;
    photoURLThumb?: string;
}

/**
 * Jugadores que tienen acceso a la polla por el flag worldCupEnabled
 * (es decir, los que canjearon el código). Para el panel admin.
 */
export async function getWorldCupParticipants(): Promise<WCParticipant[]> {
    const q = query(collection(db, "users"), where("worldCupEnabled", "==", true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const u = d.data();
        return { uid: d.id, name: u.name ?? "Jugador", email: u.email, photoURLThumb: u.photoURLThumb };
    });
}
