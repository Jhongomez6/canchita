/**
 * ========================
 * VENUES CLIENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 *
 * Operaciones de lectura de sedes desde el cliente.
 * Las escrituras de bookings se hacen via Firebase Functions (onCall).
 */

import {
    doc,
    addDoc,
    getDoc,
    setDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    writeBatch,
    updateDoc,
    arrayUnion,
    runTransaction,
    deleteField,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";
import { expandBlockedSlotsForDate } from "./domain/blocked-slots";
import type { Venue, Court, CourtCombo, DaySchedule, DayOfWeek, BlockedSlot, BookingConflict, CreateVenueInput, ManualReservationStatus, ManualReservationPayment } from "./domain/venue";
import { buildPaymentId, validatePaymentAmounts } from "./domain/payments";

// ========================
// VENUES
// ========================

export async function getVenue(venueId: string): Promise<Venue | null> {
    const snap = await getDoc(doc(db, "venues", venueId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Venue;
}

export async function getActiveVenues(): Promise<Venue[]> {
    const q = query(
        collection(db, "venues"),
        where("active", "==", true),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Venue);
}

export function subscribeToVenue(
    venueId: string,
    callback: (venue: Venue | null) => void,
): () => void {
    return onSnapshot(doc(db, "venues", venueId), (snap) => {
        if (!snap.exists()) {
            callback(null);
            return;
        }
        callback({ id: snap.id, ...snap.data() } as Venue);
    });
}

// ========================
// COURTS
// ========================

export async function getVenueCourts(venueId: string): Promise<Court[]> {
    const snap = await getDocs(collection(db, "venues", venueId, "courts"));
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Court)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ========================
// COURT COMBOS
// ========================

export async function getVenueCombos(venueId: string): Promise<CourtCombo[]> {
    const snap = await getDocs(collection(db, "venues", venueId, "court_combos"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CourtCombo);
}

// ========================
// SCHEDULES
// ========================

export async function getVenueSchedule(venueId: string, dayOfWeek: string): Promise<DaySchedule | null> {
    const snap = await getDoc(doc(db, "venues", venueId, "schedules", dayOfWeek));
    if (!snap.exists()) return null;
    return snap.data() as DaySchedule;
}

export async function getVenueFullSchedule(venueId: string): Promise<DaySchedule[]> {
    const snap = await getDocs(collection(db, "venues", venueId, "schedules"));
    return snap.docs.map((d) => d.data() as DaySchedule);
}

// ========================
// BLOCKED SLOTS
// ========================

const functions = getFunctions(app);

function stripPrivateFields(slot: BlockedSlot): BlockedSlot {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { clientName, reason, ...rest } = slot;
    return rest as BlockedSlot;
}

/**
 * Devuelve bloqueos efectivos para una fecha. Hace 2 queries en paralelo
 * (puntuales + recurrentes) y expande recurrencias respetando exceptDates.
 * Por defecto filtra clientName/reason (vista jugador); admins pasan includePrivate=true.
 */
export async function getBlockedSlots(
    venueId: string,
    date: string,
    includePrivate = false,
): Promise<BlockedSlot[]> {
    const col = collection(db, "venues", venueId, "blocked_slots");
    const [oneOffSnap, recurringSnap] = await Promise.all([
        getDocs(query(col, where("date", "==", date))),
        getDocs(query(col, where("recurrence.type", "in", ["daily", "weekly", "biweekly", "monthly"]))),
    ]);

    const oneOffs = oneOffSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedSlot);
    const recurrings = recurringSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedSlot);

    const all = expandBlockedSlotsForDate([...oneOffs, ...recurrings], date);

    return includePrivate ? all : all.map(stripPrivateFields);
}

/**
 * Suscripción reactiva a los bloqueos efectivos de un día (one-off + recurrencias expandidas).
 */
export function subscribeToBlockedSlots(
    venueId: string,
    date: string,
    callback: (slots: BlockedSlot[]) => void,
    includePrivate = false,
): () => void {
    const col = collection(db, "venues", venueId, "blocked_slots");
    const oneOffQ = query(col, where("date", "==", date));
    const recurringQ = query(col, where("recurrence.type", "in", ["daily", "weekly", "biweekly", "monthly"]));

    let oneOffs: BlockedSlot[] = [];
    let recurrings: BlockedSlot[] = [];
    let haveOneOff = false;
    let haveRecurring = false;

    const emit = () => {
        if (!haveOneOff || !haveRecurring) return;
        const all = expandBlockedSlotsForDate([...oneOffs, ...recurrings], date);
        callback(includePrivate ? all : all.map(stripPrivateFields));
    };

    const unsub1 = onSnapshot(oneOffQ, (snap) => {
        oneOffs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedSlot);
        haveOneOff = true;
        emit();
    });
    const unsub2 = onSnapshot(recurringQ, (snap) => {
        recurrings = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedSlot);
        haveRecurring = true;
        emit();
    });

    return () => {
        unsub1();
        unsub2();
    };
}

