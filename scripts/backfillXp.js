/**
 * Script de migración inicial: calcula y asigna el XP histórico de cada usuario
 * desde sus stats existentes (played, won, draw, mvpAwards, kudos, noShows, lateArrivals),
 * siembra `firstMatchAt` (habilita veteran_year) y desbloquea los achievements retroactivos
 * con su XP bonus. Path completo equivalente al callable `backfillAllUsersXp` (modo silent:
 * no envía notifs — es una migración masiva).
 *
 * Idempotente: si un user ya tiene `_migration.xpBackfillV1` o `xp`, se omite (salvo --force).
 * El XP final = XP base (stats) + suma de bonuses de achievements desbloqueados, por lo que
 * re-correr con --force da el mismo resultado (no acumula de más).
 *
 * Uso:
 *   node scripts/backfillXp.js <userId>            → solo ese usuario
 *   node scripts/backfillXp.js --all               → todos los usuarios
 *   node scripts/backfillXp.js --all --dry-run    → preview sin escribir
 *   node scripts/backfillXp.js --all --force       → re-ejecutar aunque ya esté migrado
 *
 * Fuente de verdad: lib/domain/xp.ts (mantener en sync ACHIEVEMENTS + XP_AMOUNTS + curva).
 * Reglas (igual que xp.ts):
 *   xp base = played*25 + won*10 + draw*5 + mvp*100 + kudos*5 - noShows*50 - late*10
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
  MATCH_MVP: 100,
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
// ACHIEVEMENTS (mantener en sync con lib/domain/xp.ts → ACHIEVEMENT_DEFS)
// check() recibe el contexto de buildAchievementContext().
// ========================

const ACHIEVEMENTS = [
  { id: "first_match", label: "Debut", xpBonus: 50, check: (c) => c.played >= 1 },
  { id: "matches_10", label: "Habitué", xpBonus: 100, check: (c) => c.played >= 10 },
  { id: "matches_25", label: "Veterano", xpBonus: 200, check: (c) => c.played >= 25 },
  { id: "matches_50", label: "Imparable", xpBonus: 400, check: (c) => c.played >= 50 },
  { id: "matches_100", label: "Centenario", xpBonus: 1000, check: (c) => c.played >= 100 },
  { id: "matches_250", label: "Inquilino del Predio", xpBonus: 2500, check: (c) => c.played >= 250 },
  { id: "matches_500", label: "Eterno del Predio", xpBonus: 5000, check: (c) => c.played >= 500 },
  { id: "first_win", label: "Primera Victoria", xpBonus: 50, check: (c) => c.won >= 1 },
  { id: "wins_10", label: "Ganador", xpBonus: 150, check: (c) => c.won >= 10 },
  { id: "wins_25", label: "Triunfador", xpBonus: 300, check: (c) => c.won >= 25 },
  { id: "wins_50", label: "Implacable", xpBonus: 600, check: (c) => c.won >= 50 },
  { id: "wins_100", label: "Invencible", xpBonus: 1200, check: (c) => c.won >= 100 },
  { id: "first_mvp", label: "Primer MVP", xpBonus: 100, check: (c) => c.mvpAwards >= 1 },
  { id: "mvp_5", label: "Figura Repetida", xpBonus: 300, check: (c) => c.mvpAwards >= 5 },
  { id: "mvp_10", label: "Figura del Predio", xpBonus: 600, check: (c) => c.mvpAwards >= 10 },
  { id: "mvp_25", label: "Crack Indiscutido", xpBonus: 1500, check: (c) => c.mvpAwards >= 25 },
  { id: "mvp_50", label: "Ídolo Absoluto", xpBonus: 3000, check: (c) => c.mvpAwards >= 50 },
  { id: "weekly_streak_3", label: "Constante", xpBonus: 50, check: (c) => c.weeklyStreak >= 3 },
  { id: "weekly_streak_5", label: "Constancia", xpBonus: 200, check: (c) => c.weeklyStreak >= 5 },
  { id: "weekly_streak_10", label: "Inquebrantable", xpBonus: 500, check: (c) => c.weeklyStreak >= 10 },
  { id: "weekly_streak_25", label: "Maratonista", xpBonus: 1500, check: (c) => c.weeklyStreak >= 25 },
  { id: "weekly_streak_50", label: "Todo el Año", xpBonus: 3000, check: (c) => c.weeklyStreak >= 50 },
  { id: "commitment_streak_10", label: "Puntual", xpBonus: 150, check: (c) => c.commitmentStreak >= 10 },
  { id: "commitment_streak_25", label: "Reloj Suizo", xpBonus: 400, check: (c) => c.commitmentStreak >= 25 },
  { id: "commitment_streak_50", label: "Compromiso Total", xpBonus: 1000, check: (c) => c.commitmentStreak >= 50 },
  { id: "commitment_streak_100", label: "Puntualidad Perfecta", xpBonus: 2000, check: (c) => c.commitmentStreak >= 100 },
  { id: "first_kudo_received", label: "Primer Reconocimiento", xpBonus: 50, check: (c) => c.kudosTotal >= 1 },
  { id: "kudos_10", label: "Apreciado", xpBonus: 100, check: (c) => c.kudosTotal >= 10 },
  { id: "kudos_25", label: "Querido", xpBonus: 200, check: (c) => c.kudosTotal >= 25 },
  { id: "kudos_50", label: "Admirado", xpBonus: 400, check: (c) => c.kudosTotal >= 50 },
  { id: "kudos_100", label: "Ídolo", xpBonus: 800, check: (c) => c.kudosTotal >= 100 },
  { id: "perfect_month", label: "Mes Perfecto", xpBonus: 300, check: (c) => c.perfectMonths >= 1 },
  { id: "perfect_months_3", label: "Trimestre Perfecto", xpBonus: 600, check: (c) => c.perfectMonths >= 3 },
  { id: "perfect_months_6", label: "Semestre Perfecto", xpBonus: 1200, check: (c) => c.perfectMonths >= 6 },
  { id: "perfect_months_12", label: "Año Perfecto", xpBonus: 2500, check: (c) => c.perfectMonths >= 12 },
  { id: "veteran_year", label: "Aniversario", xpBonus: 500, check: (c) => c.daysSinceFirstMatch >= 365 },
  { id: "first_review", label: "Opinador", xpBonus: 50, check: (c) => c.reviewCount >= 1 },
  { id: "review_master", label: "Crítico", xpBonus: 200, check: (c) => c.reviewCount >= 20 },
  { id: "reviews_50", label: "Analista", xpBonus: 500, check: (c) => c.reviewCount >= 50 },
  { id: "reach_titular", label: "Ascenso a Titular", xpBonus: 150, check: (c) => ["titular", "estrella", "capitan", "leyenda"].includes(c.xpTier) },
  { id: "reach_estrella", label: "Ascenso a Estrella", xpBonus: 400, check: (c) => ["estrella", "capitan", "leyenda"].includes(c.xpTier) },
  { id: "reach_capitan", label: "La Cinta de Capitán", xpBonus: 1000, check: (c) => ["capitan", "leyenda"].includes(c.xpTier) },
  { id: "all_tiers", label: "Leyenda Confirmada", xpBonus: 2000, check: (c) => c.xpTier === "leyenda" },
];

/**
 * Fecha ISO del partido cerrado más antiguo del usuario (para firstMatchAt / veteran_year).
 * Usa array-contains sobre playerUids (auto-indexado) y calcula el mínimo en memoria.
 */
