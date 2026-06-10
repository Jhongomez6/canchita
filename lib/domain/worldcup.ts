/**
 * ========================
 * WORLD CUP POLL DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/POLLA_MUNDIALISTA_SDD.md
 *
 * Modelo de dominio para la polla mundialista FIFA 2026.
 * Tipos puros, helpers y scoring — sin Firebase, sin React.
 *
 * ESPECIFICACIÓN (v1):
 * - Solo fase de grupos (48 partidos).
 * - Candado de predicción AUTOMÁTICO por tiempo: se cierra cuando now >= kickoffMs.
 * - Scoring: marcador exacto = 3 pts; resultado correcto (G/E/P) = 1 pt; fallo = 0.
 * - Resultados cargados manualmente por super_admin (status → FINISHED).
 * - Predicciones ajenas visibles solo después del kickoff.
 */

// ========================
// TIPOS
// ========================

// v1: sin IN_PLAY (el cierre es por tiempo, no por estado del admin).
export type WCMatchStatus = "SCHEDULED" | "FINISHED" | "POSTPONED";

// v1 solo GROUP_STAGE. Enum extensible para playoffs (fuera de scope v1).
export type WCPhase = "GROUP_STAGE";

export interface WCTeam {
    name: string;   // "Argentina"
    code: string;   // ISO-2 en mayúsculas ("AR") para bandera, o fallback de 3 letras
}

export interface WCMatch {
    id: string;          // match number como string: "1" … "48"
    utcDate: string;     // ISO 8601 para display: "2026-06-11T19:00:00.000Z"
    kickoffMs: number;   // epoch ms UTC — fuente de verdad del candado (rules + queries)
    status: WCMatchStatus;
    phase: WCPhase;
    group: string;       // "Group A" … "Group L"
    ground?: string;     // estadio / ciudad (informativo)
    homeTeam: WCTeam;
    awayTeam: WCTeam;
    score: {
        home: number | null;   // null hasta que el admin carga el resultado
        away: number | null;
    };
    adminUpdatedAt?: string; // ISO — cuándo el admin cargó el resultado
}

export interface WCPrediction {
    id: string;          // "{userId}_{matchId}"
    userId: string;
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    points?: number;     // undefined = no calculado aún; 0 | 1 | 3 = calculado
    // snapshot para mostrar predicciones ajenas sin join a /users
    displayName: string;
    photoURLThumb?: string;
    createdAt: string;
    updatedAt: string;
}

export interface WCLeaderboardEntry {
    userId: string;
    displayName: string;
    photoURLThumb?: string;
    points: number;       // TOTAL = matchPoints + bracketPoints (campo de orden)
    exactHits: number;    // predicciones exactas de partido (3 pts)
    resultHits: number;   // resultado correcto de partido (1 pt)
    predictions: number;  // total de predicciones de partido hechas
    bracketPoints?: number;   // bonus por campeón/subcampeón (0–15)
    championHit?: boolean;    // acertó el campeón
    runnerUpHit?: boolean;    // acertó el subcampeón
    updatedAt: string;
}

export interface WCConfig {
    pollEnabled: boolean;
    bracketDeadlineMs?: number;  // epoch ms — cierre de elección de campeón/subcampeón
    champion?: string;           // resultado real del torneo (lo carga el admin)
    runnerUp?: string;
}

/**
 * Predicción a largo plazo del usuario: campeón y subcampeón del torneo.
 * Doc id = userId en /worldcupBracketPredictions.
 */
export interface WCBracketPrediction {
    userId: string;
    champion: string;          // nombre del equipo
    runnerUp: string;          // nombre del equipo
    championPoints?: number;   // 0 | WC_CHAMPION_POINTS — calculado al resolver
    runnerUpPoints?: number;   // 0 | WC_RUNNERUP_POINTS — calculado al resolver
    displayName: string;
    photoURLThumb?: string;
    createdAt: string;
    updatedAt: string;
}

// ========================
// CONSTANTES
// ========================

/** Máximo de goles aceptado en una predicción / resultado (anti-troll). */
export const WC_MAX_GOALS = 20;

/** Horas tras el kickoff sin resultado para mostrar badge "Resultado pendiente". */
export const WC_PENDING_RESULT_HOURS = 3;

/** Bonus por acertar el campeón del torneo. */
export const WC_CHAMPION_POINTS = 10;

/** Bonus por acertar el subcampeón del torneo. */
export const WC_RUNNERUP_POINTS = 5;

// ========================
// REGLAS DE NEGOCIO (puras)
// ========================

/**
 * Candado de predicción. Fuente de verdad para habilitar/deshabilitar la UI.
 * El server lo reafirma en Firestore rules con request.time.
 *
 * Bloqueada si el partido ya empezó (now >= kickoff) o ya tiene resultado.
 */
export function isPredictionLocked(match: WCMatch, now: number = Date.now()): boolean {
    return now >= match.kickoffMs || match.status === "FINISHED";
}

/**
 * True si el partido debería tener resultado pero el admin no lo cargó aún
 * (pasaron >WC_PENDING_RESULT_HOURS del kickoff y sigue SCHEDULED).
 */
export function isResultPending(match: WCMatch, now: number = Date.now()): boolean {
    if (match.status !== "SCHEDULED") return false;
    return now >= match.kickoffMs + WC_PENDING_RESULT_HOURS * 60 * 60 * 1000;
}

/** Valida que un valor de goles sea un entero en rango [0, WC_MAX_GOALS]. */
export function isValidGoals(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= WC_MAX_GOALS;
}

/**
 * Resultado (1X2) de un marcador desde la perspectiva del local.
 * "H" = gana local, "A" = gana visitante, "D" = empate.
 */
