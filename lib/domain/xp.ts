/**
 * ========================
 * XP & LEVELS DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD): docs/XP_LEVELS_SYSTEM_SDD.md
 *
 * Sistema de Experiencia y Niveles (gamification de participación).
 *
 * ESPECIFICACIÓN:
 * - 50 niveles agrupados en 5 tiers: Suplente, Titular, Estrella, Capitán, Leyenda.
 * - XP perpetuo: nunca baja del threshold del nivel actual.
 * - OVR FIFA card: mapeo lineal `49 + xpLevel` (rango 50-99).
 * - Curva: `xpForLevel(n) = floor(50 * (n-1)^1.45)`. Total para nivel 50 ≈ 14.112.
 *
 * Reglas clave:
 * - El `xp`, `xpLevel`, `xpTier` se escriben SOLO desde Cloud Functions.
 * - Cliente lee y muestra; nunca calcula localmente la verdad (solo display previews).
 * - El cálculo del XP por partido es idempotente: cada source+contextId otorga 1 sola vez.
 */

import type { UserProfile, UserStats } from "./user";

// ========================
// TIPOS
// ========================

export type XpTier = "suplente" | "titular" | "estrella" | "capitan" | "leyenda";

export type XpSource =
    // Partido
    | "match_confirmed"
    | "match_confirmed_early"
    | "match_played"
    | "match_won"
    | "match_drawn"
    | "match_punctual"
    | "match_mvp"
    | "match_no_show"
    | "match_late"
    // Social
    | "kudo_received"
    | "kudo_given"
    | "post_match_review_done"
    // Rachas
    | "weekly_streak_milestone"
    | "commitment_streak_milestone"
    // Achievements
    | "achievement_bonus"
    // Sistema
    | "backfill_v1";

export type AchievementId =
    // Partidos jugados
    | "first_match" | "matches_10" | "matches_25" | "matches_50" | "matches_100" | "matches_250"
    // Victorias
    | "first_win" | "wins_10" | "wins_25" | "wins_50"
    // MVP
    | "first_mvp" | "mvp_5" | "mvp_10" | "mvp_25"
    // Rachas
    | "weekly_streak_3" | "weekly_streak_5" | "weekly_streak_10" | "weekly_streak_25"
    | "commitment_streak_10" | "commitment_streak_25" | "commitment_streak_50"
    // Sociales
    | "first_kudo_received" | "kudos_10" | "kudos_25" | "kudos_50" | "kudos_100"
    // Compromiso
    | "perfect_month"
    | "early_bird"
    // Especiales
    | "veteran_year"
    | "review_master"
    | "all_tiers";

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export type AchievementCategory =
    "matches" | "wins" | "mvp" | "streaks" | "social" | "commitment" | "special";

export interface AchievementUnlock {
    unlockedAt: string;       // ISO
    xpBonus: number;
}

