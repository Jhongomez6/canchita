/**
 * DEMO persistente de la polla mundialista en la cuenta real del admin.
 * Siembra predicciones + un resultado para ver el flujo en la app.
 *
 *   node scripts/_demo_worldcup.js            → siembra la demo
 *   node scripts/_demo_worldcup.js --cleanup  → borra la demo y restaura partidos
 *
 * Archivo temporal — borrar tras la demo.
 */
const admin = require("firebase-admin");
const path = require("path");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.cwd(), "serviceAccountKey.json"))) });
const db = admin.firestore();

const EMAIL = "seagatemanhattan@gmail.com";
const FINISHED_MATCH = "1";   // recibe resultado
const OPEN_MATCH = "2";       // queda abierto con predicción
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findUid() {
    const q = await db.collection("users").where("email", "==", EMAIL).limit(1).get();
    if (q.empty) throw new Error(`No se encontró usuario con email ${EMAIL}`);
    return { uid: q.docs[0].id, profile: q.docs[0].data() };
}

(async () => {
    const cleanup = process.argv.includes("--cleanup");
    const { uid, profile } = await findUid();
    const snapshot = { displayName: profile.name || "Admin", photoURLThumb: profile.photoURLThumb };

    const pred1Ref = db.collection("worldcupPredictions").doc(`${uid}_${FINISHED_MATCH}`);
    const pred2Ref = db.collection("worldcupPredictions").doc(`${uid}_${OPEN_MATCH}`);
    const lbRef = db.collection("worldcupLeaderboard").doc(uid);
    const m1Ref = db.collection("worldcupMatches").doc(FINISHED_MATCH);

    if (cleanup) {
        console.log("🧹 Limpiando demo...");
        await pred1Ref.delete();
        await pred2Ref.delete();
        await lbRef.delete();
        await m1Ref.update({
            "score.home": null, "score.away": null,
            status: "SCHEDULED",
            adminUpdatedAt: admin.firestore.FieldValue.delete(),
        });
        console.log("   ✓ Predicciones, leaderboard y partido 1 restaurados");
        process.exit(0);
    }

    console.log(`👤 Usuario: ${snapshot.displayName} (${uid})\n`);
    const now = new Date().toISOString();

    // Predicción 1: 2-1 (será exacta)
    await pred1Ref.set({
        id: pred1Ref.id, userId: uid, matchId: FINISHED_MATCH,
        homeGoals: 2, awayGoals: 1, displayName: snapshot.displayName,
        ...(snapshot.photoURLThumb ? { photoURLThumb: snapshot.photoURLThumb } : {}),
        createdAt: now, updatedAt: now,
    });
    console.log("1️⃣  Predicción en partido 1: 2-1");

    // Predicción 2: 1-0 (queda abierta, editable)
    await pred2Ref.set({
        id: pred2Ref.id, userId: uid, matchId: OPEN_MATCH,
        homeGoals: 1, awayGoals: 0, displayName: snapshot.displayName,
        ...(snapshot.photoURLThumb ? { photoURLThumb: snapshot.photoURLThumb } : {}),
        createdAt: now, updatedAt: now,
    });
    console.log("2️⃣  Predicción en partido 2: 1-0 (sin resultado, editable)");

    // Resultado partido 1: 2-1 → dispara trigger
    await m1Ref.update({
        "score.home": 2, "score.away": 1,
        status: "FINISHED", adminUpdatedAt: now,
    });
    console.log("3️⃣  Resultado partido 1 cargado: 2-1 → FINISHED");

    console.log("⏳ Esperando al trigger del leaderboard...");
    let lb;
    for (let i = 0; i < 8; i++) {
        await sleep(4000);
        lb = (await lbRef.get()).data();
        if (lb) break;
    }
    console.log(lb ? `   ✓ Leaderboard: ${lb.points} pts, ${lb.exactHits} exactos, ${lb.predictions} jugadas` : "   ⚠️ Leaderboard aún no creado (puede tardar unos segundos más)");

    console.log("\n✅ Demo lista. Entrá a /worldcup y /worldcup/leaderboard en la app.");
    console.log("   Cuando termines, avisá y corro: node scripts/_demo_worldcup.js --cleanup");
    process.exit(0);
})().catch((e) => { console.error("❌", e); process.exit(1); });
