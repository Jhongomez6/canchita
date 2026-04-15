/**
 * ========================
 * WALLET CLIENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/WALLET_SDD.md
 *
 * Operaciones de lectura y suscripción del wallet desde el cliente.
 * Las escrituras se hacen exclusivamente via Firebase Functions (onCall).
 */

import {
    doc,
    getDoc,
    collection,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
    getDocs,
    onSnapshot,
    startAfter,
    type DocumentSnapshot,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";
import { app } from "./firebase";
import type { Wallet, WalletTransaction } from "./domain/wallet";

// ========================
// LECTURAS
// ========================

/**
 * Obtiene el wallet de un usuario. Retorna null si no existe.
 */
export async function getWallet(uid: string): Promise<Wallet | null> {
    const ref = doc(db, "wallets", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as Wallet;
}

/**
 * Obtiene las transacciones del wallet de un usuario, ordenadas por fecha desc.
 */
export async function getWalletTransactions(
    uid: string,
    pageSize: number = 20,
    lastDoc?: DocumentSnapshot
): Promise<{ transactions: WalletTransaction[]; lastDoc: DocumentSnapshot | null }> {
    const txRef = collection(db, "wallet_transactions");

    const q = lastDoc
        ? query(txRef, where("uid", "==", uid), orderBy("createdAt", "desc"), startAfter(lastDoc), firestoreLimit(pageSize))
        : query(txRef, where("uid", "==", uid), orderBy("createdAt", "desc"), firestoreLimit(pageSize));
    const snap = await getDocs(q);

    const transactions = snap.docs.map((d) => d.data() as WalletTransaction);
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { transactions, lastDoc: last };
}

/**
 * Suscripción en tiempo real al wallet del usuario.
 * Retorna función de unsubscribe.
 */
export function subscribeToWallet(
    uid: string,
    callback: (wallet: Wallet | null) => void
): () => void {
    const ref = doc(db, "wallets", uid);
    return onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
            callback(null);
            return;
        }
        callback(snap.data() as Wallet);
    });
}

// ========================
// FIREBASE FUNCTIONS CALLS
// ========================

const functions = getFunctions(app);

/**
 * Inicia una recarga Wompi. Retorna datos para el widget de pago.
 */
export async function initTopup(amountCOP: number) {
    const fn = httpsCallable<
        { amountCOP: number },
        {
            reference: string;
            publicKey: string;
            totalToChargeInCents: number;
            amountCOP: number;
            fee: number;
            signature: string;
            redirectUrl: string;
            txId: string;
        }
    >(functions, "initTopup");
    const result = await fn({ amountCOP });
    return result.data;
}

/**
 * Unirse a un partido con depósito.
 */
export async function joinWithDeposit(matchId: string) {
    const fn = httpsCallable<{ matchId: string }, { success: boolean }>(
        functions,
        "joinWithDeposit"
    );
    const result = await fn({ matchId });
    return result.data;
}

/**
 * Salirse de un partido con posible reembolso.
 */
export async function leaveWithRefund(matchId: string) {
    const fn = httpsCallable<
        { matchId: string },
        { refunded: boolean; deadline: string | null }
    >(functions, "leaveWithRefund");
    const result = await fn({ matchId });
    return result.data;
}

/**
 * Borrar un partido con reembolso a todos los jugadores.
 */
export async function deleteMatchWithRefunds(matchId: string) {
    const fn = httpsCallable<{ matchId: string }, { refundedCount: number }>(
        functions,
        "deleteMatchWithRefunds"
    );
    const result = await fn({ matchId });
    return result.data;
}

/**
 * Canjear un código de recarga físico.
 */
export async function redeemCode(code: string) {
    const fn = httpsCallable<
        { code: string },
        { amountCOP: number; newBalanceCOP: number }
    >(functions, "redeemCode");
    const result = await fn({ code });
    return result.data;
}

/**
 * Admin elimina un jugador de un partido con depósito — siempre reembolsa.
 */
export async function adminRemovePlayer(matchId: string, playerName: string) {
    const fn = httpsCallable<
        { matchId: string; playerName: string },
        { refunded: boolean }
    >(functions, "adminRemovePlayer");
    const result = await fn({ matchId, playerName });
    return result.data;
}

/**
 * Admin acepta un suplente al partido — actualiza Firestore y notifica al jugador.
 */
export async function confirmFromWaitlist(matchId: string, playerName: string) {
    const fn = httpsCallable<
        { matchId: string; playerName: string },
        { success: boolean }
    >(functions, "confirmFromWaitlist");
    const result = await fn({ matchId, playerName });
    return result.data;
}

/**
 * Generar códigos de recarga (solo super_admin).
 */
export async function generateTopupCodes(count: number, amountCOP: number) {
    const fn = httpsCallable<
        { count: number; amountCOP: number },
        { batchId: string; count: number; amountCOP: number; codes: string[] }
    >(functions, "generateCodes");
    const result = await fn({ count, amountCOP });
    return result.data;
}
