/**
 * ========================
 * WALLET FUNCTIONS
 * ========================
 *
 * Firebase Functions para operaciones de billetera: canje de códigos.
 *
 * Ref: docs/WALLET_SDD.md §4.6
 */

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hora

function nowISO(): string {
    return new Date().toISOString();
}

// ========================
// redeemCode — onCall
// ========================

export const redeemCode = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const rawCode = request.data.code as string;

        if (!rawCode || typeof rawCode !== "string") {
            throw new HttpsError("invalid-argument", "Código es requerido");
        }

        const code = rawCode.trim().toUpperCase();

        if (!code || code.length < 9) {
            throw new HttpsError("invalid-argument", "Formato de código inválido");
        }

        // Rate limit: verificar intentos fallidos
        const walletRef = db.collection("wallets").doc(uid);
        const walletSnap = await walletRef.get();

        if (walletSnap.exists) {
            const walletData = walletSnap.data()!;
            const failedAttempts = walletData.failedCodeAttempts || 0;
            const resetAt = walletData.failedCodeAttemptsResetAt;

            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                if (resetAt && new Date(resetAt).getTime() > Date.now()) {
                    throw new HttpsError(
                        "resource-exhausted",
                        "Demasiados intentos. Espera antes de intentar de nuevo."
                    );
                }
                // Ventana expiró, se reseteará en la transacción
            }
        }

        const codeRef = db.collection("topup_codes").doc(code);
        const txRef = db.collection("wallet_transactions").doc();
        const now = nowISO();

        let amountCOP = 0;
        let newBalance = 0;

        await db.runTransaction(async (transaction) => {
            const codeSnap = await transaction.get(codeRef);

            if (!codeSnap.exists) {
                // Incrementar intentos fallidos
                const wSnap = await transaction.get(walletRef);
                const currentAttempts = wSnap.exists ? wSnap.data()!.failedCodeAttempts || 0 : 0;
                const resetAt = wSnap.exists ? wSnap.data()!.failedCodeAttemptsResetAt : null;
                const windowExpired = !resetAt || new Date(resetAt).getTime() <= Date.now();
                const newAttempts = windowExpired ? 1 : currentAttempts + 1;
                const newResetAt = windowExpired
                    ? new Date(Date.now() + RATE_LIMIT_WINDOW_MS).toISOString()
                    : resetAt;

                if (wSnap.exists) {
                    transaction.update(walletRef, {
                        failedCodeAttempts: newAttempts,
                        failedCodeAttemptsResetAt: newResetAt,
                        updatedAt: now,
                    });
                } else {
                    transaction.set(walletRef, {
                        uid,
                        balanceCOP: 0,
                        failedCodeAttempts: newAttempts,
                        failedCodeAttemptsResetAt: newResetAt,
                        createdAt: now,
                        updatedAt: now,
                    });
                }

                throw new HttpsError("not-found", "Código no válido");
            }

            const codeData = codeSnap.data()!;

            if (codeData.status !== "available") {
                // Incrementar intentos fallidos
                const wSnap = await transaction.get(walletRef);
                const currentAttempts = wSnap.exists ? wSnap.data()!.failedCodeAttempts || 0 : 0;
                const resetAt = wSnap.exists ? wSnap.data()!.failedCodeAttemptsResetAt : null;
                const windowExpired = !resetAt || new Date(resetAt).getTime() <= Date.now();
                const newAttempts = windowExpired ? 1 : currentAttempts + 1;
                const newResetAt = windowExpired
                    ? new Date(Date.now() + RATE_LIMIT_WINDOW_MS).toISOString()
                    : resetAt;

                if (wSnap.exists) {
                    transaction.update(walletRef, {
                        failedCodeAttempts: newAttempts,
                        failedCodeAttemptsResetAt: newResetAt,
                        updatedAt: now,
                    });
                }

                throw new HttpsError("already-exists", "Este código ya fue canjeado");
            }

            amountCOP = codeData.amountCOP;

            // Leer wallet
            const wSnap = await transaction.get(walletRef);
            const balance = wSnap.exists ? wSnap.data()!.balanceCOP || 0 : 0;
            newBalance = balance + amountCOP;

            // Marcar código como canjeado
            transaction.update(codeRef, {
                status: "redeemed",
                redeemedBy: uid,
                redeemedAt: now,
            });

            // Acreditar wallet y resetear intentos
            if (wSnap.exists) {
                transaction.update(walletRef, {
                    balanceCOP: newBalance,
                    failedCodeAttempts: 0,
                    updatedAt: now,
                });
            } else {
                transaction.set(walletRef, {
                    uid,
                    balanceCOP: newBalance,
                    failedCodeAttempts: 0,
                    createdAt: now,
                    updatedAt: now,
                });
            }

            // Crear transacción
            transaction.set(txRef, {
                id: txRef.id,
                uid,
                type: "topup_code",
                status: "completed",
                amountCOP: +amountCOP,
                balanceAfterCOP: newBalance,
                description: `Canje de código`,
                codeId: code,
                createdAt: now,
            });
        });

        return { amountCOP, newBalanceCOP: newBalance };
    }
);
