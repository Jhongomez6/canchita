/**
 * Script para calcular y actualizar la Racha Semanal
 *
 * Uso:
 * node scripts/calculateWeeklyStreak.js <userId>    → un usuario
 * node scripts/calculateWeeklyStreak.js --all       → todos los usuarios
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

function getMonday(date) {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  // Usar fecha local, no UTC
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcWeeklyStreakAndLast(matches) {
  if (matches.length === 0) return { streak: 0, lastPlayedWeek: null };

  const weekSet = new Set();
  matches.forEach((match) => {
    weekSet.add(getMonday(new Date(match.date + "T12:00:00")));
  });

  const weeksDesc = Array.from(weekSet).sort().reverse();
  const lastPlayedWeek = weeksDesc[0];

  let streak = 1;
  let current = new Date(lastPlayedWeek + "T12:00:00");
  for (let i = 1; i < weeksDesc.length; i++) {
    current.setDate(current.getDate() - 7);
    const expected = getMonday(current);
    if (weeksDesc[i] === expected) {
      streak++;
    } else {
      break;
    }
  }

  return { streak, lastPlayedWeek };
}

async function fetchMatchesByUser() {
  const matchesSnap = await db
    .collection("matches")
    .where("status", "==", "closed")
    .get();

  console.log(`📊 Partidos cerrados encontrados: ${matchesSnap.size}`);

  const userMatchesMap = new Map();

  matchesSnap.forEach((doc) => {
    const match = doc.data();
    if (!Array.isArray(match.players)) return;
    match.players.forEach((player) => {
      if (!player?.uid) return;
      if (!userMatchesMap.has(player.uid)) userMatchesMap.set(player.uid, []);
      userMatchesMap.get(player.uid).push({
        id: doc.id,
        date: match.date,
        time: match.time,
      });
    });
  });

  return userMatchesMap;
}

async function runForUser(userId, userMatchesMap, verbose = false) {
  const matches = userMatchesMap.get(userId) || [];
  const { streak, lastPlayedWeek } = calcWeeklyStreakAndLast(matches);

  if (verbose) {
    console.log(`\n👤 Usuario: ${userId}`);
    console.log(`⚽ Partidos: ${matches.length}`);

    // Agrupar por semana para mostrar
    const weekMap = new Map();
    matches.forEach((m) => {
      const key = getMonday(new Date(m.date + "T12:00:00"));
      weekMap.set(key, (weekMap.get(key) || 0) + 1);
    });
    const weeks = Array.from(weekMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    weeks.forEach(([k, count]) => console.log(`   ${k}: ${count} partido(s)`));
    console.log(`🔥 Racha semanal: ${streak} semanas (última: ${lastPlayedWeek ?? "—"})`);
  } else {
    console.log(`🔥 ${userId}: ${matches.length} partidos → racha = ${streak}, última = ${lastPlayedWeek ?? "—"}`);
  }

  const update = { weeklyStreak: streak };
  if (lastPlayedWeek) update.lastPlayedWeek = lastPlayedWeek;
  await db.collection("users").doc(userId).update(update);
  return streak;
}

async function runAll() {
  console.log("🚀 Calculando racha semanal para TODOS los usuarios...\n");

  const userMatchesMap = await fetchMatchesByUser();
  const uids = Array.from(userMatchesMap.keys());
  console.log(`👥 Usuarios con partidos: ${uids.length}\n`);

  let updated = 0;
  const BATCH_SIZE = 10;
  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((uid) => runForUser(uid, userMatchesMap, false)));
    updated += batch.length;
  }

  console.log(`\n✅ Listo. ${updated} usuarios actualizados.`);
  process.exit(0);
}

async function runSingle(userId) {
  console.log(`🔍 Calculando racha semanal para usuario: ${userId}\n`);
  const userMatchesMap = await fetchMatchesByUser();

  if (!userMatchesMap.has(userId)) {
    console.log("⚠️  El usuario no tiene partidos cerrados.");
    await db.collection("users").doc(userId).update({ weeklyStreak: 0, lastPlayedWeek: admin.firestore.FieldValue.delete() });
    console.log("✅ weeklyStreak actualizado a 0");
    process.exit(0);
  }

  const streak = await runForUser(userId, userMatchesMap, true);
  console.log(`\n✅ Actualizado → weeklyStreak: ${streak}`);
  process.exit(0);
}

// --- Entry point ---
const arg = process.argv[2];

if (arg === "--all") {
  runAll().catch((e) => { console.error("❌", e.message); process.exit(1); });
} else if (arg) {
  runSingle(arg).catch((e) => { console.error("❌", e.message); process.exit(1); });
} else {
  console.error("❌ Uso:");
  console.error("  node scripts/calculateWeeklyStreak.js <userId>");
  console.error("  node scripts/calculateWeeklyStreak.js --all");
  process.exit(1);
}
