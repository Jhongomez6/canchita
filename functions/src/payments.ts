/**
 * ========================
 * PAYMENT FUNCTIONS
 * ========================
 *
 * Firebase Functions para pagos: recargas Wompi, join/leave con depósito,
 * y borrado de partido con reembolso.
 *
 * Ref: docs/WALLET_SDD.md
 */

import * as admin from "firebase-admin";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { randomBytes, createHash } from "crypto";

const db = admin.firestore();

// ========================
// CONSTANTES
// ========================

const MIN_TOPUP_COP = 20000;
const MAX_TOPUP_COP = 500000;
const TOPUP_STEP_COP = 10000;
const MAX_PENDING_TOPUPS = 3;
const PENDING_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas
const REFUND_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 horas
const VALID_DEPOSITS_COP = [500000, 1000000];

// ========================
// HELPERS
// ========================

function nowISO(): string {
    return new Date().toISOString();
}

function calcWompiFee(amountCOP: number): { fee: number; total: number } {
    // Gross-up: Wompi cobra su comisión sobre el total cobrado, no sobre el monto base.
    // Usando aritmética entera para evitar errores de punto flotante:
    //   833     = 700 × 1.19          (fijo exacto)
    //   968_465 = (1 − 0.0265×1.19) × 1_000_000  (exacto)
    // total = ceil((amountCOP + 833) × 1_000_000 / 968_465)
    const total = Math.ceil((amountCOP + 833) * 1_000_000 / 968_465);
    const fee = total - amountCOP;
    return { fee, total };
}

async function isAdmin(uid: string): Promise<boolean> {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return false;
    const data = userDoc.data()!;
    return data.role === "admin" || (Array.isArray(data.roles) && data.roles.includes("admin"));
}

// ========================
// initTopup — onCall
// ========================

export const initTopup = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const amountCOP = request.data.amountCOP as number;

        // Validar monto (viene en pesos COP del frontend)
        if (
            !amountCOP ||
            typeof amountCOP !== "number" ||
            amountCOP < MIN_TOPUP_COP ||
            amountCOP > MAX_TOPUP_COP ||
            amountCOP % TOPUP_STEP_COP !== 0
        ) {
            throw new HttpsError(
                "invalid-argument",
                `El monto debe ser entre $${MIN_TOPUP_COP / 1000}k y $${MAX_TOPUP_COP / 1000}k en múltiplos de $${TOPUP_STEP_COP / 1000}k`
            );
        }

        // Rate limit: max 3 pending
        const pendingSnap = await db
            .collection("wallet_transactions")
            .where("uid", "==", uid)
            .where("type", "==", "topup_wompi")
            .where("status", "==", "pending")
            .count()
            .get();

        if (pendingSnap.data().count >= MAX_PENDING_TOPUPS) {
            throw new HttpsError(
                "resource-exhausted",
                "Tienes demasiadas recargas pendientes. Espera a que se procesen."
            );
        }

        // Generar referencia única
        const reference = `topup_${uid}_${Date.now()}_${randomBytes(4).toString("hex")}`;

        // Calcular comisión y total a cobrar
        const { fee, total: totalToCharge } = calcWompiFee(amountCOP);
        const totalToChargeInCents = totalToCharge * 100;

        // Crear transacción pending
        const now = nowISO();
        const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
        const txRef = db.collection("wallet_transactions").doc();

        await txRef.set({
            id: txRef.id,
            uid,
            type: "topup_wompi",
            status: "pending",
            amountCOP: amountCOP * 100, // guardar en centavos
            balanceAfterCOP: 0, // se actualiza al completar
            description: `Recarga Wompi $${amountCOP.toLocaleString("es-CO")}`,
            wompiReference: reference,
            expiresAt,
            createdAt: now,
        });

        // Calcular firma Wompi
        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
        if (!integritySecret) {
            throw new HttpsError("internal", "Configuración de pagos incompleta");
        }

        const signaturePayload = `${reference}${totalToChargeInCents}COP${integritySecret}`;
        const signature = createHash("sha256").update(signaturePayload).digest("hex");

        const publicKey = process.env.WOMPI_PUBLIC_KEY;

        return {
            reference,
            publicKey,
            totalToChargeInCents,
            amountCOP,
            fee,
            signature,
            redirectUrl: `${process.env.APP_URL ?? "https://lacanchita.app"}/wallet?topup=pending`,
            txId: txRef.id,
        };
    }
);