function outcome(home: number, away: number): "H" | "A" | "D" {
    if (home > away) return "H";
    if (home < away) return "A";
    return "D";
}

/**
 * Scoring puro de una predicción contra el resultado real.
 * - Marcador exacto: 3 pts
 * - Resultado correcto (mismo ganador/empate) pero marcador distinto: 1 pt
 * - Fallo: 0 pts
 */
export function scoreForPrediction(
    prediction: Pick<WCPrediction, "homeGoals" | "awayGoals">,
    result: { home: number; away: number },
): 0 | 1 | 3 {
    if (prediction.homeGoals === result.home && prediction.awayGoals === result.away) {
        return 3;
    }
    return outcome(prediction.homeGoals, prediction.awayGoals) === outcome(result.home, result.away)
        ? 1
        : 0;
}

/**
 * Agrega una lista de predicciones ya puntuadas en un entry de leaderboard.
 * Recalcula DESDE CERO (no incremental) — así una corrección de resultado no
 * deja puntos fantasma ni duplica.
 */
export function aggregateLeaderboard(
    base: Pick<WCLeaderboardEntry, "userId" | "displayName" | "photoURLThumb">,
    scored: Array<Pick<WCPrediction, "points">>,
    now: string = new Date().toISOString(),
): WCLeaderboardEntry {
    let points = 0;
    let exactHits = 0;
    let resultHits = 0;
    for (const p of scored) {
        if (p.points === 3) { points += 3; exactHits++; }
        else if (p.points === 1) { points += 1; resultHits++; }
    }
    return {
        ...base,
        points,
        exactHits,
        resultHits,
        predictions: scored.length,
        updatedAt: now,
    };
}

// ========================
// BRACKET (campeón / subcampeón) — bonus
// ========================

/**
 * Candado de la elección de campeón/subcampeón. Cerrada cuando se llegó al
 * deadline (inicio del 2º día). Si no hay deadline configurado, se considera
 * abierta (fail-open en cliente; el server reafirma con las rules).
 */
export function isBracketLocked(deadlineMs: number | undefined, now: number = Date.now()): boolean {
    if (deadlineMs == null) return false;
    return now >= deadlineMs;
}

/**
 * Scoring puro del bracket. Bonus solo por posición exacta.
 */
export function scoreBracket(
    pred: Pick<WCBracketPrediction, "champion" | "runnerUp">,
    result: { champion: string; runnerUp: string },
): { championPoints: number; runnerUpPoints: number } {
    return {
        championPoints: pred.champion === result.champion ? WC_CHAMPION_POINTS : 0,
        runnerUpPoints: pred.runnerUp === result.runnerUp ? WC_RUNNERUP_POINTS : 0,
    };
}

// ========================
// BANDERAS (display)
// ========================

/**
 * Mapa nombre de selección → ISO-2 (mayúsculas). Cubre las selecciones más
 * probables del Mundial 2026. Si un equipo no está aquí, el seed cae al
 * fallback de 3 letras y la UI muestra 🏳️.
 *
 * Compartido entre el script de seed (asigna `code`) y la UI (deriva emoji).
 */
export const WC_COUNTRY_CODES: Record<string, string> = {
    "Argentina": "AR", "Australia": "AU", "Austria": "AT", "Belgium": "BE",
    "Brazil": "BR", "Cameroon": "CM", "Canada": "CA", "Colombia": "CO",
    "Costa Rica": "CR", "Croatia": "HR", "Denmark": "DK", "Ecuador": "EC",
    "Egypt": "EG", "England": "GB", "France": "FR", "Germany": "DE",
    "Ghana": "GH", "Iran": "IR", "Italy": "IT", "Ivory Coast": "CI",
    "Japan": "JP", "Mexico": "MX", "Morocco": "MA", "Netherlands": "NL",
    "Nigeria": "NG", "Norway": "NO", "Paraguay": "PY", "Peru": "PE",
    "Poland": "PL", "Portugal": "PT", "Qatar": "QA", "Saudi Arabia": "SA",
    "Scotland": "GB", "Senegal": "SN", "Serbia": "RS", "South Africa": "ZA",
    "South Korea": "KR", "Korea Republic": "KR", "Spain": "ES", "Sweden": "SE",
    "Switzerland": "CH", "Tunisia": "TN", "Turkey": "TR", "Ukraine": "UA",
    "United States": "US", "USA": "US", "Uruguay": "UY", "Wales": "GB",
    "Algeria": "DZ", "Chile": "CL", "Panama": "PA", "Jamaica": "JM",
    "New Zealand": "NZ", "Uzbekistan": "UZ", "Jordan": "JO", "Cape Verde": "CV",
    "Bosnia & Herzegovina": "BA", "Curaçao": "CW", "Czech Republic": "CZ",
    "DR Congo": "CD", "Haiti": "HT", "Iraq": "IQ",
};

/**
 * Deriva el código a guardar para un equipo: ISO-2 si lo conocemos, si no las
 * primeras 3 letras en mayúsculas (placeholder tipo "2A" queda igual).
 */
export function teamCodeFor(name: string): string {
    return WC_COUNTRY_CODES[name] ?? name.slice(0, 3).toUpperCase();
}

/**
 * Convierte un ISO-2 (ej "AR") en emoji de bandera. Devuelve 🏳️ si el código
 * no es un par de letras A-Z válido (placeholders, fallbacks de 3 letras).
 */
export function flagEmoji(code: string): string {
    if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
    const A = 0x1f1e6;
    return String.fromCodePoint(
        A + (code.charCodeAt(0) - 65),
        A + (code.charCodeAt(1) - 65),
    );
}