/**
 * Lista TODOS los bloqueos del venue (sin filtrar por fecha).
 * Uso admin — permite renderizar vista semanal con instancias expandidas.
 */
export async function getAllBlockedSlots(venueId: string): Promise<BlockedSlot[]> {
    const snap = await getDocs(collection(db, "venues", venueId, "blocked_slots"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedSlot);
}

// ========================
// CREATE VENUE
// ========================

export async function createVenue(input: CreateVenueInput): Promise<string> {
    const id = `venue_${Date.now()}`;
    const now = new Date().toISOString();
    const venue: Omit<Venue, "id"> = {
        name: input.name.trim(),
        address: input.address.trim(),
        placeId: input.placeId,
        lat: input.lat,
        lng: input.lng,
        createdBy: input.createdBy,
        active: true,
        depositRequired: input.depositRequired,
        depositPercent: input.depositPercent,
        phone: input.phone || undefined,
        description: input.description || undefined,
        imageURL: input.imageURL || undefined,
        icon: input.icon || undefined,
        createdAt: now,
        updatedAt: now,
    };
    await setDoc(doc(db, "venues", id), venue);
    return id;
}

// ========================
// ADMIN WRITE OPERATIONS
// ========================

export async function updateVenueSettings(
    venueId: string,
    data: Partial<Pick<Venue, "depositRequired" | "depositPercent" | "name" | "address" | "phone" | "description" | "active" | "imageURL" | "icon" | "formats">>,
): Promise<void> {
    await updateDoc(doc(db, "venues", venueId), {
        ...data,
        updatedAt: new Date().toISOString(),
    });
}

export async function saveVenueCourts(venueId: string, courts: Court[]): Promise<void> {
    // Delete existing courts and re-write
    const existing = await getDocs(collection(db, "venues", venueId, "courts"));
    const batch = writeBatch(db);

    existing.docs.forEach((d) => batch.delete(d.ref));
    courts.forEach((court) => {
        const ref = doc(db, "venues", venueId, "courts", court.id);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...data } = court;
        batch.set(ref, data);
    });

    await batch.commit();
}

export async function saveVenueCombos(venueId: string, combos: CourtCombo[]): Promise<void> {
    const existing = await getDocs(collection(db, "venues", venueId, "court_combos"));
    const batch = writeBatch(db);

    existing.docs.forEach((d) => batch.delete(d.ref));
    combos.forEach((combo) => {
        const ref = doc(db, "venues", venueId, "court_combos", combo.id);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...data } = combo;
        batch.set(ref, data);
    });

    await batch.commit();
}

export async function saveVenueSchedule(venueId: string, day: DayOfWeek, schedule: DaySchedule): Promise<void> {
    await setDoc(doc(db, "venues", venueId, "schedules", day), schedule);
}

export async function saveVenueFullSchedule(venueId: string, schedules: DaySchedule[]): Promise<void> {
    const batch = writeBatch(db);
    schedules.forEach((sched) => {
        const ref = doc(db, "venues", venueId, "schedules", sched.dayOfWeek);
        batch.set(ref, sched);
    });
    await batch.commit();
}

export interface CreateBlockedSlotInput {
    date: string | null;
    startTime: string;
    endTime: string;
    courtIds: string[];
    reason?: string;
    clientName?: string;
    clientPhone?: string;
    priceCOP?: number;
    status?: BlockedSlot["status"];
    recurrence?: BlockedSlot["recurrence"];
    isMonthly?: boolean;
}

