/**
 * ========================
 * CODE GENERATION FUNCTIONS
 * ========================
 *
 * Firebase Functions para generación de códigos de recarga físicos.
 * Solo accesible por super_admin.
 *
 * Ref: docs/WALLET_SDD.md
 */

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomBytes } from "crypto";

const db = admin.firestore();

// Alfabeto sin O, 0, I, L para evitar confusión
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ123456789";

const VALID_CODE_AMOUNTS_COP = [2000000, 5000000]; // centavos: $20k, $50k
const MAX_BATCH_SIZE = 500;

function nowISO(): string {
    return new Date().toISOString();
}

/**
 * Genera un código aleatorio formato XXXX-XXXX
 * Usa crypto.randomBytes para entropía criptográfica.
 */
function generateCode(): string {
    const bytes = randomBytes(8);
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += ALPHABET[bytes[i] % ALPHABET.length];
        if (i === 3) code += "-";
    }
    return code;
}

// ========================
// generateCodes — onCall (super_admin only)
// ========================

export const generateCodes = onCall(
    { maxInstances: 5 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;

        // Verificar super_admin
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) {
            throw new HttpsError("permission-denied", "Usuario no encontrado");
        }
        const userData = userSnap.data()!;
        if (userData.adminType !== "super_admin") {
            throw new HttpsError("permission-denied", "Solo super_admin puede generar códigos");
        }

        const count = request.data.count as number;
        const amountCOP = request.data.amountCOP as number;

        // Validar cantidad
        if (!count || typeof count !== "number" || count < 1 || count > MAX_BATCH_SIZE) {
            throw new HttpsError(
                "invalid-argument",
                `La cantidad debe ser entre 1 y ${MAX_BATCH_SIZE}`
            );
        }

        // Validar denominación (en centavos)
        if (!amountCOP || !VALID_CODE_AMOUNTS_COP.includes(amountCOP)) {
            throw new HttpsError(
                "invalid-argument",
                "Denominación inválida. Opciones: $20.000 o $50.000 COP"
            );
        }

        const now = nowISO();
        const batchId = `batch_${uid}_${Date.now()}`;
        const generatedCodes: string[] = [];

        // Generar códigos únicos (verificando que no existan)
        const codes: string[] = [];
        const maxAttempts = count * 3; // margen para colisiones
        let attempts = 0;

        while (codes.length < count && attempts < maxAttempts) {
            const code = generateCode();
            // Verificar unicidad en Firestore
            const existing = await db.collection("topup_codes").doc(code).get();
            if (!existing.exists) {
                codes.push(code);
            }
            attempts++;
        }

        if (codes.length < count) {
            throw new HttpsError(
                "internal",
                `Solo se pudieron generar ${codes.length} de ${count} códigos. Intenta de nuevo.`
            );
        }

        // Escribir en batches de 500 (límite Firestore writeBatch)
        const BATCH_LIMIT = 500;
        for (let i = 0; i < codes.length; i += BATCH_LIMIT) {
            const chunk = codes.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();

            for (const code of chunk) {
                const ref = db.collection("topup_codes").doc(code);
                batch.set(ref, {
                    code,
                    amountCOP,
                    status: "available",
                    batchId,
                    generatedBy: uid,
                    createdAt: now,
                });
            }

            await batch.commit();
            generatedCodes.push(...chunk);
        }

        return {
            batchId,
            count: generatedCodes.length,
            amountCOP,
            codes: generatedCodes,
        };
    }
);
