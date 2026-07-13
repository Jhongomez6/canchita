/**
 * ========================
 * CLEANUP — borrar availability de fechas pasadas
 * ========================
 *
 * See: docs/RESERVAS_CONCURRENCIA_LEDGER_SDD.md
 *
 * Los docs `availability/{venueId}_{date}` de fechas ya pasadas son inertes (ninguna
 * aprobación/bloqueo lee un día pasado), pero se acumulan (1-2 por sede por día). Este
 * job programado los barre una vez al mes. No toca reservas ni bloqueos ni fechas
 * futuras — solo elimina basura de disponibilidad vencida.
 */

import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = admin.firestore();

export const cleanupPastAvailability = onSchedule(
    // Día 1 de cada mes, 04:00 hora Colombia (bajo tráfico).
    { schedule: "0 4 1 * *", timeZone: "America/Bogota", maxInstances: 1 },
    async () => {
        const todayISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());

        const stale = await db.collection("availability").where("date", "<", todayISO).get();
        if (stale.empty) {
            console.log("[cleanupPastAvailability] Sin docs de fechas pasadas para borrar");
            return;
        }

        const BATCH_LIMIT = 500;
        const docs = stale.docs;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const batch = db.batch();
            for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
                batch.delete(doc.ref);
            }
            await batch.commit();
        }

        console.log(`[cleanupPastAvailability] Borrados ${docs.length} docs de disponibilidad de fechas pasadas`);
    },
);
