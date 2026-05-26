/**
 * Script de migración inicial: calcula y asigna el XP histórico de cada usuario
 * desde sus stats existentes (played, won, draw, mvpAwards, kudos, noShows, lateArrivals).
 *
 * Idempotente: si un user ya tiene `_migration.xpBackfillV1` seteado, se omite.
 *
 * Uso:
 *   node scripts/backfillXp.js <userId>            → solo ese usuario
 *   node scripts/backfillXp.js --all               → todos los usuarios
 *   node scripts/backfillXp.js --all --dry-run    → preview sin escribir
 *   node scripts/backfillXp.js --all --force       → re-ejecutar aunque ya esté migrado
 *
 * Fuente de verdad: lib/domain/xp.ts (mantener en sync).
 * Reglas (igual que xp.ts):
 *   xp = played*25 + won*10 + draw*5 + mvp*50 + kudos*5 - noShows*50 - late*10
 *   level = floor inverso de 50*(n-1)^1.45, capado [1, 50]
 *   tier  = suplente(1-10) / titular(11-20) / estrella(21-30) / capitan(31-40) / leyenda(41-50)
 */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (error) {
  console.error("❌ Error: No se encontró serviceAccountKey.json");
  process.exit(1);
}

const db = admin.firestore();

// ========================
// CONSTANTES (mantener en sync con lib/domain/xp.ts y functions/src/xp.ts)
// ========================

const CURVE_EXPONENT = 1.45;
const CURVE_BASE = 50;
const MAX_LEVEL = 50;
const MIN_LEVEL = 1;

const XP_AMOUNTS = {
  MATCH_PLAYED: 25,
  MATCH_WON_BONUS: 10,
  MATCH_DRAWN_BONUS: 5,
  MATCH_MVP: 50,
  MATCH_NO_SHOW: -50,
  MATCH_LATE: -10,
  KUDO_RECEIVED: 5,
};

function xpForLevel(level) {
  if (level <= MIN_LEVEL) return 0;
  if (level > MAX_LEVEL) return Math.floor(CURVE_BASE * Math.pow(MAX_LEVEL - 1, CURVE_EXPONENT));
  return Math.floor(CURVE_BASE * Math.pow(level - 1, CURVE_EXPONENT));
}

function calcLevelFromXp(xp) {
  if (xp <= 0) return MIN_LEVEL;
  for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) {
    if (xp >= xpForLevel(level)) return level;
  }
  return MIN_LEVEL;
}

function calcTierFromLevel(level) {
  if (level <= 10) return "suplente";
  if (level <= 20) return "titular";
  if (level <= 30) return "estrella";
  if (level <= 40) return "capitan";
  return "leyenda";
}

function estimateHistoricalXp(userData) {
  const stats = userData.stats || {};
  const played = stats.played || 0;
  const won = stats.won || 0;
  const draw = stats.draw || 0;
  const noShows = stats.noShows || 0;
  const lateArrivals = stats.lateArrivals || 0;
  const mvp = userData.mvpAwards || 0;
  const kudos = (userData.kudosSummary && userData.kudosSummary.total) || 0;

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
// PROCESAMIENTO
// ========================

async function processUser(uid, options) {
  const { dryRun, force } = options;
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    console.log(`⚠️  ${uid}: doc no existe — skip`);
    return { status: "skip_no_doc" };
  }

  const data = snap.data() || {};

  // Idempotencia
  const alreadyMigrated = data._migration && data._migration.xpBackfillV1;
  if (alreadyMigrated && !force) {
    console.log(`⏭️  ${uid}: ya migrado (${data._migration.xpBackfillV1.runAt}) — skip (usar --force para re-correr)`);
    return { status: "skip_migrated" };
  }

  const xp = estimateHistoricalXp(data);
  const level = calcLevelFromXp(xp);
  const tier = calcTierFromLevel(level);

  const stats = data.stats || {};
  console.log(
    `📊 ${uid}: PJ=${stats.played || 0} PG=${stats.won || 0} PE=${stats.draw || 0} ` +
    `MVP=${data.mvpAwards || 0} Kudos=${(data.kudosSummary && data.kudosSummary.total) || 0} ` +
    `NoShow=${stats.noShows || 0} Late=${stats.lateArrivals || 0} → ` +
    `XP=${xp} | L${level} | ${tier.toUpperCase()}`
  );

  if (dryRun) return { status: "dry_run", xp, level, tier };

  const now = new Date().toISOString();

  // 1) Update del user con xp/level/tier/migration flag
  await userRef.update({
    xp,
    xpLevel: level,
    xpTier: tier,
    xpLastEvent: now,
    "_migration.xpBackfillV1": { runAt: now, version: 1 },
  });

  // 2) xpEvents de auditoría (idempotente por doc id determinístico)
  const eventId = `${uid}_backfill_v1_history`;
  await db.collection("xpEvents").doc(eventId).set({
    uid,
    source: "backfill_v1",
    contextId: "history",
    amount: xp,
    reason: "XP calculado desde tu historia previa",
    createdAt: now,
  });

  return { status: "updated", xp, level, tier };
}

async function runForUser(userId, options) {
  console.log(`🔍 Procesando usuario: ${userId}${options.dryRun ? " (DRY RUN)" : ""}\n`);
  const result = await processUser(userId, options);
  console.log(`\n✅ Resultado: ${result.status}`);
  if (result.xp != null) {
    console.log(`   XP: ${result.xp} | Nivel: ${result.level} | Tier: ${result.tier}`);
  }
  process.exit(0);
}

async function runAll(options) {
  const modeLabel = options.dryRun ? " (DRY RUN — sin escrituras)" : options.force ? " (FORCE — re-correr migrados)" : "";
  console.log(`🚀 Backfill XP para TODOS los usuarios${modeLabel}\n`);

  const snap = await db.collection("users").get();
  const uids = snap.docs.map((d) => d.id);
  console.log(`👥 Usuarios totales: ${uids.length}\n`);

  const summary = { updated: 0, skip_migrated: 0, skip_no_doc: 0, dry_run: 0, error: 0 };
  const BATCH_SIZE = 10;

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((uid) =>
        processUser(uid, options).catch((err) => {
          console.error(`❌ ${uid}: ${err.message}`);
          return { status: "error" };
        }),
      ),
    );
    for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
  }

  console.log("\n📊 Resumen:");
  console.log(`   ✅ Updated:        ${summary.updated || 0}`);
  console.log(`   ⏭️  Skip migrados:  ${summary.skip_migrated || 0}`);
  console.log(`   ⚠️  Skip sin doc:   ${summary.skip_no_doc || 0}`);
  if (options.dryRun) console.log(`   🔍 Dry-run total:  ${summary.dry_run || 0}`);
  console.log(`   ❌ Errores:        ${summary.error || 0}`);
  process.exit(0);
}

// --- Entry point ---
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const positional = args.find((a) => !a.startsWith("--"));

if (positional === "--all" || args.includes("--all")) {
  runAll({ dryRun, force }).catch((e) => { console.error("❌", e.message); process.exit(1); });
} else if (positional) {
  runForUser(positional, { dryRun, force }).catch((e) => { console.error("❌", e.message); process.exit(1); });
} else {
  console.error("❌ Uso:");
  console.error("  node scripts/backfillXp.js <userId> [--dry-run] [--force]");
  console.error("  node scripts/backfillXp.js --all [--dry-run] [--force]");
  process.exit(1);
}