export interface AchievementCheckContext {
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

export interface AchievementDef {
    id: AchievementId;
    label: string;
    description: string;
    icon: string;             // emoji o nombre de icon lucide
    xpBonus: number;
    tier: AchievementTier;
    category: AchievementCategory;
    check: (ctx: AchievementCheckContext) => boolean;
}

export interface XpEvent {
    id: string;               // `${uid}_${source}_${contextId}`
    uid: string;
    source: XpSource;
    contextId: string;
    amount: number;
    reason: string;           // legible en español
    createdAt: string;        // ISO
}

export interface XpAwardInput {
    uid: string;
    source: XpSource;
    contextId: string;
    amount: number;
    reason: string;
}

export interface XpAwardResult {
    source: XpSource;
    amount: number;
    reason: string;
}

// ========================
// CONSTANTES — TIER METADATA
// ========================

export interface TierMeta {
    label: string;
    minLevel: number;
    maxLevel: number;
    minOvr: number;
    maxOvr: number;
    badgeGradient: string;       // tailwind classes para el badge pill
    iconName: string;            // nombre del icon de lucide-react
    cardRarity: string;          // identificador interno de la rarity de FIFA card
}

export const TIER_META: Record<XpTier, TierMeta> = {
    suplente: {
        label: "Suplente",
        minLevel: 1,
        maxLevel: 10,
        minOvr: 50,
        maxOvr: 59,
        badgeGradient: "from-amber-700 to-orange-900",
        iconName: "Sprout",
        cardRarity: "bronze",
    },
    titular: {
        label: "Titular",
        minLevel: 11,
        maxLevel: 20,
        minOvr: 60,
        maxOvr: 69,
        badgeGradient: "from-slate-300 to-slate-500",
        iconName: "Shirt",
        cardRarity: "silver",
    },
    estrella: {
        label: "Estrella",
        minLevel: 21,
        maxLevel: 30,
        minOvr: 70,
        maxOvr: 79,
        badgeGradient: "from-amber-400 to-amber-600",
        iconName: "Star",
        cardRarity: "gold",
    },
    capitan: {
        label: "Capitán",
        minLevel: 31,
        maxLevel: 40,
        minOvr: 80,
        maxOvr: 89,
        badgeGradient: "from-emerald-500 to-emerald-700",
        iconName: "Trophy",
        cardRarity: "verde",
    },
    leyenda: {
        label: "Leyenda",
        minLevel: 41,
        maxLevel: 50,
        minOvr: 90,
        maxOvr: 99,
        badgeGradient: "from-purple-500 via-pink-500 to-amber-400",
        iconName: "Crown",
        cardRarity: "cosmic",
    },
};

export const TIER_ORDER: XpTier[] = ["suplente", "titular", "estrella", "capitan", "leyenda"];

// ========================
// CONSTANTES — XP AMOUNTS
// ========================

/**
 * Tabla canónica de XP por acción.
 * Fuente única de verdad: tanto Cloud Functions como UI (toasts) leen de acá.
 */
export const XP_AMOUNTS = {
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

export const SOURCE_META: Record<XpSource, { label: string; icon: string }> = {
    match_confirmed: { label: "Confirmaste tu lugar", icon: "✅" },
    match_confirmed_early: { label: "Confirmaste con anticipación", icon: "⏰" },
    match_played: { label: "Jugaste el partido", icon: "⚽" },
    match_won: { label: "¡Ganaron el partido!", icon: "🏆" },
    match_drawn: { label: "Empate", icon: "🤝" },
    match_punctual: { label: "Llegaste a tiempo", icon: "🎯" },
    match_mvp: { label: "Fuiste MVP", icon: "👑" },
    match_no_show: { label: "Faltaste sin avisar", icon: "❌" },
    match_late: { label: "Llegaste tarde", icon: "🐢" },
    kudo_received: { label: "Recibiste un kudo", icon: "👏" },
    kudo_given: { label: "Diste un kudo", icon: "🌟" },
    post_match_review_done: { label: "Calificaste el partido", icon: "📝" },
    weekly_streak_milestone: { label: "Mantuviste tu racha semanal", icon: "🔥" },
    commitment_streak_milestone: { label: "Racha de compromiso", icon: "💪" },
    achievement_bonus: { label: "Logro desbloqueado", icon: "🏅" },
    backfill_v1: { label: "XP histórico", icon: "📜" },
};

// ========================
// FUNCIONES DE CURVA
// ========================

const CURVE_EXPONENT = 1.45;
const CURVE_BASE = 50;
export const MAX_LEVEL = 50;
export const MIN_LEVEL = 1;

/**
 * XP total acumulado necesario para alcanzar el nivel N (inclusive).
 * Curva: floor(50 * (n-1)^1.45). xp_total(50) ≈ 14.112.
 *
 * - Con 1 partido/sem (~70 XP/sem): Leyenda en ~3.9 años.
 * - Con 2 partidos/sem (~120 XP/sem): Leyenda en ~2.3 años.
 */
export function xpForLevel(level: number): number {
    if (level <= MIN_LEVEL) return 0;
    if (level > MAX_LEVEL) return Math.floor(CURVE_BASE * Math.pow(MAX_LEVEL - 1, CURVE_EXPONENT));
    return Math.floor(CURVE_BASE * Math.pow(level - 1, CURVE_EXPONENT));
}

/** Nivel correspondiente a un XP total acumulado. */
export function calcLevelFromXp(xp: number): number {
    if (xp <= 0) return MIN_LEVEL;
    for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) {
        if (xp >= xpForLevel(level)) return level;
    }
    return MIN_LEVEL;
}

/** Tier correspondiente a un nivel. */
export function calcTierFromLevel(level: number): XpTier {
    if (level <= 10) return "suplente";
    if (level <= 20) return "titular";
    if (level <= 30) return "estrella";
    if (level <= 40) return "capitan";
    return "leyenda";
}

/**
 * OVR de la FIFA Card derivado del nivel. Mapeo lineal: nivel 1 → 50, nivel 50 → 99.
 * Cada tier ocupa exactamente 10 puntos de OVR.
 */
export function ovrFromLevel(level: number): number {
    return Math.max(50, Math.min(99, 49 + level));
}

/** Progreso al siguiente nivel a partir del XP total. */
export function xpToNextLevel(xp: number): {
    current: number;
    needed: number;
    nextLevelXp: number;
    isMax: boolean;
} {
    const level = calcLevelFromXp(xp);
    if (level >= MAX_LEVEL) {
        const floor = xpForLevel(MAX_LEVEL);
        return { current: xp - floor, needed: 0, nextLevelXp: floor, isMax: true };
    }
    const currentLevelFloor = xpForLevel(level);
    const nextLevelFloor = xpForLevel(level + 1);
    return {
        current: xp - currentLevelFloor,
        needed: nextLevelFloor - xp,
        nextLevelXp: nextLevelFloor - currentLevelFloor,
        isMax: false,
    };
}

/**
 * Garantiza que el XP propuesto no baje del threshold del nivel actual.
 * Regla del sistema: el XP nunca baja por debajo del piso del tier actual.
 */
export function clampXpToLevelFloor(xp: number, level: number): number {
    const floor = xpForLevel(level);
    return Math.max(floor, xp);
}

/**
 * Aplica una variación de XP al estado actual y devuelve el nuevo XP/level/tier.
 * Encapsula la regla "nunca baja del piso del nivel actual" — usar tanto en CF como en simulaciones UI.
 */
export function applyXpDelta(
    current: { xp: number; level: number },
    delta: number,
): { xp: number; level: number; tier: XpTier; levelChanged: boolean; tierChanged: boolean } {
    const levelFloor = xpForLevel(current.level);
    const newXp = Math.max(levelFloor, current.xp + delta);
    const newLevel = calcLevelFromXp(newXp);
    const newTier = calcTierFromLevel(newLevel);
    const currentTier = calcTierFromLevel(current.level);
    return {
        xp: newXp,
        level: newLevel,
        tier: newTier,
        levelChanged: newLevel !== current.level,
        tierChanged: newTier !== currentTier,
    };
}

// ========================
// CÁLCULO DE XP POR PARTIDO
// ========================

export interface MatchXpInput {
    won: boolean;
    drawn: boolean;
    lost: boolean;
    wasMvp: boolean;
    wasLate: boolean;
    wasNoShow: boolean;
    confirmedEarly: boolean;
    kudosReceived: number;
    kudosGiven: number;
}

/**
 * Calcula la lista de eventos XP que corresponden a un jugador por un partido.
 * No incluye 'achievement_bonus' (eso se evalúa por separado tras aplicar estos).
 * No incluye 'post_match_review_done' (se otorga al enviar el review, no al cerrar el partido).
 */
export function computeMatchXp(input: MatchXpInput): XpAwardResult[] {
    const events: XpAwardResult[] = [];

    // No-show: penalización fuerte. No suma ningún otro evento del partido (no jugó).
    if (input.wasNoShow) {
        events.push({
            source: "match_no_show",
            amount: XP_AMOUNTS.MATCH_NO_SHOW,
            reason: "Faltaste al partido sin avisar",
        });
        return events;
    }

    // Confirmación de asistencia
    events.push({
        source: "match_confirmed",
        amount: XP_AMOUNTS.MATCH_CONFIRMED,
        reason: "Confirmaste tu lugar",
    });
    if (input.confirmedEarly) {
        events.push({
            source: "match_confirmed_early",
            amount: XP_AMOUNTS.MATCH_CONFIRMED_EARLY_BONUS,
            reason: "Confirmaste con más de 24h de anticipación",
        });
    }

    // Jugar el partido (siempre se otorga si no fue no-show)
    events.push({
        source: "match_played",
        amount: XP_AMOUNTS.MATCH_PLAYED,
        reason: "Jugaste el partido",
    });

    // Resultado
    if (input.won) {
        events.push({
            source: "match_won",
            amount: XP_AMOUNTS.MATCH_WON_BONUS,
            reason: "Ganaron el partido",
        });
    } else if (input.drawn) {
        events.push({
            source: "match_drawn",
            amount: XP_AMOUNTS.MATCH_DRAWN_BONUS,
            reason: "Empataron el partido",
        });
    }

    // Puntualidad (no se otorga si llegó tarde)
    if (input.wasLate) {
        events.push({
            source: "match_late",
            amount: XP_AMOUNTS.MATCH_LATE,
            reason: "Llegaste tarde",
        });
    } else {
        events.push({
            source: "match_punctual",
            amount: XP_AMOUNTS.MATCH_PUNCTUAL,
            reason: "Llegaste a tiempo",
        });
    }

    // MVP
    if (input.wasMvp) {
        events.push({
            source: "match_mvp",
            amount: XP_AMOUNTS.MATCH_MVP,
            reason: "Fuiste MVP del partido",
        });
    }

    return events;
}

// ========================
// CATÁLOGO DE ACHIEVEMENTS
// ========================

export const ACHIEVEMENT_DEFS: Record<AchievementId, AchievementDef> = {
    // Partidos jugados
    first_match: {
        id: "first_match", label: "Debut", description: "Jugaste tu primer partido",
        icon: "⚽", xpBonus: 50, tier: "bronze", category: "matches",
        check: (c) => c.played >= 1,
    },
    matches_10: {
        id: "matches_10", label: "Habitué", description: "10 partidos jugados",
        icon: "🏟️", xpBonus: 100, tier: "bronze", category: "matches",
        check: (c) => c.played >= 10,
    },
    matches_25: {
        id: "matches_25", label: "Veterano", description: "25 partidos jugados",
        icon: "📊", xpBonus: 200, tier: "silver", category: "matches",
        check: (c) => c.played >= 25,
    },
    matches_50: {
        id: "matches_50", label: "Imparable", description: "50 partidos jugados",
        icon: "💯", xpBonus: 400, tier: "gold", category: "matches",
        check: (c) => c.played >= 50,
    },
    matches_100: {
        id: "matches_100", label: "Centenario", description: "100 partidos jugados",
        icon: "🎖️", xpBonus: 1000, tier: "gold", category: "matches",
        check: (c) => c.played >= 100,
    },
    matches_250: {
        id: "matches_250", label: "Inquilino del Predio", description: "250 partidos jugados",
        icon: "🏛️", xpBonus: 2500, tier: "platinum", category: "matches",
        check: (c) => c.played >= 250,
    },
    // Victorias
    first_win: {
        id: "first_win", label: "Primera Victoria", description: "Ganaste tu primer partido",
        icon: "🥇", xpBonus: 50, tier: "bronze", category: "wins",
        check: (c) => c.won >= 1,
    },
    wins_10: {
        id: "wins_10", label: "Ganador", description: "10 victorias",
        icon: "🏅", xpBonus: 150, tier: "bronze", category: "wins",
        check: (c) => c.won >= 10,
    },
    wins_25: {
        id: "wins_25", label: "Triunfador", description: "25 victorias",
        icon: "🏆", xpBonus: 300, tier: "silver", category: "wins",
        check: (c) => c.won >= 25,
    },
    wins_50: {
        id: "wins_50", label: "Implacable", description: "50 victorias",
        icon: "🏆", xpBonus: 600, tier: "gold", category: "wins",
        check: (c) => c.won >= 50,
    },
    // MVP
    first_mvp: {
        id: "first_mvp", label: "Primer MVP", description: "Te eligieron MVP por primera vez",
        icon: "👑", xpBonus: 100, tier: "bronze", category: "mvp",
        check: (c) => c.mvpAwards >= 1,
    },
    mvp_5: {
        id: "mvp_5", label: "Figura Repetida", description: "5 MVPs ganados",
        icon: "⭐", xpBonus: 300, tier: "silver", category: "mvp",
        check: (c) => c.mvpAwards >= 5,
    },
    mvp_10: {
        id: "mvp_10", label: "Figura del Predio", description: "10 MVPs ganados",
        icon: "🌟", xpBonus: 600, tier: "gold", category: "mvp",
        check: (c) => c.mvpAwards >= 10,
    },
    mvp_25: {
        id: "mvp_25", label: "Crack Indiscutido", description: "25 MVPs ganados",
        icon: "✨", xpBonus: 1500, tier: "platinum", category: "mvp",
        check: (c) => c.mvpAwards >= 25,
    },
    // Rachas
    weekly_streak_3: {
        id: "weekly_streak_3", label: "Constante", description: "3 semanas seguidas jugando",
        icon: "🔥", xpBonus: 50, tier: "bronze", category: "streaks",
        check: (c) => c.weeklyStreak >= 3,
    },
    weekly_streak_5: {
        id: "weekly_streak_5", label: "Constancia", description: "5 semanas seguidas jugando",
        icon: "🔥", xpBonus: 200, tier: "silver", category: "streaks",
        check: (c) => c.weeklyStreak >= 5,
    },
    weekly_streak_10: {
        id: "weekly_streak_10", label: "Inquebrantable", description: "10 semanas seguidas jugando",
        icon: "🔥", xpBonus: 500, tier: "gold", category: "streaks",
        check: (c) => c.weeklyStreak >= 10,
    },
    weekly_streak_25: {
        id: "weekly_streak_25", label: "Maratonista", description: "25 semanas seguidas jugando",
        icon: "🔥", xpBonus: 1500, tier: "platinum", category: "streaks",
        check: (c) => c.weeklyStreak >= 25,
    },
    commitment_streak_10: {
        id: "commitment_streak_10", label: "Puntual", description: "10 partidos seguidos siendo puntual",
        icon: "⏰", xpBonus: 150, tier: "bronze", category: "commitment",
        check: (c) => c.commitmentStreak >= 10,
    },
    commitment_streak_25: {
        id: "commitment_streak_25", label: "Reloj Suizo", description: "25 partidos seguidos puntual",
        icon: "⏱️", xpBonus: 400, tier: "silver", category: "commitment",
        check: (c) => c.commitmentStreak >= 25,
    },
    commitment_streak_50: {
        id: "commitment_streak_50", label: "Compromiso Total", description: "50 partidos seguidos puntual",
        icon: "🎯", xpBonus: 1000, tier: "gold", category: "commitment",
        check: (c) => c.commitmentStreak >= 50,
    },
    // Sociales
    first_kudo_received: {
        id: "first_kudo_received", label: "Primer Kudo", description: "Recibiste tu primer kudo",
        icon: "👏", xpBonus: 50, tier: "bronze", category: "social",
        check: (c) => c.kudosTotal >= 1,
    },
    kudos_10: {
        id: "kudos_10", label: "Apreciado", description: "10 kudos recibidos",
        icon: "💚", xpBonus: 100, tier: "bronze", category: "social",
        check: (c) => c.kudosTotal >= 10,
    },
    kudos_25: {
        id: "kudos_25", label: "Querido", description: "25 kudos recibidos",
        icon: "💛", xpBonus: 200, tier: "silver", category: "social",
        check: (c) => c.kudosTotal >= 25,
    },
    kudos_50: {
        id: "kudos_50", label: "Admirado", description: "50 kudos recibidos",
        icon: "🧡", xpBonus: 400, tier: "gold", category: "social",
        check: (c) => c.kudosTotal >= 50,
    },
    kudos_100: {
        id: "kudos_100", label: "Ídolo", description: "100 kudos recibidos",
        icon: "❤️", xpBonus: 800, tier: "platinum", category: "social",
        check: (c) => c.kudosTotal >= 100,
    },
    // Compromiso
    perfect_month: {
        id: "perfect_month", label: "Mes Perfecto", description: "4+ partidos en un mes sin tardanzas ni faltas",
        icon: "✨", xpBonus: 300, tier: "silver", category: "commitment",
        check: (c) => c.perfectMonths >= 1,
    },
    early_bird: {
        id: "early_bird", label: "Madrugador", description: "10 confirmaciones con más de 24h",
        icon: "🐦", xpBonus: 150, tier: "bronze", category: "commitment",
        check: (c) => c.earlyConfirmCount >= 10,
    },
    // Especiales
    veteran_year: {
        id: "veteran_year", label: "Aniversario", description: "Un año desde tu primer partido",
        icon: "🎂", xpBonus: 500, tier: "gold", category: "special",
        check: (c) => c.daysSinceFirstMatch >= 365,
    },
    review_master: {
        id: "review_master", label: "Crítico", description: "20 reviews completadas",
        icon: "📝", xpBonus: 200, tier: "silver", category: "special",
        check: (c) => c.reviewCount >= 20,
    },
    all_tiers: {
        id: "all_tiers", label: "Leyenda Confirmada", description: "Alcanzaste el tier Leyenda",
        icon: "👑", xpBonus: 2000, tier: "platinum", category: "special",
        check: (c) => c.xpTier === "leyenda",
    },
};

/**
 * Lista de IDs de achievements, en orden de presentación (mismo orden que ACHIEVEMENT_DEFS).
 */
export const ACHIEVEMENT_IDS: AchievementId[] = Object.keys(ACHIEVEMENT_DEFS) as AchievementId[];

/**
 * Devuelve los achievements que el user debería desbloquear ahora y que aún no tiene.
 * Idempotente: si el achievement ya está desbloqueado, no se devuelve.
 */
export function checkAchievementsToUnlock(
    ctx: AchievementCheckContext,
    alreadyUnlocked: AchievementId[],
): AchievementId[] {
    const unlockedSet = new Set(alreadyUnlocked);
    const toUnlock: AchievementId[] = [];
    for (const id of ACHIEVEMENT_IDS) {
        if (unlockedSet.has(id)) continue;
        const def = ACHIEVEMENT_DEFS[id];
        if (def.check(ctx)) toUnlock.push(id);
    }
    return toUnlock;
}

// ========================
// BACKFILL HISTÓRICO
// ========================

/**
 * Estima el XP histórico de un usuario a partir de sus stats actuales.
 * Se usa una sola vez al desplegar la feature para migrar usuarios existentes.
 *
 * Fórmula:
 *   played × 25 (jugar)
 * + won × 10 (victorias)
 * + draw × 5 (empates)
 * + mvpAwards × 50 (MVP)
 * + kudosTotal × 5 (kudos)
 * - noShows × 50 (penalización)
 * - lateArrivals × 10 (penalización)
 *
 * El resultado se acota a >= 0.
 */
export function estimateHistoricalXp(profile: Pick<UserProfile,
    "stats" | "mvpAwards" | "kudosSummary"
>): number {
    const stats: UserStats = profile.stats ?? { played: 0, won: 0, lost: 0, draw: 0 };
    const played = stats.played ?? 0;
    const won = stats.won ?? 0;
    const draw = stats.draw ?? 0;
    const noShows = stats.noShows ?? 0;
    const lateArrivals = stats.lateArrivals ?? 0;
    const mvp = profile.mvpAwards ?? 0;
    const kudos = profile.kudosSummary?.total ?? 0;

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

// ========================
// HELPERS DE DISPLAY
// ========================

/**
 * Construye el id determinístico de un xpEvent. Usado por Cloud Functions
 * para garantizar idempotencia: la misma fuente sobre el mismo contexto
 * solo otorga XP una vez por usuario.
 */
export function buildXpEventId(uid: string, source: XpSource, contextId: string): string {
    return `${uid}_${source}_${contextId}`;
}

/**
 * Resumen rápido para UI: ¿el usuario tiene datos de XP cargados?
 * (False cuando el backfill todavía no se aplicó al doc, o user recién creado.)
 */
export function hasXpData(profile: Pick<UserProfile, "xp" | "xpLevel">): boolean {
    return typeof profile.xp === "number" && typeof profile.xpLevel === "number";
}

/**
 * ¿Ya vio el modal de onboarding del sistema XP?
 */
export function hasSeenXpOnboarding(profile: Pick<UserProfile, "xpOnboardingSeenAt">): boolean {
    return typeof profile.xpOnboardingSeenAt === "string" && profile.xpOnboardingSeenAt.length > 0;
}