export interface CreateBlockedSlotResult {
    id?: string;
    conflicts?: BookingConflict[];
}

/**
 * Crea un bloqueo (puntual o recurrente) via Cloud Function.
 * Si hay bookings en conflicto y force=false, devuelve la lista sin crear.
 */
export async function createBlockedSlot(
    venueId: string,
    input: CreateBlockedSlotInput,
    force = false,
): Promise<CreateBlockedSlotResult> {
    const fn = httpsCallable<
        { venueId: string; input: CreateBlockedSlotInput; force: boolean },
        CreateBlockedSlotResult
    >(functions, "createBlockedSlot");
    const res = await fn({ venueId, input, force });
    return res.data;
}

export async function removeBlockedSlot(venueId: string, slotId: string): Promise<void> {
    await deleteDoc(doc(db, "venues", venueId, "blocked_slots", slotId));
}

export type CancelManualReservationScope = "non_recurring" | "single" | "future" | "all";

export async function updateManualReservation(
    venueId: string,
    slotId: string,
    updates: { clientName?: string; clientPhone?: string; reason?: string; isMonthly?: boolean },
): Promise<void> {
    const ref = doc(db, "venues", venueId, "blocked_slots", slotId);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
        payload[key] = value === undefined ? deleteField() : value;
    }
    await updateDoc(ref, payload);
}

/**
 * Cancela una reserva manual según el scope:
 * - non_recurring / single: marca el doc (o instancia one-off) como "cancelled" conservando historial.
 * - future: acorta la recurrencia + crea doc one-off cancelado para targetDate.
 * - all: hard delete del doc recurrente (sin historial — pide doble confirmación en UI).
 */
export async function cancelManualReservation(
    venueId: string,
    slot: BlockedSlot,
    reason: string | undefined,
    scope: CancelManualReservationScope,
    targetDate: string,
): Promise<void> {
    const slotsCol = collection(db, "venues", venueId, "blocked_slots");
    const slotRef = doc(slotsCol, slot.id);
    const now = new Date().toISOString();
    const cancelFields = {
        status: "cancelled" as const,
        ...(reason?.trim() ? { cancellationReason: reason.trim() } : {}),
        cancelledAt: now,
        updatedAt: now,
    };

    const paymentRef = doc(db, "venues", venueId, "payments", buildPaymentId(slot.id, targetDate));

    if (scope === "non_recurring") {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(slotRef);
            if (!snap.exists()) throw new Error("La reserva ya no existe");
            tx.update(slotRef, cancelFields);
        });
        // Denormaliza en el payment doc si existe (fire-and-forget, no bloquea)
        updateDoc(paymentRef, { slotStatus: "cancelled" }).catch(() => undefined);
        return;
    }

    if (scope === "all") {
        await deleteDoc(slotRef);
        return;
    }

    // scope === "single" | "future": crear doc one-off cancelado para targetDate
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, recurrence: _rec, exceptDates: _ex, ...slotBase } = slot;
    const oneOffDoc = {
        ...slotBase,
        date: targetDate,
        recurrence: undefined,
        exceptDates: undefined,
        ...cancelFields,
    };
    // Eliminar campos undefined para Firestore
    (Object.keys(oneOffDoc) as (keyof typeof oneOffDoc)[]).forEach((k) => {
        if (oneOffDoc[k] === undefined) delete oneOffDoc[k];
    });

    if (scope === "single") {
        await Promise.all([
            updateDoc(slotRef, { exceptDates: arrayUnion(targetDate), updatedAt: now }),
            addDoc(slotsCol, oneOffDoc),
        ]);
        updateDoc(paymentRef, { slotStatus: "cancelled" }).catch(() => undefined);
        return;
    }

    // scope === "future": acortar recurrencia
    const prev = new Date(targetDate + "T12:00:00");
    prev.setDate(prev.getDate() - 1);
    const endDate = prev.toISOString().slice(0, 10);
    await Promise.all([
        updateDoc(slotRef, { "recurrence.endDate": endDate, updatedAt: now }),
        addDoc(slotsCol, oneOffDoc),
    ]);
    updateDoc(paymentRef, { slotStatus: "cancelled" }).catch(() => undefined);
}