// ========================
// wompiWebhook — onRequest (público)
// ========================

export const wompiWebhook = onRequest(
    { maxInstances: 10 },
    async (req, res) => {
        if (req.method !== "POST") {
            res.status(405).send("Method not allowed");
            return;
        }

        const event = req.body;
        if (!event?.data?.transaction) {
            res.status(400).send("Missing transaction data");
            return;
        }

        const tx = event.data.transaction;
        const checksum = event.signature?.checksum;

        // Verificar firma
        const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
        if (!eventsSecret) {
            console.error("WOMPI_EVENTS_SECRET not configured");
            res.status(500).send("Server misconfigured");
            return;
        }

        // Verificar firma leyendo dinámicamente las propiedades que Wompi indica
        const properties: string[] = event.signature?.properties ?? [];
        const timestamp: number = event.timestamp;

        // Extraer valores de event.data según cada propiedad (ej: "transaction.id" → event.data.transaction.id)
        const payloadValues = properties.map((prop: string) => {
            const parts = prop.split(".");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let val: any = event.data;
            for (const part of parts) {
                val = val?.[part];
            }
            return String(val ?? "");
        });

        const sigPayload = [...payloadValues, String(timestamp), eventsSecret].join("");
        const expectedHash = createHash("sha256").update(sigPayload).digest("hex");

        console.log("Webhook signature check", {
            properties,
            payloadValues,
            timestamp,
            expectedHash,
            receivedChecksum: checksum,
        });

        if (expectedHash !== checksum) {
            console.warn("Invalid webhook signature", { expected: expectedHash, got: checksum });
            res.status(401).send("Invalid signature");
            return;
        }

        // Solo procesar APPROVED
        if (tx.status !== "APPROVED") {
            // Marcar como failed si corresponde
            if (tx.status === "DECLINED" || tx.status === "ERROR" || tx.status === "VOIDED") {
                const failedSnap = await db
                    .collection("wallet_transactions")
                    .where("wompiReference", "==", tx.reference)
                    .where("status", "==", "pending")
                    .limit(1)
                    .get();

                if (!failedSnap.empty) {
                    await failedSnap.docs[0].ref.update({
                        status: "failed",
                        wompiTransactionId: tx.id,
                        updatedAt: nowISO(),
                    });
                }
            }
            res.status(200).send("OK");
            return;
        }

        // Idempotencia: verificar si ya procesado
        const existingSnap = await db
            .collection("wallet_transactions")
            .where("wompiTransactionId", "==", tx.id)
            .limit(1)
            .get();

        if (!existingSnap.empty && existingSnap.docs[0].data().status === "completed") {
            res.status(200).send("Already processed");
            return;
        }

        // Buscar tx pending por reference
        const pendingSnap = await db
            .collection("wallet_transactions")
            .where("wompiReference", "==", tx.reference)
            .where("status", "==", "pending")
            .limit(1)
            .get();

        if (pendingSnap.empty) {
            // Webhook llegó antes que el doc se creara — Wompi reintentará
            console.warn("No pending tx found for reference", tx.reference);
            res.status(200).send("OK — will retry");
            return;
        }

        const txDoc = pendingSnap.docs[0];
        const txData = txDoc.data();
        const uid = txData.uid;
        const amountCentavos = txData.amountCOP; // ya en centavos

        // Acreditar wallet atómicamente
        const walletRef = db.collection("wallets").doc(uid);
        const now = nowISO();

        await db.runTransaction(async (transaction) => {
            const walletSnap = await transaction.get(walletRef);
            let currentBalance = 0;

            if (walletSnap.exists) {
                currentBalance = walletSnap.data()!.balanceCOP || 0;
            }

            const newBalance = currentBalance + amountCentavos;

            if (walletSnap.exists) {
                transaction.update(walletRef, {
                    balanceCOP: newBalance,
                    updatedAt: now,
                });
            } else {
                transaction.set(walletRef, {
                    uid,
                    balanceCOP: newBalance,
                    updatedAt: now,
                    createdAt: now,
                });
            }

            transaction.update(txDoc.ref, {
                status: "completed",
                wompiTransactionId: tx.id,
                balanceAfterCOP: newBalance,
                paymentMethod: tx.payment_method_type ?? null,
                totalChargedCents: tx.amount_in_cents ?? null,
                finalizedAt: tx.finalized_at ?? null,
                updatedAt: now,
            });
        });

        // Notificación in-app
        const amountLabel = new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amountCentavos / 100);

        await db
            .collection("notifications")
            .doc(uid)
            .collection("items")
            .add({
                title: "✅ Recarga exitosa",
                body: `${amountLabel} acreditados en tu billetera`,
                type: "wallet_topup",
                url: "/wallet",
                read: false,
                createdAt: now,
                expireAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
                ),
            });

        console.log(`Topup completed: ${uid} +${amountCentavos} centavos`);
        res.status(200).send("OK");
    }
);

