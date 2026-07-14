/**
 * ========================
 * MIGRACIÓN — poblar el availability ledger
 * ========================
 *
 * See: docs/RESERVAS_CONCURRENCIA_LEDGER_SDD.md §9 (Migración)
 *
 * One-shot idempotente (super admin): reconstruye `availability/{venueId}_{date}` a
 * partir de las reservas que bloquean slot (deposit_confirmed/confirmed/played) y de
 * los bloqueos manuales one-off, para fechas de hoy en adelante. Los recurrentes NO
 * van al ledger (se consultan como plantillas).
 *
 * DEBE correrse ANTES (o en la misma ventana) que el deploy del código de claim, para
 * que las aprobaciones no asignen cancha sobre reservas existentes que aún no estén
 * en el ledger. Re-ejecutable sin efectos: reescribe cada doc desde cero.
 */

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
    AvailabilityLedger,
    OccupancyEntry,
    availabilityDocId,
    SLOT_BLOCKING_STATUSES,
} from "./availability";

const db = admin.firestore();

export const migrateAvailabilityLedger = onCall(
    { maxInstances: 1, timeoutSeconds: 540 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.data()?.adminType !== "super_admin") {
            throw new HttpsError("permission-denied", "Solo super admin puede correr la migración");
        }

        const todayISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());

        // Acumulador por sede-día.
        const ledgers = new Map<string, { venueId: string; date: string; entries: OccupancyEntry[] }>();
        const add = (venueId: string, date: string, entry: OccupancyEntry) => {
            const key = availabilityDocId(venueId, date);
            let l = ledgers.get(key);
            if (!l) {
                l = { venueId, date, entries: [] };
                ledgers.set(key, l);
            }
            l.entries = l.entries.filter((e) => e.sourceId !== entry.sourceId);
            l.entries.push(entry);
        };

        // ── Reservas que bloquean slot, de hoy en adelante ──
        const blocking = new Set<string>(SLOT_BLOCKING_STATUSES);
        const bookingsSnap = await db.collection("bookings").where("date", ">=", todayISO).get();
        let bookingCount = 0;
        for (const d of bookingsSnap.docs) {
            const b = d.data();
            if (!blocking.has(b.status)) continue;
            if (!b.venueId || !b.date) continue;
            if (!Array.isArray(b.courtIds) || b.courtIds.length === 0) continue;
            add(b.venueId, b.date, {
                sourceId: d.id,
                kind: "booking",
                courtIds: b.courtIds,
                startTime: b.startTime,
                endTime: b.endTime,
            });
            bookingCount++;
        }

        // ── Bloqueos manuales ONE-OFF, de hoy en adelante (recurrentes NO van al ledger) ──
        const blocksSnap = await db.collectionGroup("blocked_slots").get();
        let blockCount = 0;
        for (const d of blocksSnap.docs) {
            const b = d.data();
            if (b.recurrence) continue;
            // Un bloqueo cancelado ya NO ocupa slot: excluirlo. De lo contrario la
            // reconstrucción re-crearía la ocupación fantasma que este fix elimina.
            if (b.status === "cancelled") continue;
            if (!b.date || b.date < todayISO) continue;
            if (!Array.isArray(b.courtIds) || b.courtIds.length === 0) continue;
            const venueId = d.ref.parent.parent?.id;
            if (!venueId) continue;
            add(venueId, b.date, {
                sourceId: d.id,
                kind: "block",
                courtIds: b.courtIds,
                startTime: b.startTime,
                endTime: b.endTime,
            });
            blockCount++;
        }

        // ── Escribir los docs de disponibilidad (batched) ──
        const now = new Date().toISOString();
        let batch = db.batch();
        let ops = 0;
        let ledgerDocs = 0;
        for (const l of ledgers.values()) {
            const ref = db.collection("availability").doc(availabilityDocId(l.venueId, l.date));
            const doc: AvailabilityLedger = {
                venueId: l.venueId,
                date: l.date,
                entries: l.entries,
                updatedAt: now,
            };
            batch.set(ref, doc);
            ops++;
            ledgerDocs++;
            if (ops >= 400) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
            }
        }
        if (ops > 0) await batch.commit();

        return { ok: true, bookingCount, blockCount, ledgerDocs };
    },
);
