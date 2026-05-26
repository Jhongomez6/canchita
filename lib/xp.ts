/**
 * ========================
 * XP API — CLIENT (READ-ONLY)
 * ========================
 *
 * Specification-Driven Development (SDD): docs/XP_LEVELS_SYSTEM_SDD.md
 *
 * Capa de lectura del sistema de XP. Toda escritura ocurre en Cloud Functions
 * (firestore.rules deniegan cualquier intento del cliente de patch a xp/xpLevel/xpTier).
 *
 * Funciones expuestas:
 *  - getXpHistory(uid, limit): historial paginado de eventos del usuario.
 *  - getMyXpSummary(uid): snapshot rápido del estado de XP.
 *  - markXpOnboardingSeen(uid): persiste el flag de modal visto (UNICA ESCRITURA del cliente).
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit as fbLimit,
    orderBy,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { XpEvent, XpTier, AchievementId } from "./domain/xp";
import { calcLevelFromXp, calcTierFromLevel, ovrFromLevel, xpToNextLevel } from "./domain/xp";

const DEFAULT_HISTORY_LIMIT = 20;

export interface XpSummary {
    xp: number;
    level: number;
    tier: XpTier;
    ovr: number;
    toNext: { current: number; needed: number; nextLevelXp: number; isMax: boolean };
    achievements: AchievementId[];
    lastEvent: string | null;
}

/**
 * Trae el resumen de XP del usuario. Calcula derivados (level/tier/ovr) localmente
 * por si el doc viene sin cachear todavía (user creado pre-deploy sin backfill).
 */
export async function getMyXpSummary(uid: string): Promise<XpSummary> {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.data() ?? {};
    const xp = (data.xp as number | undefined) ?? 0;
    const level = (data.xpLevel as number | undefined) ?? calcLevelFromXp(xp);
    const tier = (data.xpTier as XpTier | undefined) ?? calcTierFromLevel(level);
    const ovr = ovrFromLevel(level);
    const achievements = Object.keys(data.achievements ?? {}) as AchievementId[];
    const lastEvent = (data.xpLastEvent as string | undefined) ?? null;
    return {
        xp,
        level,
        tier,
        ovr,
        toNext: xpToNextLevel(xp),
        achievements,
        lastEvent,
    };
}

/**
 * Historial de eventos XP del usuario, ordenado descendente por fecha.
 * Por defecto trae los últimos 20.
 */
export async function getXpHistory(uid: string, limit: number = DEFAULT_HISTORY_LIMIT): Promise<XpEvent[]> {
    const q = query(
        collection(db, "xpEvents"),
        where("uid", "==", uid),
        orderBy("createdAt", "desc"),
        fbLimit(limit),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<XpEvent, "id">) }));
}

/**
 * Persiste que el user ya vio el modal de onboarding del sistema XP.
 * Esta es la ÚNICA escritura permitida del cliente sobre el doc del user
 * relacionada al sistema XP. Los rules expresamente la permiten.
 */
export async function markXpOnboardingSeen(uid: string): Promise<void> {
    await updateDoc(doc(db, "users", uid), {
        xpOnboardingSeenAt: new Date().toISOString(),
    });
}
