/**
 * One-time script: Upgrade low-res Google profile photos (=s96-c → =s400-c).
 * Run with: node scripts/upgrade-google-photos.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function upgradePhotos() {
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users`);

  let updated = 0;
  for (const doc of usersSnap.docs) {
    const { photoURL } = doc.data();
    if (photoURL && /=s\d+-c$/.test(photoURL) && !photoURL.includes("=s400-c")) {
      const upgraded = photoURL.replace(/=s\d+-c$/, "=s400-c");
      await doc.ref.update({ photoURL: upgraded });
      console.log(`✅ ${doc.id}: ${photoURL} → ${upgraded}`);
      updated++;
    }
  }

  console.log(`\nDone! Upgraded ${updated}/${usersSnap.size} users.`);
  process.exit(0);
}

upgradePhotos().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
