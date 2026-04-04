/**
 * Script para calcular y actualizar la Racha de Compromiso
 *
 * Uso:
 * node scripts/calculateStreak.js <userId>      → un usuario
 * node scripts/calculateStreak.js --all         → todos los usuarios
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

function calcCommitmentStreak(matches) {
  // matches ordenados descendente (más reciente primero)
  let streak = 0;
  for (const match of matches) {
    const attendance = match.attendance || "present";
    if (attendance === "no_show" || attendance === "late") break;
    streak++;
  }
  return streak;
}

async function fetchMatchesByUser() {
  const matchesSnap = await db
    .collection("matches")
    .where("status", "==", "closed")
    .get();

  console.log(`📊 Partidos cerrados encontrados: ${matchesSnap.size}`);

  // Construir mapa uid → [{date, time, attendance}]
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
        attendance: player.attendance,
      });
    });
  });

  // Ordenar cada usuario por fecha descendente
  userMatchesMap.forEach((matches) => {
    matches.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`).getTime();
      const dateB = new Date(`${b.date}T${b.time}`).getTime();
      return dateB - dateA;
    });
  });

  return userMatchesMap;
}

async function runForUser(userId, userMatchesMap) {
  const matches = userMatchesMap.get(userId) || [];

  if (matches.length === 0) {
    console.log(`⚠️  ${userId}: sin partidos cerrados → streak = 0`);
    await db.collection("users").doc(userId).update({ commitmentStreak: 0 });
    return 0;
  }

  const streak = calcCommitmentStreak(matches);

  console.log(`🔥 ${userId}: ${matches.length} partidos → racha = ${streak}`);

  if (process.argv[2] !== "--all") {
    // Modo individual: mostrar detalle
    console.log("\n📈 Detalle (más reciente → más antiguo):\n");
    matches.forEach((m, i) => {
      const att = m.attendance || "present";
      const icon = att === "no_show" ? "❌" : att === "late" ? "⏰" : "✅";
      console.log(`   ${i + 1}. ${m.date} ${m.time} - ${icon} ${att.toUpperCase()}`);
    });
    console.log();
  }

  await db.collection("users").doc(userId).update({ commitmentStreak: streak });
  return streak;
}

async function runAll() {
  console.log("🚀 Calculando racha de compromiso para TODOS los usuarios...\n");

  const userMatchesMap = await fetchMatchesByUser();
  const uids = Array.from(userMatchesMap.keys());
  console.log(`👥 Usuarios con partidos: ${uids.length}\n`);

  let updated = 0;
  // Procesar en lotes para no saturar Firestore
  const BATCH_SIZE = 10;
  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((uid) => runForUser(uid, userMatchesMap)));
    updated += batch.length;
  }

  console.log(`\n✅ Listo. ${updated} usuarios actualizados.`);
  process.exit(0);
}

async function runSingle(userId) {
  console.log(`🔍 Calculando racha para usuario: ${userId}\n`);
  const userMatchesMap = await fetchMatchesByUser();
  const streak = await runForUser(userId, userMatchesMap);
  console.log(`✅ Actualizado → commitmentStreak: ${streak}`);
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
  console.error("  node scripts/calculateStreak.js <userId>");
  console.error("  node scripts/calculateStreak.js --all");
  process.exit(1);
}
