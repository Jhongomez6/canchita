/**
 * ========================
 * AVAILABILITY LEDGER — capa Firestore (Admin SDK)
 * ========================
 *
 * See: docs/RESERVAS_CONCURRENCIA_LEDGER_SDD.md
 *
 * Wrapper transaccional sobre el ledger de ocupación `availability/{venueId}_{date}`.
 * La lógica de negocio (solapamiento, asignación) vive en el dominio puro
 * (`./availability`); acá solo está la lectura/escritura contra Firestore dentro de
 * la transacción, que es lo que provee la SERIALIZACIÓN: todo lo que bloquea un slot
 * hace `readLedger` (tx.get) + `saveLedger` (tx.set) sobre el MISMO doc → Firestore
 * ordena las transacciones concurrentes → doble-booking imposible.
 */

import * as admin from "firebase-admin";
import {
    AvailabilityLedger,
    OccupancyEntry,
    availabilityDocId,
    recurringBlockAppliesTo,
} from "./availability";

const db = admin.firestore();
type Tx = FirebaseFirestore.Transaction;
type DocRef = FirebaseFirestore.DocumentReference;

/** Referencia al doc de disponibilidad de una sede-día. */
export function ledgerRef(venueId: string, date: string): DocRef {
    return db.collection("availability").doc(availabilityDocId(venueId, date));
}

export interface LedgerRead {
    ref: DocRef;
    /** null si el doc no existe todavía (día sin ocupación registrada). */
    ledger: AvailabilityLedger | null;
    entries: OccupancyEntry[];
}

/**
 * Lee el ledger DENTRO de la transacción (registra el doc en el read-set → punto de
 * contención). Debe llamarse antes de cualquier `tx.set/update` de la transacción.
 */
export async function readLedger(tx: Tx, venueId: string, date: string): Promise<LedgerRead> {
    const ref = ledgerRef(venueId, date);
    const snap = await tx.get(ref);
    const ledger = snap.exists ? (snap.data() as AvailabilityLedger) : null;
    return { ref, ledger, entries: ledger?.entries ?? [] };
}

/**
 * Escribe el ledger con las `entries` dadas (crea el doc si no existía). `merge:false`
 * a propósito: el doc se reescribe completo desde `entries` calculadas en memoria.
 */
export function saveLedger(
    tx: Tx,
    ref: DocRef,
    venueId: string,
    date: string,
    entries: OccupancyEntry[],
    nowISO: string,
): void {
    const doc: AvailabilityLedger = { venueId, date, entries, updatedAt: nowISO };
    tx.set(ref, doc);
}

/**
 * Bloqueos RECURRENTES aplicables a `date`, expandidos a OccupancyEntry. NO viven en
 * el ledger (§3 del SDD): se leen como plantillas y se pasan a `occupiedCourtIds`.
 * Lectura fuera de la transacción (datos de config, casi estáticos).
 */
export async function loadRecurringBlocksForDate(
    venueId: string,
    date: string,
): Promise<OccupancyEntry[]> {
    const snap = await db
        .collection("venues").doc(venueId).collection("blocked_slots")
        .where("recurrence.type", "in", ["daily", "weekly", "biweekly", "monthly"])
        .get();

    const out: OccupancyEntry[] = [];
    for (const d of snap.docs) {
        const b = d.data();
        if (!b.recurrence) continue;
        const exceptDates: string[] = Array.isArray(b.exceptDates) ? b.exceptDates : [];
        if (!recurringBlockAppliesTo(b.recurrence, date, exceptDates)) continue;
        out.push({
            sourceId: d.id,
            kind: "block",
            courtIds: Array.isArray(b.courtIds) ? b.courtIds : [],
            startTime: b.startTime,
            endTime: b.endTime,
        });
    }
    return out;
}

/**
 * ¿Hay un bloqueo TOTAL (sin canchas específicas) que solape el rango? Un bloqueo con
 * `courtIds` vacío inutiliza todo el horario → ninguna asignación es posible. Los
 * one-off siempre traen canchas (validación de createBlockedSlot); esto cubre
 * recurrentes/legacy con courtIds vacío.
 */
export function hasTotalBlock(
    blocks: OccupancyEntry[],
    range: { startTime: string; endTime: string },
): boolean {
    return blocks.some(
        (b) => b.courtIds.length === 0 && b.startTime < range.endTime && b.endTime > range.startTime,
    );
}
