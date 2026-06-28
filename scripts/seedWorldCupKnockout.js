/**
 * Seed de la fase de ELIMINACIÓN de la polla mundialista FIFA 2026
 * (dieciseisavos → final, nums 73–104).
 *
 * A diferencia de seedWorldCupMatches.js (fase de grupos), este script es
 * MERGE-SAFE y reejecutable SIN destruir resultados ya cargados:
 *   - Si el partido NO existe → lo crea con status SCHEDULED y score vacío.
 *   - Si YA existe → refresca solo equipos / fecha / sede / fase (los placeholders
 *     "1I", "3A/B/C/D/F", "W99"… se van resolviendo ronda a ronda), pero NUNCA
 *     toca status, score ni adminUpdatedAt. Así re-correrlo para llenar el cuadro
 *     no borra los partidos que el admin ya cerró.
 *
 * Está pensado para correrse VARIAS veces durante la fase final, conforme
 * openfootball publica los equipos reales de cada cruce.
 *
 * Scoring (decisión v2): se predice el marcador con que el partido va a los libros
 * (incl. tiempo extra). Si se define por penales, cuenta como empate — reutiliza
 * el scoring de grupos sin cambios. Ref: docs/POLLA_MUNDIALISTA_SDD.md §16.
 *
 * Fuente: openfootball/worldcup.json (dominio público, sin API key).
 *
 * Uso:
 *   node scripts/seedWorldCupKnockout.js            → carga/actualiza real
 *   node scripts/seedWorldCupKnockout.js --dry-run  → preview sin escribir
 *
 * Mantener el mapeo nombre→ISO2 en sync con lib/domain/worldcup.ts (WC_COUNTRY_CODES).
 */

const admin = require("firebase-admin");
const path = require("path");

const SOURCE_URL =
    "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");
try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (error) {
    console.error("❌ Error: No se encontró serviceAccountKey.json en la raíz del proyecto");
    process.exit(1);
}

const db = admin.firestore();

// ========================
// EQUIPOS CONFIRMADOS POR PARTIDO (fuente: bracket oficial FIFA)
// ========================
//
// openfootball llega atrasado con los nombres reales del cuadro, así que los
// equipos de dieciseisavos se fijan acá a mano [home, away] (el orden = arriba/abajo
// del bracket = team1/team2 de openfootball). El schedule (fecha/sede) sí sale de
// openfootball.
//
// De octavos en adelante (89–104) NO hace falta tocar esto: el auto-avance (Cloud
// Function onWorldCupMatchFinished) llena los equipos al terminar cada ronda. Acá
// solo se siembran sus "llaves" (ver BRACKET_FEED).
//
// Cruzado contra el standings calculado desde Firestore: los 8 terceros
// (PAR, SWE, ECU, COD, BIH, ALG, SEN, GHA) coinciden con los 8 clasificados.

const CONFIRMED_TEAMS = {
    // --- Dieciseisavos (Round of 32) ---
    73: ["South Africa", "Canada"],
    74: ["Germany", "Paraguay"],
    75: ["Netherlands", "Morocco"],
    76: ["Brazil", "Japan"],
    77: ["France", "Sweden"],
    78: ["Ivory Coast", "Norway"],
    79: ["Mexico", "Ecuador"],
    80: ["England", "DR Congo"],
    81: ["USA", "Bosnia & Herzegovina"],
    82: ["Belgium", "Senegal"],
    83: ["Portugal", "Croatia"],
    84: ["Spain", "Austria"],
    85: ["Switzerland", "Algeria"],
    86: ["Argentina", "Cape Verde"],
    87: ["Colombia", "Ghana"],
    88: ["Australia", "Egypt"],
};

// ========================
// LLAVES DEL CUADRO (BRACKET_FEED) — octavos (89) → final (104)
// ========================
//
// De qué partido sale cada lado [tipo, numPartido]. "winner" = ganador, "loser" =
// perdedor (solo el 3er puesto usa perdedores de semis). El auto-avance escribe el
// equipo en el slot cuando ese partido finaliza. Estructura fija de openfootball.