// ========================
// joinWithDeposit — onCall
// ========================

export const joinWithDeposit = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const matchId = request.data.matchId as string;

        if (!matchId) {
            throw new HttpsError("invalid-argument", "matchId es requerido");
        }

        // Leer match fuera de tx para validación inicial
        const matchRef = db.collection("matches").doc(matchId);
        const matchSnap = await matchRef.get();

        if (!matchSnap.exists) {
            throw new HttpsError("not-found", "El partido no existe");
        }

        const matchData = matchSnap.data()!;

        if (matchData.status !== "open") {
            throw new HttpsError("failed-precondition", "El partido no está abierto");
        }

        const deposit = matchData.deposit;
        if (!deposit || !VALID_DEPOSITS_COP.includes(deposit)) {
            throw new HttpsError("failed-precondition", "El partido no tiene depósito válido configurado");
        }

        const locationId: string = matchData.locationId ?? null;

        // Leer perfil del usuario (fuera de tx — no compite)
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "Usuario no encontrado");
        }
        const userProfile = userSnap.data()!;

        const walletRef = db.collection("wallets").doc(uid);
        const txRef = db.collection("wallet_transactions").doc();
        const now = nowISO();

        await db.runTransaction(async (transaction) => {
            // Leer wallet
            const walletSnap = await transaction.get(walletRef);
            const balance = walletSnap.exists ? walletSnap.data()!.balanceCOP || 0 : 0;

            if (balance < deposit) {
                throw new HttpsError("failed-precondition", "Saldo insuficiente en tu billetera");
            }

            // Leer match fresco dentro de tx
            const freshMatchSnap = await transaction.get(matchRef);
            const freshMatch = freshMatchSnap.data()!;
            const players = freshMatch.players || [];
            const playerUids: string[] = freshMatch.playerUids || [];
            const guests = freshMatch.guests || [];
            const maxPlayers = freshMatch.maxPlayers;

            // Validar no duplicado — uid en playerUids con confirmed:true = ya está activo
            const existingIdx = players.findIndex((p: { uid: string }) => p.uid === uid);
            const existingConfirmed = existingIdx >= 0 && players[existingIdx].confirmed !== false;
            if (playerUids.includes(uid) && existingConfirmed) {
                throw new HttpsError("already-exists", "Ya estás en este partido");
            }

            // Validar no lleno
            const confirmedCount = players.filter((p: { confirmed: boolean }) => p.confirmed).length;
            const guestCount = guests.length;
            if (confirmedCount + guestCount >= maxPlayers) {
                throw new HttpsError("resource-exhausted", "El partido está lleno");
            }

            // Construir player con todos los campos requeridos (CLAUDE.md §2)
            const playerData = {
                uid,
                name: userProfile.name || "Jugador",
                level: userProfile.level || 2,
                positions: userProfile.positions || [],
                primaryPosition: userProfile.primaryPosition || null,
                photoURL: userProfile.photoURL || null,
                photoURLThumb: userProfile.photoURLThumb || null,
                confirmed: true,
                joinedAt: now,
                depositPaid: true,  // indica que este jugador pagó depósito
            };

            // Si canceló antes (confirmed:false), actualizar el registro existente; si no, agregar
            const updatedPlayers = existingIdx >= 0
                ? players.map((p: { uid: string }, i: number) => i === existingIdx ? playerData : p)
                : [...players, playerData];

            // Si el uid ya estaba en playerUids (dato viejo), no duplicar
            const updatedPlayerUids = playerUids.includes(uid)
                ? playerUids
                : [...playerUids, uid];

            // Actualizar match
            transaction.update(matchRef, {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            });

            // Debitar wallet
            const newBalance = balance - deposit;
            if (walletSnap.exists) {
                transaction.update(walletRef, {
                    balanceCOP: newBalance,
                    updatedAt: now,
                });
            } else {
                transaction.set(walletRef, {
                    uid,
                    balanceCOP: newBalance,
                    updatedAt: now,
                    createdAt: now,
                });
            }

            // Crear transacción de débito
            transaction.set(txRef, {
                id: txRef.id,
                uid,
                type: "deposit_debit",
                status: "completed",
                amountCOP: -deposit,
                balanceAfterCOP: newBalance,
                description: `Depósito partido`,
                matchId,
                locationId,
                createdAt: now,
            });
        });

        return { success: true };
    }
);