/**
 * Cambia el status de una reserva manual. Cualquier transición es válida (incluye rollback).
 * Usa transacción para atomicidad: si el doc fue eliminado en paralelo, falla con error.
 */
export async function updateManualReservationStatus(
    venueId: string,
    slotId: string,
    newStatus: ManualReservationStatus,
    targetDate?: string,
): Promise<void> {
    const ref = doc(db, "venues", venueId, "blocked_slots", slotId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
            throw new Error("La reserva ya no existe");
        }
        const data = snap.data() as { recurrence?: unknown };
        if (targetDate && data.recurrence) {
            tx.update(ref, {
                [`statusOverrides.${targetDate}`]: newStatus,
                updatedAt: new Date().toISOString(),
            });
        } else {
            tx.update(ref, {
                status: newStatus,
                updatedAt: new Date().toISOString(),
            });
        }
    });
}

export type DeleteBlockedSlotMode = "oneoff" | "instance" | "recurrence";

/**
 * Elimina/termina/cancela una instancia de un BlockedSlot vía Cloud Function.
 * - mode="oneoff": borra el doc (solo bloqueos sin recurrencia).
 * - mode="instance": agrega targetDate a exceptDates (cancela una sola fecha).
 * - mode="recurrence": termina la recurrencia (endDate = targetDate-1, preserva historial).
 */
export async function deleteBlockedSlot(
    venueId: string,
    blockedSlotId: string,
    mode: DeleteBlockedSlotMode,
    targetDate?: string,
): Promise<{ ok: true; mode: DeleteBlockedSlotMode }> {
    const fn = httpsCallable<
        { venueId: string; blockedSlotId: string; mode: DeleteBlockedSlotMode; targetDate?: string },
        { ok: true; mode: DeleteBlockedSlotMode }
    >(functions, "deleteBlockedSlot");
    const res = await fn({ venueId, blockedSlotId, mode, targetDate });
    return res.data;
}

export async function addBlockedSlotException(
    venueId: string,
    slotId: string,
    date: string,
): Promise<void> {
    await updateDoc(doc(db, "venues", venueId, "blocked_slots", slotId), {
        exceptDates: arrayUnion(date),
        updatedAt: new Date().toISOString(),
    });
}

export async function updateBlockedSlot(
    venueId: string,
    slotId: string,
    changes: Partial<Pick<BlockedSlot, "clientName" | "reason" | "courtIds" | "recurrence">>,
): Promise<void> {
    await updateDoc(doc(db, "venues", venueId, "blocked_slots", slotId), {
        ...changes,
        updatedAt: new Date().toISOString(),
    });
}

// ========================
// MANUAL RESERVATION PAYMENTS
// ========================

/**
 * Error que indica que ya existe un pago para el par (reservationId, date).
 * La UI debe capturarlo y abrir el sheet en modo edit con el pago existente.
 */
export class PaymentAlreadyExistsError extends Error {
    public readonly paymentId: string;
    constructor(paymentId: string) {
        super("Ya existe un pago para esta reserva en esta fecha");
        this.name = "PaymentAlreadyExistsError";
        this.paymentId = paymentId;
    }
}

/**
 * Registra un pago para una reserva manual en una fecha concreta.
 * Operación atómica: crea el doc en `payments` y, si el slot es puntual (no recurrente),
 * actualiza su status a "paid". Para recurrentes el doc maestro no se toca — el pago
 * por instancia se deriva de la existencia del payment doc.
 *
 * Falla con `PaymentAlreadyExistsError` si ya hay pago registrado para el mismo
 * par (reservationId, targetDate) — la UI redirecciona a edit.
 */