const BRACKET_FEED = {
    // Octavos
    89: { home: ["winner", 74], away: ["winner", 77] },
    90: { home: ["winner", 73], away: ["winner", 75] },
    91: { home: ["winner", 76], away: ["winner", 78] },
    92: { home: ["winner", 79], away: ["winner", 80] },
    93: { home: ["winner", 83], away: ["winner", 84] },
    94: { home: ["winner", 81], away: ["winner", 82] },
    95: { home: ["winner", 86], away: ["winner", 88] },
    96: { home: ["winner", 85], away: ["winner", 87] },
    // Cuartos
    97: { home: ["winner", 89], away: ["winner", 90] },
    98: { home: ["winner", 93], away: ["winner", 94] },
    99: { home: ["winner", 91], away: ["winner", 92] },
    100: { home: ["winner", 95], away: ["winner", 96] },
    // Semis
    101: { home: ["winner", 97], away: ["winner", 98] },
    102: { home: ["winner", 99], away: ["winner", 100] },
    // 3er puesto (perdedores de semis) y Final
    103: { home: ["loser", 101], away: ["loser", 102] },
    104: { home: ["winner", 101], away: ["winner", 102] },
};

/** Equipo placeholder para un slot sin resolver (code "" = "Por definir" en la UI). */
function placeholderTeam([type, matchId]) {
    return { name: `${type === "winner" ? "Ganador" : "Perdedor"} ${matchId}`, code: "" };
}

function sourceObj([type, matchId]) {
    return { type, matchId: String(matchId) };
}

// ========================
// MAPEO round (openfootball) → WCPhase (lib/domain/worldcup.ts)
// ========================

const ROUND_TO_PHASE = {
    "Round of 32": "ROUND_OF_32",
    "Round of 16": "ROUND_OF_16",
    "Quarter-final": "QUARTER_FINAL",
    "Quarter-finals": "QUARTER_FINAL",
    "Semi-final": "SEMI_FINAL",
    "Semi-finals": "SEMI_FINAL",
    "Match for third place": "THIRD_PLACE",
    "Third place play-off": "THIRD_PLACE",
    "Final": "FINAL",
};

// ========================
// MAPEO DE BANDERAS (sync con lib/domain/worldcup.ts → WC_COUNTRY_CODES)
// ========================

const COUNTRY_CODES = {
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

function teamCodeFor(name) {
    return COUNTRY_CODES[name] || name.slice(0, 3).toUpperCase();
}

// ========================
// PARSEO DE FECHA/HORA (idéntico a seedWorldCupMatches.js)
// ========================

function parseKickoff(date, time) {
    if (!date) return null;
    if (!time) {
        const ms = Date.parse(`${date}T12:00:00Z`);
        return Number.isNaN(ms) ? null : { ms, iso: new Date(ms).toISOString() };
    }
    const m = time.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})?/i);
    if (!m) {
        const ms = Date.parse(`${date}T12:00:00Z`);
        return Number.isNaN(ms) ? null : { ms, iso: new Date(ms).toISOString() };
    }
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const offsetHours = m[3] ? parseInt(m[3], 10) : 0;
    const baseMs = Date.parse(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
    if (Number.isNaN(baseMs)) return null;
    const ms = baseMs - offsetHours * 60 * 60 * 1000;
    return { ms, iso: new Date(ms).toISOString() };
}

// ========================
// TRANSFORMACIÓN
// ========================

function isKnockoutMatch(raw) {
    // Los de eliminación traen `round` ("Round of 32", "Final"…) y NO `group`.
    const isGroup = typeof raw.group === "string" && raw.group.toLowerCase().startsWith("group");
    return !isGroup && typeof raw.round === "string" && ROUND_TO_PHASE[raw.round] != null;
}

/**
 * Campos que SIEMPRE se refrescan (equipos/fecha/sede/fase), sin tocar resultado.
 * Los equipos salen de CONFIRMED_TEAMS (no de openfootball); el schedule de openfootball.
 */
function refreshableFields(raw) {
    const kickoff = parseKickoff(raw.date, raw.time);
    if (!kickoff) return null;
    const [home, away] = CONFIRMED_TEAMS[raw.num];
    return {
        utcDate: kickoff.iso,
        kickoffMs: kickoff.ms,
        phase: ROUND_TO_PHASE[raw.round],
        ground: raw.ground || null,
        homeTeam: { name: home, code: teamCodeFor(home) },
        awayTeam: { name: away, code: teamCodeFor(away) },
    };
}

