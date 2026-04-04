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

function calcWeeklyStreak(matches) {
  if (matches.length === 0) return 0;

  const weekMap = new Set();
  matches.forEach((match) => {
    // Parsear como hora local agregando T12:00:00 para evitar shift de UTC
    const weekKey = getMonday(new Date(match.date + "T12:00:00"));
    weekMap.add(weekKey);
  });

  const todayMonday = getMonday(new Date());
  let streak = 0;
  let current = new Date(todayMonday + "T12:00:00");

  for (let i = 0; i < 1000; i++) {
    const weekKey = getMonday(current);
    if (weekMap.has(weekKey)) {
      streak++;
      current.setDate(current.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
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
  const streak = calcWeeklyStreak(matches);

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
    console.log(`🔥 Racha semanal: ${streak} semanas`);
  } else {
    console.log(`🔥 ${userId}: ${matches.length} partidos → racha semanal = ${streak}`);
  }

  await db.collection("users").doc(userId).update({ weeklyStreak: streak });
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
    await db.collection("users").doc(userId).update({ weeklyStreak: 0 });
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