export async function registerManualReservationPayment(
    venueId: string,
    slot: BlockedSlot,
    targetDate: string,
    cashCOP: number,
    transferCOP: number,
    registeredBy: string,
): Promise<{ id: string }> {
    validatePaymentAmounts(cashCOP, transferCOP);

    const paymentId = buildPaymentId(slot.id, targetDate);
    const slotRef = doc(db, "venues", venueId, "blocked_slots", slot.id);
    const paymentRef = doc(db, "venues", venueId, "payments", paymentId);
    const now = new Date().toISOString();
    const totalCOP = cashCOP + transferCOP;
    const isRecurring = !!slot.recurrence;

    await runTransaction(db, async (tx) => {
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists()) {
            throw new Error("La reserva ya no existe");
        }
        const existing = await tx.get(paymentRef);
        if (existing.exists()) {
            throw new PaymentAlreadyExistsError(paymentId);
        }

        const slotData = slotSnap.data() as Omit<BlockedSlot, "id">;
        const payment: Omit<ManualReservationPayment, "id"> = {
            reservationId: slot.id,
            date: targetDate,
            cashCOP,
            transferCOP,
            totalCOP,
            startTime: slotData.startTime,
            endTime: slotData.endTime,
            courtIds: slotData.courtIds,
            ...(slotData.clientName ? { clientName: slotData.clientName } : {}),
            ...(typeof slotData.priceCOP === "number" ? { priceCOP: slotData.priceCOP } : {}),
            registeredBy,
            registeredAt: now,
        };
        tx.set(paymentRef, payment);

        if (!isRecurring) {
            tx.update(slotRef, { status: "paid", updatedAt: now });
        }
    });

    return { id: paymentId };
}

/**
 * Actualiza los montos de un pago existente. Atómica vía transacción para evitar
 * last-write-wins entre dos admins editando simultáneamente.
 */
export async function updateManualReservationPayment(
    venueId: string,
    paymentId: string,
    cashCOP: number,
    transferCOP: number,
): Promise<void> {
    validatePaymentAmounts(cashCOP, transferCOP);

    const paymentRef = doc(db, "venues", venueId, "payments", paymentId);
    const now = new Date().toISOString();
    const totalCOP = cashCOP + transferCOP;

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(paymentRef);
        if (!snap.exists()) {
            throw new Error("El pago ya no existe");
        }
        tx.update(paymentRef, {
            cashCOP,
            transferCOP,
            totalCOP,
            updatedAt: now,
        });
    });
}

/**
 * Elimina un pago. Si la reserva asociada es puntual y está en `paid`, revierte
 * su status a `played` para que el flujo "Marcar pagado" vuelva a estar disponible.
 * En recurrentes el doc maestro no se toca.
 */
export async function deleteManualReservationPayment(
    venueId: string,
    paymentId: string,
): Promise<void> {
    const paymentRef = doc(db, "venues", venueId, "payments", paymentId);

    await runTransaction(db, async (tx) => {
        const paymentSnap = await tx.get(paymentRef);
        if (!paymentSnap.exists()) {
            // Idempotente: ya estaba borrado.
            return;
        }
        const payment = paymentSnap.data() as Omit<ManualReservationPayment, "id">;
        const slotRef = doc(db, "venues", venueId, "blocked_slots", payment.reservationId);
        const slotSnap = await tx.get(slotRef);

        tx.delete(paymentRef);

        if (slotSnap.exists()) {
            const slot = slotSnap.data() as Omit<BlockedSlot, "id">;
            const isRecurring = !!slot.recurrence;
            if (!isRecurring && slot.status === "paid") {
                tx.update(slotRef, {
                    status: "played",
                    updatedAt: new Date().toISOString(),
                });
            }
        }
    });
}

/**
 * Suscripción reactiva a los pagos de una fecha concreta para un venue.
 * Una sola query: `where("date", "==", date)` sobre `venues/{venueId}/payments`.
 */
export function subscribeDailyPayments(
    venueId: string,
    date: string,
    callback: (payments: ManualReservationPayment[]) => void,
): () => void {
    const col = collection(db, "venues", venueId, "payments");
    const q = query(col, where("date", "==", date));
    return onSnapshot(q, (snap) => {
        const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ManualReservationPayment);
        callback(payments);
    });
}

/**
 * Obtiene el pago de una reserva en una fecha concreta (si existe).
 * Útil para la card: necesita saber si renderizar el chip resumen o el botón "Marcar pagado".
 */
export async function getManualReservationPayment(
    venueId: string,
    reservationId: string,
    date: string,
): Promise<ManualReservationPayment | null> {
    const paymentId = buildPaymentId(reservationId, date);
    const snap = await getDoc(doc(db, "venues", venueId, "payments", paymentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ManualReservationPayment;
}