async function findFirstMatchAt(uid) {
  const snap = await db.collection("matches").where("playerUids", "array-contains", uid).get();
  let earliestTs;
  let earliestIso;
  snap.forEach((doc) => {
    const m = doc.data() || {};
    if (m.status !== "closed" || !m.date) return;
    const ts = new Date(`${m.date}T${m.time || "00:00"}`).getTime();
    if (Number.isNaN(ts)) return;
    if (earliestTs === undefined || ts < earliestTs) {
      earliestTs = ts;
      earliestIso = new Date(ts).toISOString();
    }
  });
  return earliestIso;
}

/** Contexto para evaluar achievements: stats + firstMatchAt + tier base (del XP base). */
function buildAchievementContext(data, baseTier, firstMatchAt) {
  const stats = data.stats || {};
  const daysSinceFirstMatch = firstMatchAt
    ? Math.floor((Date.now() - new Date(firstMatchAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  return {
    played: stats.played || 0,
    won: stats.won || 0,
    mvpAwards: data.mvpAwards || 0,
    kudosTotal: (data.kudosSummary && data.kudosSummary.total) || 0,
    weeklyStreak: data.weeklyStreak || 0,
    commitmentStreak: data.commitmentStreak || 0,
    earlyConfirmCount: data.earlyConfirmCount || 0,
    reviewCount: data.reviewCount || 0,
    daysSinceFirstMatch,
    perfectMonths: data.perfectMonths || 0,
    xpTier: baseTier,
  };
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

  // Idempotencia: no re-migrar ni pisar XP ya existente (acumulado en vivo o por
  // una corrida previa). Espeja el guard del callable backfillAllUsersXp, que omite
  // cuando `typeof data.xp === "number"`. Con --force se recalcula igual.
  const alreadyMigrated = data._migration && data._migration.xpBackfillV1;
  const hasXp = typeof data.xp === "number";
  if ((alreadyMigrated || hasXp) && !force) {
    const reason = alreadyMigrated
      ? `ya migrado (${data._migration.xpBackfillV1.runAt})`
      : `ya tiene xp=${data.xp} (acumulado en vivo)`;
    console.log(`⏭️  ${uid}: ${reason} — skip (usar --force para re-correr)`);
    return { status: "skip_migrated" };
  }

  // --- 1) XP base desde stats ---
  const baseXp = estimateHistoricalXp(data);
  const baseLevel = calcLevelFromXp(baseXp);
  const baseTier = calcTierFromLevel(baseLevel);

  // --- 2) firstMatchAt (habilita veteran_year) ---
  const existingFirstMatchAt = typeof data.firstMatchAt === "string" ? data.firstMatchAt : undefined;
  const firstMatchAt = existingFirstMatchAt || await findFirstMatchAt(uid);

  // --- 3) Achievements que califican (evaluados con el tier base, como el callable) ---
  const ctx = buildAchievementContext(data, baseTier, firstMatchAt);
  const qualifying = ACHIEVEMENTS.filter((a) => a.check(ctx));
  const bonusSum = qualifying.reduce((sum, a) => sum + a.xpBonus, 0);

  // --- 4) XP final = base + bonuses (nunca acumula de más al re-correr) ---
  const xp = baseXp + bonusSum;
  const level = calcLevelFromXp(xp);
  const tier = calcTierFromLevel(level);

  const stats = data.stats || {};
  console.log(
    `📊 ${uid}: PJ=${stats.played || 0} PG=${stats.won || 0} PE=${stats.draw || 0} ` +
    `MVP=${data.mvpAwards || 0} Kudos=${(data.kudosSummary && data.kudosSummary.total) || 0} ` +
    `NoShow=${stats.noShows || 0} Late=${stats.lateArrivals || 0} → ` +
    `base=${baseXp} +${bonusSum}(${qualifying.length} logros) = XP=${xp} | L${level} | ${tier.toUpperCase()}`
  );

  if (dryRun) return { status: "dry_run", xp, level, tier, achievements: qualifying.length };

  const now = new Date().toISOString();

  // --- 5) Update del user: xp/level/tier + firstMatchAt + achievements map + migration flag ---
  const existingAch = data.achievements || {};
  const userUpdate = {
    xp,
    xpLevel: level,
    xpTier: tier,
    xpLastEvent: now,
    "_migration.xpBackfillV1": { runAt: now, version: 1 },
  };
  if (firstMatchAt && !existingFirstMatchAt) userUpdate.firstMatchAt = firstMatchAt;
  for (const a of qualifying) {
    const prev = existingAch[a.id];
    userUpdate[`achievements.${a.id}`] = {
      unlockedAt: (prev && prev.unlockedAt) || now,
      xpBonus: a.xpBonus,
    };
  }
  await userRef.update(userUpdate);

  // --- 6) xpEvents de auditoría (idempotentes por doc id determinístico) ---
  await db.collection("xpEvents").doc(`${uid}_backfill_v1_history`).set({
    uid,
    source: "backfill_v1",
    contextId: "history",
    amount: baseXp,
    reason: "XP calculado desde tu historia previa",
    createdAt: now,
  });
  for (const a of qualifying) {
    await db.collection("xpEvents").doc(`${uid}_achievement_bonus_${a.id}`).set({
      uid,
      source: "achievement_bonus",
      contextId: a.id,
      amount: a.xpBonus,
      reason: `Logro: ${a.label}`,
      createdAt: now,
    });
  }

  return { status: "updated", xp, level, tier, achievements: qualifying.length };
}

async function runForUser(userId, options) {
  console.log(`🔍 Procesando usuario: ${userId}${options.dryRun ? " (DRY RUN)" : ""}\n`);
  const result = await processUser(userId, options);
  console.log(`\n✅ Resultado: ${result.status}`);
  if (result.xp != null) {
    console.log(`   XP: ${result.xp} | Nivel: ${result.level} | Tier: ${result.tier} | Logros: ${result.achievements || 0}`);
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
  let achievementsTotal = 0;
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
    for (const r of results) {
      summary[r.status] = (summary[r.status] || 0) + 1;
      achievementsTotal += r.achievements || 0;
    }
  }

  console.log("\n📊 Resumen:");
  console.log(`   ✅ Updated:        ${summary.updated || 0}`);
  console.log(`   ⏭️  Skip migrados:  ${summary.skip_migrated || 0}`);
  console.log(`   ⚠️  Skip sin doc:   ${summary.skip_no_doc || 0}`);
  if (options.dryRun) console.log(`   🔍 Dry-run total:  ${summary.dry_run || 0}`);
  console.log(`   🏅 Logros totales: ${achievementsTotal}`);
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
