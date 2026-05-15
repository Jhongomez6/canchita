/**
 * ========================
 * RATING DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Modelo de dominio para el sistema de rating inicial (Cold Start).
 * Función pura que calcula el rating basado en hitos objetivos.
 *
 * ESPECIFICACIÓN:
 * - Base: 200 PP
 * - Técnica (1-5): [0, 80, 160, 240, 320]
 * - Físico (1-5): [0, 50, 100, 150, 200]
 * - Trayectoria: escuela (+100), torneos (+60)
 * - Frecuencia: occasional(0), weekly(60), intense(120)
 * - Edad: 18-35(+50), 36-45(0), 46+(-50)
 * - Cap: [100, 950]
 * - Mapeo: <320 → Lvl 1 (Básico), 320-500 → Lvl 2 (Intermedio),
 *          501-700 → Lvl 3 (Avanzado), >700 → Lvl 4 (Elite)
 */

// ========================
// TIPOS
// ========================

export type TechLevel = 1 | 2 | 3 | 4 | 5;
export type PhysLevel = 1 | 2 | 3 | 4 | 5;
export type Frequency = "occasional" | "weekly" | "intense";
export type Sex = "male" | "female" | "other";
export type Foot = "left" | "right" | "ambidextrous";
export type CourtSize = "6v6" | "9v9" | "11v11";

export interface OnboardingData {
    age: number;
    sex: Sex;
    dominantFoot: Foot;
    preferredCourt: CourtSize;
    techLevel: TechLevel;
    physLevel: PhysLevel;
    hasSchool: boolean;
    hasTournaments: boolean;
    frequency: Frequency;
}

export interface RatingResult {
    rating: number;
    level: 1 | 2 | 3 | 4;
}

// ========================
// CONSTANTES
// ========================

const BASE_RATING = 200;

const TECH_POINTS: Record<TechLevel, number> = {
    1: 0,
    2: 80,
    3: 160,
    4: 240,
    5: 320,
};

const PHYS_POINTS: Record<PhysLevel, number> = {
    1: 0,
    2: 50,
    3: 100,
    4: 150,
    5: 200,
};

const FREQUENCY_POINTS: Record<Frequency, number> = {
    occasional: 0,
    weekly: 60,
    intense: 120,
};

const SCHOOL_BONUS = 100;
const TOURNAMENT_BONUS = 60;

const MIN_RATING = 100;
const MAX_RATING = 950;

// ========================
// CÁLCULO
// ========================

/**
 * Calcula el rating inicial de un jugador.
 * Función pura: sin side effects, determinista.
 */
export function calculateInitialRating(data: OnboardingData): RatingResult {
    let rating = BASE_RATING;

    // Técnica
    rating += TECH_POINTS[data.techLevel];

    // Físico
    rating += PHYS_POINTS[data.physLevel];

    // Trayectoria
    if (data.hasSchool) rating += SCHOOL_BONUS;
    if (data.hasTournaments) rating += TOURNAMENT_BONUS;

    // Frecuencia
    rating += FREQUENCY_POINTS[data.frequency];

    // Edad
    if (data.age >= 18 && data.age <= 35) {
        rating += 50;
    } else if (data.age > 45) {
        rating -= 50;
    }
    // 36-45: +0

    // Cap
    rating = Math.max(MIN_RATING, Math.min(MAX_RATING, rating));

    // Mapeo a nivel
    return { rating, level: ratingToLevel(rating) };
}

/**
 * Mapea un rating numérico al nivel correspondiente (1-4).
 * Pública para que scripts de migración y código que solo tiene el rating
 * puedan recalcular el nivel sin recalcular toda la fórmula.
 */
export function ratingToLevel(rating: number): 1 | 2 | 3 | 4 {
    if (rating < 320) return 1;
    if (rating <= 500) return 2;
    if (rating <= 700) return 3;
    return 4;
}
