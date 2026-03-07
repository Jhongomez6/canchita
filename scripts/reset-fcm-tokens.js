/**
 * One-time script: Reset all FCM tokens to force re-registration.
 * Run with: node scripts/reset-fcm-tokens.js
 * 
 * This clears fcmTokens[] and sets notificationsEnabled=false
 * so the app shows the push prompt again for all users.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function resetAllTokens() {
    const usersSnap = await db.collection("users").get();
    console.log(`Found ${usersSnap.size} users`);

    let updated = 0;
    for (const doc of usersSnap.docs) {
        const data = doc.data();
        if (data.fcmTokens || data.notificationsEnabled) {
            await doc.ref.update({
                fcmTokens: admin.firestore.FieldValue.delete(),
                notificationsEnabled: false,
            });
            console.log(`✅ Reset: ${doc.id} (had ${data.fcmTokens?.length || 0} tokens)`);
            updated++;
        }
    }

    console.log(`\nDone! Reset ${updated}/${usersSnap.size} users.`);
    console.log("Users will see the push notification prompt next time they open the app.");
    process.exit(0);
}

resetAllTokens().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