// ========================
// MAIN
// ========================

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    console.log(`🏆 Seed ELIMINACIÓN Mundial 2026${dryRun ? " (DRY RUN — sin escrituras)" : ""}\n`);

    console.log(`⬇️  Descargando fixtures: ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
        console.error(`❌ Falló la descarga: HTTP ${res.status}`);
        process.exit(1);
    }
    const data = await res.json();
    const allMatches = Array.isArray(data.matches) ? data.matches : [];
    const rawByNum = new Map(allMatches.map((m) => [m.num, m]));
    // Solo los de eliminación CON equipos confirmados en CONFIRMED_TEAMS.
    const knockout = allMatches.filter((raw) => isKnockoutMatch(raw) && CONFIRMED_TEAMS[raw.num]);
    console.log(`⚽ Equipos confirmados a cargar: ${knockout.length} de ${Object.keys(CONFIRMED_TEAMS).length} en el mapa\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of knockout) {
        const id = String(raw.num);
        const fields = refreshableFields(raw);
        if (!fields) {
            skipped++;
            console.warn(`⚠️  Skip (fecha inválida): #${id} @ ${raw.date} ${raw.time}`);
            continue;
        }

        const ref = db.collection("worldcupMatches").doc(id);
        const snap = await ref.get();
        const label = `#${id} [${ROUND_TO_PHASE[raw.round]}] ${fields.homeTeam.name} vs ${fields.awayTeam.name} — ${fields.utcDate}`;

        if (!snap.exists) {
            created++;
            console.log(`➕ ${label}`);
            if (!dryRun) {
                // Doc nuevo: agrega status/score iniciales (sin `group` — es eliminación).
                await ref.set({ id, status: "SCHEDULED", score: { home: null, away: null }, ...fields });
            }
        } else {
            // Merge-safe: refresca equipos/fecha/fase pero NO toca status/score/adminUpdatedAt.
            const isFinished = snap.data().status === "FINISHED";
            updated++;
            console.log(`✏️  ${label}${isFinished ? " (FINISHED — resultado preservado)" : ""}`);
            if (!dryRun) {
                await ref.set(fields, { merge: true });
            }
        }
    }

    // ----- Llaves del cuadro (89–104): siembra los slots con placeholders + sources -----
    console.log(`\n🔗 Llaves del cuadro (octavos → final):`);
    let feedCreated = 0;
    let feedUpdated = 0;
    for (const numStr of Object.keys(BRACKET_FEED)) {
        const num = Number(numStr);
        const raw = rawByNum.get(num);
        if (!raw) { console.warn(`⚠️  #${num} no está en openfootball`); continue; }
        const kickoff = parseKickoff(raw.date, raw.time);
        if (!kickoff) { skipped++; console.warn(`⚠️  Skip (fecha inválida): #${num}`); continue; }

        const feed = BRACKET_FEED[num];
        // Schedule + llaves: SIEMPRE se refrescan. Equipos/status/score NO (los pone el auto-avance / admin).
        const scheduleAndSources = {
            utcDate: kickoff.iso,
            kickoffMs: kickoff.ms,
            phase: ROUND_TO_PHASE[raw.round],
            ground: raw.ground || null,
            homeSource: sourceObj(feed.home),
            awaySource: sourceObj(feed.away),
        };
        const ref = db.collection("worldcupMatches").doc(numStr);
        const snap = await ref.get();
        const label = `#${num} [${ROUND_TO_PHASE[raw.round]}] ${placeholderTeam(feed.home).name} vs ${placeholderTeam(feed.away).name}`;

        if (!snap.exists) {
            feedCreated++;
            console.log(`  ➕ ${label}`);
            if (!dryRun) {
                await ref.set({
                    id: numStr,
                    status: "SCHEDULED",
                    score: { home: null, away: null },
                    homeTeam: placeholderTeam(feed.home),
                    awayTeam: placeholderTeam(feed.away),
                    ...scheduleAndSources,
                });
            }
        } else {
            feedUpdated++;
            console.log(`  ✏️  ${label} (schedule/llaves; equipos preservados)`);
            if (!dryRun) {
                await ref.set(scheduleAndSources, { merge: true });
            }
        }
    }

    console.log(`\n📊 Resumen dieciseisavos: ${created} creados, ${updated} actualizados, ${skipped} saltados`);
    console.log(`📊 Resumen llaves: ${feedCreated} creadas, ${feedUpdated} actualizadas`);
    if (dryRun) console.log("\n🔍 DRY RUN: no se escribió nada.");
    else console.log("\n🎉 Seed de eliminación completado.");
    process.exit(0);
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
