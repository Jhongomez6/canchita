/**
 * One-time migration: Recalcula priceCOP en blocked_slots usando el formato
 * inferido de las canchas seleccionadas (combo o cancha individual).
 *
 * Corrige el bug donde el precio se calculaba con el formato de la vista por
 * hora (ej. sencilla) en lugar del formato del combo real seleccionado.
 *
 * Run: node scripts/backfill-manual-reservation-prices.js
 * Dry run (sin escribir): node scripts/backfill-manual-reservation-prices.js --dry-run
 */

const admin = require("firebase-admin");
const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

// ── helpers de dominio (replicados del cliente) ──────────────────────────────

function timeToMins(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function overlapMins(aStart, aEnd, bStart, bEnd) {
    return Math.max(0, Math.min(timeToMins(aEnd), timeToMins(bEnd)) - Math.max(timeToMins(aStart), timeToMins(bStart)));
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function getDayOfWeek(dateStr) {
    return DAY_NAMES[new Date(dateStr + "T12:00:00").getDay()];
}

function inferFormat(courtIds, courts, combos) {
    if (!courtIds || courtIds.length === 0) return null;
    if (courtIds.length === 1) {
        const court = courts.find((c) => c.id === courtIds[0]);
        return court?.baseFormat ?? null;
    }
    const selSet = new Set(courtIds);
    const combo = combos.find(
        (c) => c.active && c.courtIds.length === courtIds.length && c.courtIds.every((id) => selSet.has(id)),
    );
    return combo?.resultingFormat ?? null;
}

function calculatePrice(schedule, format, startTime, endTime) {
    if (!schedule || !schedule.enabled || !format) return 0;
    if (!startTime || !endTime || startTime >= endTime) return 0;
    let total = 0;
    for (const slot of schedule.slots ?? []) {
        const mins = overlapMins(startTime, endTime, slot.startTime, slot.endTime);
        if (mins === 0) continue;
        const fp = (slot.formats ?? []).find((f) => f.format === format);
        if (!fp) continue;
        const slotMins = timeToMins(slot.endTime) - timeToMins(slot.startTime);
        if (slotMins <= 0) continue;
        total += Math.round(fp.priceCOP * (mins / slotMins));
    }
    return total;
}

/**
 * Precio final del slot: usa el combo si existe, si no suma canchas individuales.
 */
function calculatePriceForSlot(schedule, courtIds, courts, combos, startTime, endTime) {
    const format = inferFormat(courtIds, courts, combos);
    if (format) return calculatePrice(schedule, format, startTime, endTime);

    // Fallback: sin combo exacto → suma precio sencilla de cada cancha
    if (courtIds.length > 1) {
        return courtIds.reduce((sum, courtId) => {
            const court = courts.find((c) => c.id === courtId);
            return sum + calculatePrice(schedule, court?.baseFormat ?? null, startTime, endTime);
        }, 0);
    }

    return 0;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(DRY_RUN ? "🔍 DRY RUN — sin escrituras" : "✏️  LIVE RUN — actualizando Firestore");

    const venuesSnap = await db.collection("venues").get();
    console.log(`Venues encontradas: ${venuesSnap.size}\n`);

    let totalSlots = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const venueDoc of venuesSnap.docs) {
        const venueId = venueDoc.id;
        const venueName = venueDoc.data().name ?? venueId;

        // Cargar courts, combos y schedules del venue
        const [courtsSnap, combosSnap, schedulesSnap, slotsSnap] = await Promise.all([
            db.collection("venues").doc(venueId).collection("courts").get(),
            db.collection("venues").doc(venueId).collection("court_combos").get(),
            db.collection("venues").doc(venueId).collection("schedules").get(),
            db.collection("venues").doc(venueId).collection("blocked_slots").get(),
        ]);

        if (slotsSnap.empty) continue;

        const courts = courtsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const combos = combosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const scheduleByDay = {};
        for (const s of schedulesSnap.docs) {
            scheduleByDay[s.id] = s.data();
        }

        console.log(`📍 ${venueName} — ${slotsSnap.size} blocked_slots`);

        for (const slotDoc of slotsSnap.docs) {
            totalSlots++;
            const slot = { id: slotDoc.id, ...slotDoc.data() };

            try {
                // Determinar el día de semana para buscar el schedule
                const refDate = slot.date ?? slot.recurrence?.startDate;
                if (!refDate) {
                    console.log(`  ⚠️  ${slot.id}: sin fecha de referencia, saltando`);
                    skipped++;
                    continue;
                }

                const dayOfWeek = getDayOfWeek(refDate);
                const schedule = scheduleByDay[dayOfWeek] ?? null;

                const format = inferFormat(slot.courtIds, courts, combos);
                const newPrice = calculatePriceForSlot(schedule, slot.courtIds, courts, combos, slot.startTime, slot.endTime);
                const oldPrice = slot.priceCOP ?? 0;

                if (newPrice === oldPrice) {
                    skipped++;
                    continue;
                }

                const courtNames = (slot.courtIds ?? []).map((id) => {
                    const c = courts.find((x) => x.id === id);
                    return c?.name ?? id;
                });
                const formatLabel = format ?? `suma sencillas (${courtNames.length} canchas)`;

                console.log(
                    `  🔄 ${slot.clientName ?? slot.id} | ${slot.startTime}–${slot.endTime} | ` +
                    `[${courtNames.join(", ")}] | formato: ${formatLabel} | ` +
                    `$${oldPrice.toLocaleString()} → $${newPrice.toLocaleString()}`,
                );

                if (!DRY_RUN) {
                    await db
                        .collection("venues").doc(venueId)
                        .collection("blocked_slots").doc(slot.id)
                        .update({ priceCOP: newPrice, updatedAt: new Date().toISOString() });
                }

                updated++;
            } catch (err) {
                console.error(`  ❌ ${slot.id}:`, err.message);
                errors++;
            }
        }
    }

    console.log(`\n── Resumen ──────────────────────────────`);
    console.log(`Total slots revisados : ${totalSlots}`);
    console.log(`Actualizados          : ${updated}`);
    console.log(`Sin cambios           : ${skipped}`);
    console.log(`Errores               : ${errors}`);
    if (DRY_RUN) console.log(`\n⚠️  Dry run — ejecuta sin --dry-run para aplicar los cambios`);
}

main().catch((err) => {
    console.error("Error fatal:", err);
    process.exit(1);
});
