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

// v1 cubría solo GROUP_STAGE; v2 agrega la eliminación directa (octavos → final).
// El scoring de eliminación reutiliza el de grupos: se predice el marcador con
// que el partido "va a los libros" (incl. tiempo extra); si se define por penales
// cuenta como empate. Ver docs/POLLA_MUNDIALISTA_SDD.md §16.
export type WCPhase =
    | "GROUP_STAGE"
    | "ROUND_OF_32"
    | "ROUND_OF_16"
    | "QUARTER_FINAL"
    | "SEMI_FINAL"
    | "THIRD_PLACE"
    | "FINAL";

export interface WCTeam {
    name: string;   // "Argentina"; en knockout sin resolver: "Ganador 74" / "Perdedor 101"
    code: string;   // ISO-2 en mayúsculas ("AR") para bandera, o fallback de 3 letras; "" si sin resolver
}

/**
 * Origen de un slot de eliminación: el ganador o perdedor de un partido previo.
 * El auto-avance (CF) lo usa para escribir el equipo cuando ese partido finaliza.
 */
export interface WCMatchSource {
    type: "winner" | "loser";
    matchId: string;   // "74"
}

export interface WCMatch {
    id: string;          // match number como string: "1" … "104"
    utcDate: string;     // ISO 8601 para display: "2026-06-11T19:00:00.000Z"
    kickoffMs: number;   // epoch ms UTC — fuente de verdad del candado (rules + queries)
    status: WCMatchStatus;
    phase: WCPhase;
    group?: string;      // "Group A" … "Group L" — solo en fase de grupos; undefined en eliminación
    ground?: string;     // estadio / ciudad (informativo)
    homeTeam: WCTeam;
    awayTeam: WCTeam;
    // Llaves del cuadro (solo eliminación): de qué partido sale cada lado.
    homeSource?: WCMatchSource;
    awaySource?: WCMatchSource;
    score: {
        home: number | null;   // null hasta que el admin carga el resultado
        away: number | null;
    };
    // Solo knockout: si el partido terminó EMPATADO (se definió por penales), qué
    // lado avanzó. El marcador puntúa como empate; esto solo sirve para el avance.
    advancedTeam?: "home" | "away";
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
    joinByCodeOpen?: boolean;    // muestra el acceso por código en el menú para todos
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

/** Premio del ganador de la polla: cantidad de partidos sin pagar cuota (jugador de campo). */
export const WC_PRIZE_FREE_MATCHES = 5;

/** Premio equivalente para arqueros: pagan media cuota, así que el mismo valor son 10 partidos. */
export const WC_PRIZE_FREE_MATCHES_GK = 10;

/** Etiqueta en español de cada fase, para la cabecera de la tarjeta de partido. */
export const WC_PHASE_LABELS: Record<WCPhase, string> = {
    GROUP_STAGE: "Fase de grupos",
    ROUND_OF_32: "Dieciseisavos",
    ROUND_OF_16: "Octavos de final",
    QUARTER_FINAL: "Cuartos de final",
    SEMI_FINAL: "Semifinal",
    THIRD_PLACE: "Tercer puesto",
    FINAL: "Final",
};

/**
 * Etiqueta de cabecera de un partido: el grupo si es fase de grupos ("Group A"),
 * o el nombre de la ronda de eliminación. Garantiza un label aunque falte `group`.
 */
export function matchStageLabel(match: Pick<WCMatch, "group" | "phase">): string {
    return match.group || WC_PHASE_LABELS[match.phase] || "";
}

// ========================
// AVANCE DE ELIMINACIÓN (llaves del cuadro)
// ========================

/** Un slot de equipo está sin resolver si no tiene código (placeholder "Ganador 74"). */
export function isTeamResolved(team: Pick<WCTeam, "code">): boolean {
    return !!team.code;
}

/**
 * El partido está listo para predecir cuando ambos equipos están resueltos.
 * En grupos siempre es true; en eliminación, hasta que el auto-avance llena los slots.
 */
export function isMatchReady(match: Pick<WCMatch, "homeTeam" | "awayTeam">): boolean {
    return isTeamResolved(match.homeTeam) && isTeamResolved(match.awayTeam);
}

/**
 * Lado ganador de un partido de eliminación FINISHED.
 * - Por marcador si hubo diferencia.
 * - Si terminó empatado (penales), por `advancedTeam`.
 * - null si no se puede determinar todavía (sin resultado, o empate sin definir avance).
 */
export function knockoutWinnerSide(
    match: Pick<WCMatch, "score" | "advancedTeam">,
): "home" | "away" | null {
    const { home, away } = match.score;
    if (home == null || away == null) return null;
    if (home > away) return "home";
    if (away > home) return "away";
    return match.advancedTeam ?? null;
}

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
