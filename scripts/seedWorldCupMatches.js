/**
 * Seed de la polla mundialista FIFA 2026 (fase de grupos).
 *
 * Hace dos cosas (idempotente, reejecutable — sobreescribe partidos):
 *   1. Carga los 48 partidos de grupos en /worldcupMatches/{num}
 *   2. Crea /config/worldcup con { pollEnabled: false } si no existe (NO pisa si ya existe)
 *
 * Fuente: openfootball/worldcup.json (dominio público, sin API key).
 *
 * Uso:
 *   node scripts/seedWorldCupMatches.js            → carga real
 *   node scripts/seedWorldCupMatches.js --dry-run  → preview sin escribir
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
// PARSEO DE FECHA/HORA
// ========================

/**
 * Combina "2026-06-11" + "13:00 UTC-6" en epoch ms UTC.
 * El offset puede ser "UTC-6", "UTC+2", "UTC" (= 0). Si falta time, usa 12:00 UTC.
 * Devuelve { ms, iso } o null si no se pudo parsear.
 */
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

    // Hora local del partido en epoch: tratamos date+time como UTC y luego
    // restamos el offset para obtener el UTC real.
    // Ej: 13:00 UTC-6 → 13:00 local = 19:00 UTC → restar (-6) = sumar 6h.
    const baseMs = Date.parse(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
    if (Number.isNaN(baseMs)) return null;
    const ms = baseMs - offsetHours * 60 * 60 * 1000;
    return { ms, iso: new Date(ms).toISOString() };
}

// ========================
// TRANSFORMACIÓN
// ========================

function isGroupStageMatch(raw) {
    // Los partidos de grupos tienen `group` ("Group A"). Los de playoffs no.
    return typeof raw.group === "string" && raw.group.toLowerCase().startsWith("group");
}

function toWCMatch(raw, index) {
    const kickoff = parseKickoff(raw.date, raw.time);
    if (!kickoff) return null;

    // ID estable: num del JSON si existe, si no el índice 1-based.
    const id = String(raw.num != null ? raw.num : index + 1);

    return {
        id,
        utcDate: kickoff.iso,
        kickoffMs: kickoff.ms,
        status: "SCHEDULED",
        phase: "GROUP_STAGE",
        group: raw.group,
        ground: raw.ground || null,
        homeTeam: { name: raw.team1, code: teamCodeFor(raw.team1) },
        awayTeam: { name: raw.team2, code: teamCodeFor(raw.team2) },
        score: { home: null, away: null },
    };
}

// ========================
// MAIN
// ========================

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    console.log(`🌍 Seed Polla Mundial 2026${dryRun ? " (DRY RUN — sin escrituras)" : ""}\n`);

    console.log(`⬇️  Descargando fixtures: ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
        console.error(`❌ Falló la descarga: HTTP ${res.status}`);
        process.exit(1);
    }
    const data = await res.json();
    const allMatches = Array.isArray(data.matches) ? data.matches : [];
    console.log(`📦 Partidos totales en el JSON: ${allMatches.length}`);

    const groupMatches = allMatches.filter(isGroupStageMatch);
    console.log(`⚽ Partidos de fase de grupos: ${groupMatches.length}\n`);

    const transformed = [];
    let skipped = 0;
    groupMatches.forEach((raw, i) => {
        const wc = toWCMatch(raw, i);
        if (!wc) { skipped++; console.warn(`⚠️  Skip (fecha inválida): ${raw.team1} vs ${raw.team2} @ ${raw.date} ${raw.time}`); return; }
        transformed.push(wc);
    });

    console.log(`✅ Transformados: ${transformed.length} | ⚠️  Saltados: ${skipped}\n`);

    if (dryRun) {
        transformed.slice(0, 5).forEach((m) => {
            console.log(`   [${m.id}] ${m.group}: ${m.homeTeam.name} (${m.homeTeam.code}) vs ${m.awayTeam.name} (${m.awayTeam.code}) — ${m.utcDate}`);
        });
        console.log(`   … (${transformed.length} en total)`);
        console.log("\n🔍 DRY RUN: no se escribió nada.");
        process.exit(0);
    }

    // Batch write de partidos (chunks de 400 para no pasar el límite de 500)
    const CHUNK = 400;
    for (let i = 0; i < transformed.length; i += CHUNK) {
        const batch = db.batch();
        for (const m of transformed.slice(i, i + CHUNK)) {
            batch.set(db.collection("worldcupMatches").doc(m.id), m);
        }
        await batch.commit();
    }
    console.log(`💾 ${transformed.length} partidos guardados en /worldcupMatches`);

    // bracketDeadlineMs = primer kickoff del 2º día calendario (UTC) del torneo.
    // Cierre de la elección de campeón/subcampeón.
    const sorted = [...transformed].sort((a, b) => a.kickoffMs - b.kickoffMs);
    const day1 = sorted[0].utcDate.slice(0, 10); // YYYY-MM-DD del primer partido
    const firstDay2 = sorted.find((m) => m.utcDate.slice(0, 10) > day1);
    const bracketDeadlineMs = firstDay2 ? firstDay2.kickoffMs : null;
    if (bracketDeadlineMs) {
        console.log(`🏆 bracketDeadlineMs: ${new Date(bracketDeadlineMs).toISOString()} (inicio día 2)`);
    } else {
        console.warn("⚠️  No se pudo calcular bracketDeadlineMs (¿un solo día de partidos?)");
    }

    // Config: merge para no pisar pollEnabled si ya existe; setea pollEnabled:false solo al crear.
    const configRef = db.collection("config").doc("worldcup");
    const configSnap = await configRef.get();
    const configUpdate = { bracketDeadlineMs };
    if (!configSnap.exists) {
        await configRef.set({ pollEnabled: false, ...configUpdate });
        console.log("🚩 /config/worldcup creado con pollEnabled: false (apagado)");
    } else {
        await configRef.set(configUpdate, { merge: true });
        console.log(`🚩 /config/worldcup actualizado (pollEnabled sin tocar: ${configSnap.data().pollEnabled})`);
    }

    console.log("\n🎉 Seed completado.");
    process.exit(0);
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
