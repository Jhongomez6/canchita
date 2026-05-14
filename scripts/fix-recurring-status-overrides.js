/**
 * One-time migration: corrige BlockedSlots recurrentes cuyo `status` fue
 * modificado a nivel del padre (afectando todas las instancias) antes del fix
 * que introdujo `statusOverrides`.
 *
 * Estrategia:
 *   1. Busca todos los BlockedSlots con `recurrence` y `status !== "pending"`.
 *   2. Calcula cada instancia pasada (startDate → ayer) que aplica según la
 *      recurrencia y no está en `exceptDates`.
 *   3. Escribe `statusOverrides[fecha] = status_actual` para preservar el
 *      historial de esas instancias.
 *   4. Resetea `status = "pending"` en el padre → instancias futuras arrancan
 *      limpias y serán controladas con overrides individuales.
 *
 * Run:          node scripts/fix-recurring-status-overrides.js
 * Dry run:      node scripts/fix-recurring-status-overrides.js --dry-run
 */

const admin = require("firebase-admin");
const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

// ── helpers de dominio (replicados de lib/domain/blocked-slots.ts) ────────────

function parseLocalDate(dateStr) {
    return new Date(dateStr + "T12:00:00");
}

function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function daysBetween(from, to) {
    const a = parseLocalDate(from).getTime();
    const b = parseLocalDate(to).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function doesRecurrenceApplyToDate(recurrence, exceptDates, date) {
    if (date < recurrence.startDate) return false;
    if (recurrence.endDate && date > recurrence.endDate) return false;
    if (exceptDates?.includes(date)) return false;

    const start = parseLocalDate(recurrence.startDate);
    const target = parseLocalDate(date);

    switch (recurrence.type) {
        case "daily":
            return true;
        case "weekly":
            return start.getDay() === target.getDay();
        case "biweekly": {
            if (start.getDay() !== target.getDay()) return false;
            const diffDays = daysBetween(recurrence.startDate, date);
            return diffDays % 14 === 0;
        }
        case "monthly": {
            const startDay = start.getDate();
            if (startDay > 28) return false;
            return target.getDate() === startDay;
        }
    }
    return false;
}

/** Devuelve todas las fechas pasadas (startDate → yesterday) donde aplica la recurrencia. */
function pastInstanceDates(slot, today) {
    const { recurrence, exceptDates } = slot;
    if (!recurrence) return [];

    const dates = [];
    const start = parseLocalDate(recurrence.startDate);
    const end = parseLocalDate(today); // exclusive (no incluimos today)

    const cursor = new Date(start);
    while (cursor < end) {
        const iso = toISODate(cursor);
        if (doesRecurrenceApplyToDate(recurrence, exceptDates, iso)) {
            dates.push(iso);
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    const today = toISODate(new Date());
    console.log(`Modo: ${DRY_RUN ? "DRY RUN (sin escrituras)" : "REAL"}`);
    console.log(`Fecha de corte (ayer): ${today}\n`);

    const venuesSnap = await db.collection("venues").get();
    let totalFixed = 0;
    let totalSkipped = 0;

    for (const venueDoc of venuesSnap.docs) {
        const venueId = venueDoc.id;
        const slotsSnap = await db
            .collection("venues")
            .doc(venueId)
            .collection("blocked_slots")
            .where("recurrence", "!=", null)
            .get();

        for (const slotDoc of slotsSnap.docs) {
            const slot = { id: slotDoc.id, ...slotDoc.data() };

            // Solo procesar los que tienen status modificado (no "pending" ni undefined)
            const status = slot.status ?? "pending";
            if (status === "pending") {
                totalSkipped++;
                continue;
            }

            const pastDates = pastInstanceDates(slot, today);
            if (pastDates.length === 0) {
                totalSkipped++;
                continue;
            }

            // Construir los overrides: solo fechas que aún no tienen override propio
            const existingOverrides = slot.statusOverrides ?? {};
            const newOverrides = { ...existingOverrides };
            let added = 0;
            for (const date of pastDates) {
                if (!(date in newOverrides)) {
                    newOverrides[date] = status;
                    added++;
                }
            }

            console.log(
                `[${venueId}] slot ${slotDoc.id} — status: "${status}" → ` +
                `${added} overrides nuevos (${pastDates.length} instancias pasadas)`,
            );

            if (!DRY_RUN) {
                await slotDoc.ref.update({
                    status: "pending",
                    statusOverrides: newOverrides,
                    updatedAt: new Date().toISOString(),
                });
            }
            totalFixed++;
        }
    }

    console.log(`\nResumen:`);
    console.log(`  Slots corregidos: ${totalFixed}`);
    console.log(`  Slots sin cambio:  ${totalSkipped}`);
    if (DRY_RUN) {
        console.log("\n⚠️  DRY RUN — ningún dato fue modificado.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
