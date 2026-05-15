/**
 * Migración: recalcular rating y nivel de usuarios tras rebalanceo (2026-05-15).
 *
 * Cambios aplicados:
 *  - Físico (1-5): [0, 40, 80, 120, 160] → [0, 50, 100, 150, 200]
 *  - Torneos:     +100 → +60
 *  - Niveles 3 → 4: <320 Principiante / 320-500 Básico / 501-700 Intermedio / >700 Avanzado
 *
 * Uso:
 *   node scripts/recalculate-user-levels.js --dry-run   # imprime cambios sin escribir
 *   node scripts/recalculate-user-levels.js             # aplica los cambios
 *
 * Solo recalcula usuarios con initialRatingCalculated === true. El resto se salta.
 *
 * La fórmula está duplicada acá a propósito: el script es JS puro y autocontenido
 * para correr con `node` sin build. La fuente de verdad sigue siendo lib/domain/rating.ts.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ========================
// CONSTANTES — espejo de lib/domain/rating.ts
// ========================

const BASE_RATING = 200;
const TECH_POINTS = { 1: 0, 2: 80, 3: 160, 4: 240, 5: 320 };
const PHYS_POINTS = { 1: 0, 2: 50, 3: 100, 4: 150, 5: 200 };
const FREQUENCY_POINTS = { occasional: 0, weekly: 60, intense: 120 };
const SCHOOL_BONUS = 100;
const TOURNAMENT_BONUS = 60;
const MIN_RATING = 100;
const MAX_RATING = 950;

function ratingToLevel(rating) {
    if (rating < 320) return 1;
    if (rating <= 500) return 2;
    if (rating <= 700) return 3;
    return 4;
}

function getAgeFromBirthdate(birthdate) {
    // birthdate format: YYYY-MM-DD
    const [y, m, d] = birthdate.split("-").map(Number);
    const today = new Date();
    let age = today.getFullYear() - y;
    const beforeBirthday =
        today.getMonth() + 1 < m ||
        (today.getMonth() + 1 === m && today.getDate() < d);
    if (beforeBirthday) age -= 1;
    return age;
}

function calculateRating(data) {
    let rating = BASE_RATING;
    rating += TECH_POINTS[data.techLevel] ?? 0;
    rating += PHYS_POINTS[data.physLevel] ?? 0;
    if (data.hasSchool) rating += SCHOOL_BONUS;
    if (data.hasTournaments) rating += TOURNAMENT_BONUS;
    rating += FREQUENCY_POINTS[data.frequency] ?? 0;

    if (data.age >= 18 && data.age <= 35) rating += 50;
    else if (data.age > 45) rating -= 50;

    rating = Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
    return { rating, level: ratingToLevel(rating) };
}

// ========================
// MIGRACIÓN
// ========================

async function migrate(dryRun) {
    console.log(`\n${dryRun ? "🔍 DRY RUN" : "✍️  ESCRITURA REAL"} — recalculando niveles de usuarios\n`);

    const usersSnap = await db.collection("users").get();
    console.log(`Encontrados ${usersSnap.size} usuarios\n`);

    let recalculated = 0;
    let recalculatedLegacy = 0; // solo nivel desde rating, sin datos crudos
    let unchanged = 0;
    let skippedNoOnboarding = 0;
    let skippedNoRating = 0;
    const levelTransitions = {}; // "1→2": count

    for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        const uid = userDoc.id;
        const name = data.name || data.displayName || uid.slice(0, 8);

        if (!data.initialRatingCalculated) {
            skippedNoOnboarding++;
            continue;
        }

        // Reconstruir OnboardingData
        let age = null;
        if (data.birthdate) {
            age = getAgeFromBirthdate(data.birthdate);
        } else if (typeof data.age === "number") {
            age = data.age; // fallback legacy
        }

        const missing = [];
        if (age === null) missing.push("birthdate/age");
        if (typeof data.techLevel !== "number") missing.push(`techLevel(${typeof data.techLevel}:${data.techLevel})`);
        if (typeof data.physLevel !== "number") missing.push(`physLevel(${typeof data.physLevel}:${data.physLevel})`);
        if (typeof data.hasSchool !== "boolean") missing.push(`hasSchool(${typeof data.hasSchool}:${data.hasSchool})`);
        if (typeof data.hasTournaments !== "boolean") missing.push(`hasTournaments(${typeof data.hasTournaments}:${data.hasTournaments})`);
        if (typeof data.frequency !== "string") missing.push(`frequency(${typeof data.frequency}:${data.frequency})`);

        const oldRating = data.rating;
        const oldLevel = data.level;

        // CASO LEGACY: sin datos crudos, pero con rating guardado
        // (usuarios que hicieron onboarding antes del commit "saving all data from onboarding form")
        // → solo remapeamos el nivel desde el rating con los nuevos umbrales, sin tocar el rating.
        if (missing.length > 0) {
            if (typeof oldRating !== "number") {
                console.warn(`⚠️  ${name} (${uid}) — sin rating ni datos crudos, salteado. Faltan: ${missing.join(", ")}`);
                skippedNoRating++;
                continue;
            }

            const newLevel = ratingToLevel(oldRating);
            if (newLevel === oldLevel) {
                unchanged++;
                continue;
            }

            const transitionKey = `${oldLevel ?? "?"}→${newLevel}`;
            levelTransitions[transitionKey] = (levelTransitions[transitionKey] || 0) + 1;

            console.log(
                `🧓 ${name.padEnd(25)} ` +
                `rating ${String(oldRating).padStart(4)} (sin cambio)        ` +
                `level ${oldLevel ?? "?"} → ${newLevel}  ` +
                `[legacy: solo-nivel, faltan ${missing.length} campos: ${missing.map(m => m.split("(")[0]).join(",")}]`
            );

            if (!dryRun) {
                await userDoc.ref.update({ level: newLevel });
            }
            recalculatedLegacy++;
            continue;
        }

        // CASO COMPLETO: tenemos todos los datos crudos, recalculamos rating + nivel
        const { rating: newRating, level: newLevel } = calculateRating({
            age,
            techLevel: data.techLevel,
            physLevel: data.physLevel,
            hasSchool: data.hasSchool,
            hasTournaments: data.hasTournaments,
            frequency: data.frequency,
        });

        if (oldRating === newRating && oldLevel === newLevel) {
            unchanged++;
            continue;
        }

        const transitionKey = `${oldLevel ?? "?"}→${newLevel}`;
        levelTransitions[transitionKey] = (levelTransitions[transitionKey] || 0) + 1;

        const arrow = oldLevel !== newLevel ? "🔄" : "  ";
        console.log(
            `${arrow} ${name.padEnd(25)} ` +
            `rating ${String(oldRating ?? "?").padStart(4)} → ${String(newRating).padStart(4)}  ` +
            `level ${oldLevel ?? "?"} → ${newLevel}`
        );

        if (!dryRun) {
            await userDoc.ref.update({ rating: newRating, level: newLevel });
        }
        recalculated++;
    }

    console.log(`\n──────────── Resumen ────────────`);
    console.log(`  Recalculados (full)       : ${recalculated}`);
    console.log(`  Recalculados (legacy nv.) : ${recalculatedLegacy}`);
    console.log(`  Sin cambio                : ${unchanged}`);
    console.log(`  Sin onboarding            : ${skippedNoOnboarding}`);
    console.log(`  Sin rating ni datos       : ${skippedNoRating}`);
    console.log(`  Total procesados          : ${usersSnap.size}`);

    if (Object.keys(levelTransitions).length > 0) {
        console.log(`\n  Transiciones de nivel:`);
        for (const [key, count] of Object.entries(levelTransitions).sort()) {
            console.log(`    ${key}: ${count}`);
        }
    }

    if (dryRun) {
        console.log(`\n  ⚠️  DRY RUN — no se escribió nada. Corré sin --dry-run para aplicar.`);
    } else {
        console.log(`\n  ✅ Migración aplicada.`);
    }
}

const dryRun = process.argv.includes("--dry-run");

migrate(dryRun)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Migración falló:", err);
        process.exit(1);
    });
