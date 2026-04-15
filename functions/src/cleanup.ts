/**
 * ========================
 * CLEANUP FUNCTIONS
 * ========================
 *
 * Scheduled function para limpiar transacciones pending huérfanas.
 *
 * Ref: docs/WALLET_SDD.md §7.2
 */

import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = admin.firestore();

// ========================
// cleanupPendingTx — cada 30 minutos
// ========================

export const cleanupPendingTx = onSchedule(
    { schedule: "every 30 minutes", maxInstances: 1 },
    async () => {
        const now = new Date().toISOString();

        const expired = await db
            .collection("wallet_transactions")
            .where("status", "==", "pending")
            .where("expiresAt", "<=", now)
            .get();

        if (expired.empty) {
            console.log("No expired pending transactions found");
            return;
        }

        // Batch update (máx 500 por batch)
        const BATCH_LIMIT = 500;
        const docs = expired.docs;

        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const chunk = docs.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();

            for (const doc of chunk) {
                batch.update(doc.ref, {
                    status: "expired",
                    updatedAt: now,
                });
            }

            await batch.commit();
        }

        console.log(`Expired ${docs.length} pending transactions`);
    }
);