// ========================
// leaveWithRefund — onCall
// ========================

export const leaveWithRefund = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const matchId = request.data.matchId as string;

        if (!matchId) {
            throw new HttpsError("invalid-argument", "matchId es requerido");
        }

        const matchRef = db.collection("matches").doc(matchId);
        const walletRef = db.collection("wallets").doc(uid);
        const now = nowISO();
        let refunded = false;
        let deadline: string | null = null;

        await db.runTransaction(async (transaction) => {
            // ── READS PRIMERO ──
            const matchSnap = await transaction.get(matchRef);
            if (!matchSnap.exists) {
                throw new HttpsError("not-found", "El partido no existe");
            }
            const walletSnap = await transaction.get(walletRef);

            // ── LÓGICA ──
            const matchData = matchSnap.data()!;
            const players: Array<{ uid: string; [key: string]: unknown }> = matchData.players || [];
            const playerUids: string[] = matchData.playerUids || [];
            const deposit = matchData.deposit || 0;
            const locationId: string = matchData.locationId ?? null;

            if (!playerUids.includes(uid)) {
                throw new HttpsError("not-found", "No estás inscrito en este partido");
            }

            // Marcar como cancelado (visible para admin) y quitar de playerUids para liberar el cupo
            const updatedPlayers = players.map((p) =>
                p.uid === uid ? { ...p, confirmed: false, depositPaid: false, cancelledAt: now } : p
            );
            const updatedPlayerUids = playerUids.filter((id) => id !== uid);

            const updates: Record<string, unknown> = {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            };

            if (matchData.teams) {
                const teamsA: Array<{ uid: string }> = matchData.teams.A || [];
                const teamsB: Array<{ uid: string }> = matchData.teams.B || [];
                updates["teams.A"] = teamsA.filter((p) => p.uid !== uid);
                updates["teams.B"] = teamsB.filter((p) => p.uid !== uid);
            }

            // ── WRITES ──
            transaction.update(matchRef, updates);

            if (deposit > 0) {
                const startsAt = matchData.startsAt;
                let isRefundable = true;

                if (startsAt) {
                    const matchMs = startsAt.seconds * 1000;
                    const deadlineMs = matchMs - REFUND_DEADLINE_MS;
                    deadline = new Date(deadlineMs).toISOString();
                    isRefundable = Date.now() < deadlineMs;
                }

                if (isRefundable) {
                    const balance = walletSnap.exists ? walletSnap.data()!.balanceCOP || 0 : 0;
                    const newBalance = balance + deposit;

                    if (walletSnap.exists) {
                        transaction.update(walletRef, { balanceCOP: newBalance, updatedAt: now });
                    } else {
                        transaction.set(walletRef, { uid, balanceCOP: newBalance, updatedAt: now, createdAt: now });
                    }

                    const txRef = db.collection("wallet_transactions").doc();
                    transaction.set(txRef, {
                        id: txRef.id,
                        uid,
                        type: "deposit_refund",
                        status: "completed",
                        amountCOP: +deposit,
                        balanceAfterCOP: newBalance,
                        description: "Reembolso depósito partido",
                        matchId,
                        locationId,
                        createdAt: now,
                    });

                    refunded = true;
                }
            }
        });

        return { refunded, deadline };
    }
);

// ========================
// adminRemovePlayer — onCall
// ========================

