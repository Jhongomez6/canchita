/**
 * One-time migration: Backfill locationSnapshot on matches that don't have it.
 * Run with: node scripts/backfill-location-snapshot.js
 *
 * For each match without locationSnapshot, fetches the location doc by locationId
 * and writes { name, address, lat, lng } into the match.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function backfillLocationSnapshots() {
    const matchesSnap = await db.collection("matches").get();
    console.log(`Found ${matchesSnap.size} matches`);

    const locationCache = {};
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const matchDoc of matchesSnap.docs) {
        const data = matchDoc.data();

        if (data.locationSnapshot) {
            skipped++;
            continue;
        }

        if (!data.locationId) {
            console.warn(`⚠️  Match ${matchDoc.id} has no locationId — skipping`);
            errors++;
            continue;
        }

        // Cache locations to avoid redundant reads
        if (!locationCache[data.locationId]) {
            const locSnap = await db.collection("locations").doc(data.locationId).get();
            if (!locSnap.exists) {
                console.warn(`⚠️  Location ${data.locationId} not found for match ${matchDoc.id} — skipping`);
                errors++;
                continue;
            }
            locationCache[data.locationId] = locSnap.data();
        }

        const loc = locationCache[data.locationId];
        await matchDoc.ref.update({
            locationSnapshot: {
                name: loc.name,
                address: loc.address,
                lat: loc.lat,
                lng: loc.lng,
            },
        });

        console.log(`✅ ${matchDoc.id} → ${loc.name}`);
        updated++;
    }

    console.log(`\nDone!`);
    console.log(`  Updated : ${updated}`);
    console.log(`  Already had snapshot: ${skipped}`);
    console.log(`  Errors  : ${errors}`);
    process.exit(0);
}

backfillLocationSnapshots().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