export const adminRemovePlayer = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const callerUid = request.auth.uid;
        const matchId = request.data.matchId as string;
        const playerName = request.data.playerName as string;

        if (!matchId || !playerName) {
            throw new HttpsError("invalid-argument", "matchId y playerName son requeridos");
        }

        // Verificar que el llamante es admin
        const isAdminUser = await isAdmin(callerUid);
        if (!isAdminUser) {
            throw new HttpsError("permission-denied", "Solo admins pueden eliminar jugadores");
        }

        const matchRef = db.collection("matches").doc(matchId);
        const matchSnap = await matchRef.get();

        if (!matchSnap.exists) {
            throw new HttpsError("not-found", "El partido no existe");
        }

        const matchData = matchSnap.data()!;
        const deposit = matchData.deposit || 0;
        const locationId: string = matchData.locationId ?? null;
        const players: Array<{ uid?: string; name: string; [key: string]: unknown }> = matchData.players || [];

        const removedPlayer = players.find((p) => p.name === playerName);
        if (!removedPlayer) {
            throw new HttpsError("not-found", "Jugador no encontrado en el partido");
        }

        const playerUid = removedPlayer.uid;
        const shouldRefund = deposit > 0 && !!removedPlayer.depositPaid;
        const now = nowISO();

        // Nombre del partido para la notificación
        const matchLabel = matchData.locationSnapshot?.name
            ? `${matchData.locationSnapshot.name}`
            : "el partido";

        await db.runTransaction(async (transaction) => {
            // ── READS PRIMERO (Firestore exige reads antes de writes) ──
            const freshSnap = await transaction.get(matchRef);
            const freshData = freshSnap.data()!;

            const walletRef = shouldRefund && playerUid
                ? db.collection("wallets").doc(playerUid)
                : null;
            const walletSnap = walletRef ? await transaction.get(walletRef) : null;

            // ── WRITES ──
            const freshPlayers: Array<{ uid?: string; name: string }> = freshData.players || [];
            const freshPlayerUids: string[] = freshData.playerUids || [];

            const updatedPlayers = freshPlayers.filter((p) => p.name !== playerName);
            const updatedPlayerUids = playerUid
                ? freshPlayerUids.filter((uid) => uid !== playerUid)
                : freshPlayerUids;

            const matchUpdates: Record<string, unknown> = {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            };

            if (freshData.teams) {
                const teamsA: Array<{ uid?: string }> = freshData.teams.A || [];
                const teamsB: Array<{ uid?: string }> = freshData.teams.B || [];
                matchUpdates["teams.A"] = teamsA.filter((p) => p.uid !== playerUid);
                matchUpdates["teams.B"] = teamsB.filter((p) => p.uid !== playerUid);
            }

            transaction.update(matchRef, matchUpdates);

            if (shouldRefund && playerUid && walletRef && walletSnap) {
                const balance = walletSnap.exists ? walletSnap.data()!.balanceCOP || 0 : 0;
                const newBalance = balance + deposit;

                if (walletSnap.exists) {
                    transaction.update(walletRef, { balanceCOP: newBalance, updatedAt: now });
                } else {
                    transaction.set(walletRef, { uid: playerUid, balanceCOP: newBalance, updatedAt: now, createdAt: now });
                }

                const txRef = db.collection("wallet_transactions").doc();
                transaction.set(txRef, {
                    id: txRef.id,
                    uid: playerUid,
                    type: "deposit_refund",
                    status: "completed",
                    amountCOP: +deposit,
                    balanceAfterCOP: newBalance,
                    description: "Reembolso por retiro del organizador",
                    matchId,
                    locationId,
                    createdAt: now,
                });
            }
        });

        // Notificación in-app al jugador (fuera de la tx — best effort)
        if (playerUid) {
            const amountLabel = new Intl.NumberFormat("es-CO", {
                style: "currency", currency: "COP",
                minimumFractionDigits: 0, maximumFractionDigits: 0,
            }).format(deposit / 100);

            const body = shouldRefund
                ? `El organizador te retiró de ${matchLabel}. Tu depósito de ${amountLabel} fue devuelto a tu billetera.`
                : `El organizador te retiró de ${matchLabel}.`;

            await db.collection("notifications").doc(playerUid).collection("items").add({
                title: "Te retiraron del partido",
                body,
                type: "player_removed",
                url: shouldRefund ? "/wallet" : `/join/${matchId}`,
                read: false,
                createdAt: now,
                expireAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                ),
            });
        }

        return { refunded: shouldRefund && !!playerUid };
    }
);

// ========================
// deleteMatchWithRefunds — onCall
// ========================

export const deleteMatchWithRefunds = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const matchId = request.data.matchId as string;

        if (!matchId) {
            throw new HttpsError("invalid-argument", "matchId es requerido");
        }

        // Verificar permisos
        const isAdminUser = await isAdmin(uid);
        if (!isAdminUser) {
            throw new HttpsError("permission-denied", "Solo admins pueden borrar partidos");
        }

        const matchRef = db.collection("matches").doc(matchId);
        const matchSnap = await matchRef.get();

        if (!matchSnap.exists) {
            throw new HttpsError("not-found", "El partido no existe");
        }

        const matchData = matchSnap.data()!;

        // Verificar que el llamante es admin del partido
        if (matchData.createdBy !== uid) {
            // Verificar si es super_admin
            const userDoc = await db.collection("users").doc(uid).get();
            const userData = userDoc.data();
            if (!userData || userData.adminType !== "super_admin") {
                throw new HttpsError("permission-denied", "Solo el creador o super_admin puede borrar este partido");
            }
        }

        const deposit = matchData.deposit || 0;
        const locationId: string = matchData.locationId ?? null;
        const players: Array<{ uid?: string; confirmed?: boolean; depositPaid?: boolean }> = matchData.players || [];
        const matchLabel = matchData.locationSnapshot?.name || "el partido";
        const now = nowISO();
        let refundedCount = 0;

        // Solo jugadores confirmados con depositPaid
        const refundablePlayers = players.filter((p) => p.uid && p.confirmed && p.depositPaid);
        // Todos los jugadores con uid (confirmados + waitlist) merecen notificación
        const notifiablePlayers = players.filter((p) => p.uid);

        if (deposit > 0 && refundablePlayers.length > 0) {
            // Obtener uids que ya tienen match_refund para idempotencia
            const existingRefunds = await db
                .collection("wallet_transactions")
                .where("matchId", "==", matchId)
                .where("type", "==", "match_refund")
                .where("status", "==", "completed")
                .get();

            const alreadyRefundedUids = new Set(existingRefunds.docs.map((d) => d.data().uid));

            const toRefund = refundablePlayers
                .map((p) => p.uid!)
                .filter((pUid) => !alreadyRefundedUids.has(pUid));

            for (const playerUid of toRefund) {
                const walletRef = db.collection("wallets").doc(playerUid);
                const txRef = db.collection("wallet_transactions").doc();

                await db.runTransaction(async (transaction) => {
                    const walletSnap = await transaction.get(walletRef);
                    const balance = walletSnap.exists ? walletSnap.data()!.balanceCOP || 0 : 0;
                    const newBalance = balance + deposit;

                    if (walletSnap.exists) {
                        transaction.update(walletRef, { balanceCOP: newBalance, updatedAt: now });
                    } else {
                        transaction.set(walletRef, { uid: playerUid, balanceCOP: newBalance, updatedAt: now, createdAt: now });
                    }

                    transaction.set(txRef, {
                        id: txRef.id,
                        uid: playerUid,
                        type: "match_refund",
                        status: "completed",
                        amountCOP: +deposit,
                        balanceAfterCOP: newBalance,
                        description: "Reembolso por cancelación de partido",
                        matchId,
                        locationId,
                        createdAt: now,
                    });
                });

                refundedCount++;
            }
        }

        // Borrar el partido
        await matchRef.delete();

        // Notificaciones in-app a todos los jugadores confirmados (best effort)
        const refundedUids = new Set(refundablePlayers.map((p) => p.uid!));
        const amountLabel = new Intl.NumberFormat("es-CO", {
            style: "currency", currency: "COP",
            minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(deposit / 100);
        const expireAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

        await Promise.all(
            notifiablePlayers.map((p) => {
                const hasRefund = refundedUids.has(p.uid!);
                const body = hasRefund
                    ? `El partido en ${matchLabel} fue cancelado. Tu depósito de ${amountLabel} fue reembolsado a tu billetera.`
                    : `El partido en ${matchLabel} fue cancelado por el organizador.`;
                return db.collection("notifications").doc(p.uid!).collection("items").add({
                    title: "Partido cancelado",
                    body,
                    type: "match_deleted",
                    url: hasRefund ? "/wallet" : "/",
                    read: false,
                    createdAt: now,
                    expireAt,
                });
            })
        );

        return { refundedCount };
    }
);
