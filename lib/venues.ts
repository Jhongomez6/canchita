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
import { withTimeout } from "./utils/withTimeout";
import { expandBlockedSlotsForDate } from "./domain/blocked-slots";
import type { Venue, Court, CourtCombo, DaySchedule, DayOfWeek, BlockedSlot, BookingConflict, CreateVenueInput, ManualReservationStatus, ManualReservationPayment, PaymentMethod } from "./domain/venue";
import { validatePaymentMethods, normalizePaymentNote } from "./domain/venue";
import { validatePendingApprovalTTL } from "./domain/booking";
import { validateWhatsAppNumber, validateWeekendLeadHours, validateBookingPolicies, validateGallery, validateAmenities, validateBookingWindowDays } from "./domain/venue";
import { buildPaymentId, validatePaymentAmounts } from "./domain/payments";

// ========================
// VENUES
// ========================

export async function getVenue(venueId: string): Promise<Venue | null> {
    const snap = await withTimeout(getDoc(doc(db, "venues", venueId)));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Venue;
}

export async function getActiveVenues(): Promise<Venue[]> {
    const q = query(
        collection(db, "venues"),
        where("active", "==", true),
    );
    const snap = await withTimeout(getDocs(q));
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
    const snap = await withTimeout(getDocs(collection(db, "venues", venueId, "courts")));
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Court)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ========================
// COURT COMBOS
// ========================

export async function getVenueCombos(venueId: string): Promise<CourtCombo[]> {
    const snap = await withTimeout(getDocs(collection(db, "venues", venueId, "court_combos")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CourtCombo);
}

// ========================
// SCHEDULES
// ========================

export async function getVenueSchedule(venueId: string, dayOfWeek: string): Promise<DaySchedule | null> {
    const snap = await withTimeout(getDoc(doc(db, "venues", venueId, "schedules", dayOfWeek)));
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
        city: input.city?.trim() || undefined,
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
    data: Partial<Pick<Venue, "depositRequired" | "depositPercent" | "name" | "address" | "city" | "phone" | "description" | "active" | "imageURL" | "icon" | "formats" | "pendingApprovalTTLHours" | "whatsappNotificationNumber" | "hidePricesForLocationAdmins" | "weekendMinLeadHours" | "bookingPolicies" | "gallery" | "amenities" | "bookingWindowDays">>,
): Promise<void> {
    if (data.pendingApprovalTTLHours !== undefined) {
        validatePendingApprovalTTL(data.pendingApprovalTTLHours);
    }
    if (data.weekendMinLeadHours !== undefined) {
        validateWeekendLeadHours(data.weekendMinLeadHours);
    }
    if (data.whatsappNotificationNumber !== undefined) {
        validateWhatsAppNumber(data.whatsappNotificationNumber);
    }
    if (data.bookingPolicies !== undefined) {
        validateBookingPolicies(data.bookingPolicies);
    }
    if (data.gallery !== undefined) {
        validateGallery(data.gallery);
    }
    if (data.amenities !== undefined) {
        validateAmenities(data.amenities);
    }
    if (data.bookingWindowDays !== undefined) {
        validateBookingWindowDays(data.bookingWindowDays);
    }
    await updateDoc(doc(db, "venues", venueId), {
        ...data,
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Actualiza los métodos de pago del venue. Solo Super Admin debe llamar esto
 * (las Firestore Rules lo enforzan field-level).
 */
export async function updatePaymentMethods(
    venueId: string,
    methods: PaymentMethod[],
): Promise<void> {
    validatePaymentMethods(methods);
    await updateDoc(doc(db, "venues", venueId), {
        paymentMethods: methods,
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Actualiza el TTL configurable de reservas pendientes.
 */
export async function updatePendingApprovalTTL(
    venueId: string,
    hours: number,
): Promise<void> {
    validatePendingApprovalTTL(hours);
    await updateDoc(doc(db, "venues", venueId), {
        pendingApprovalTTLHours: hours,
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Actualiza el número WhatsApp del venue. Pasar string vacío o null para limpiar.
 */
export async function updateWhatsAppNotificationNumber(
    venueId: string,
    number: string | null,
): Promise<void> {
    const trimmed = number?.trim();
    if (trimmed) validateWhatsAppNumber(trimmed);
    await updateDoc(doc(db, "venues", venueId), {
        whatsappNotificationNumber: trimmed || deleteField(),
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
    isBirthday?: boolean;
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
    updates: { clientName?: string; clientPhone?: string; reason?: string; isMonthly?: boolean; isBirthday?: boolean },
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
        // Se cancela server-side vía Cloud Function: el soft-cancel debe LIBERAR la
        // entrada del availability ledger en la misma transacción (RN-6 del SDD del
        // ledger). El cliente no puede escribir `availability` (write:false), así que
        // hacerlo aquí dejaba una ocupación fantasma → "El horario acaba de ocuparse".
        const fn = httpsCallable<
            { venueId: string; blockedSlotId: string; reason?: string },
            { ok: true }
        >(functions, "cancelBlockedSlotOneOff");
        await fn({ venueId, blockedSlotId: slot.id, reason: reason?.trim() || undefined });
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
 * Registra un pago para una reserva (manual o booking online) en una fecha concreta.
 * Operación atómica: crea el doc en `payments`. Para reservas manuales también actualiza
 * el slot `blocked_slots.{id}` a status "paid" (o el statusOverride para recurrentes).
 *
 * Falla con `PaymentAlreadyExistsError` si ya hay pago registrado para el mismo
 * par (reservationId, targetDate) — la UI redirecciona a edit.
 *
 * Para reservas ONLINE (bookings), pasar `options.skipSlotUpdate = true`. En ese
 * caso no se lee ni actualiza el doc en `blocked_slots` (no existe — el booking
 * vive en `bookings/{id}`). Los snapshots se toman del prop `slot` directamente, y
 * la transición del booking a "paid" la hace el caller vía `advanceBookingStatus`.
 */
export async function registerManualReservationPayment(
    venueId: string,
    slot: BlockedSlot,
    targetDate: string,
    cashCOP: number,
    transferCOP: number,
    registeredBy: string,
    options?: { skipSlotUpdate?: boolean; note?: string },
): Promise<{ id: string }> {
    validatePaymentAmounts(cashCOP, transferCOP);

    const note = normalizePaymentNote(options?.note);
    const paymentId = buildPaymentId(slot.id, targetDate);
    const slotRef = doc(db, "venues", venueId, "blocked_slots", slot.id);
    const paymentRef = doc(db, "venues", venueId, "payments", paymentId);
    const now = new Date().toISOString();
    const totalCOP = cashCOP + transferCOP;
    const isRecurring = !!slot.recurrence;
    const skipSlotUpdate = !!options?.skipSlotUpdate;

    await runTransaction(db, async (tx) => {
        // Para reservas online no leemos blocked_slots (el doc no existe).
        // Usamos el `slot` prop como fuente para los snapshots del payment.
        let slotData: Omit<BlockedSlot, "id"> | null = null;
        if (!skipSlotUpdate) {
            const slotSnap = await tx.get(slotRef);
            if (!slotSnap.exists()) {
                throw new Error("La reserva ya no existe");
            }
            slotData = slotSnap.data() as Omit<BlockedSlot, "id">;
        }
        const existing = await tx.get(paymentRef);
        if (existing.exists()) {
            throw new PaymentAlreadyExistsError(paymentId);
        }

        // Fuente de snapshots: el doc leído (manual) o el prop (online).
        const src = slotData ?? slot;
        const payment: Omit<ManualReservationPayment, "id"> = {
            reservationId: slot.id,
            date: targetDate,
            cashCOP,
            transferCOP,
            totalCOP,
            startTime: src.startTime,
            endTime: src.endTime,
            courtIds: src.courtIds,
            ...(src.clientName ? { clientName: src.clientName } : {}),
            ...(typeof src.priceCOP === "number" ? { priceCOP: src.priceCOP } : {}),
            ...(note ? { note } : {}),
            registeredBy,
            registeredAt: now,
        };
        tx.set(paymentRef, payment);

        // Slot update solo para reservas manuales.
        if (!skipSlotUpdate) {
            if (isRecurring) {
                tx.update(slotRef, {
                    [`statusOverrides.${targetDate}`]: "paid",
                    updatedAt: now,
                });
            } else {
                tx.update(slotRef, { status: "paid", updatedAt: now });
            }
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
    options?: { note?: string },
): Promise<void> {
    validatePaymentAmounts(cashCOP, transferCOP);

    const note = normalizePaymentNote(options?.note);
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
            // Si la nota quedó vacía, se elimina el campo del documento.
            note: note ?? deleteField(),
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
            const now = new Date().toISOString();
            if (isRecurring && slot.statusOverrides?.[payment.date] === "paid") {
                tx.update(slotRef, {
                    [`statusOverrides.${payment.date}`]: "played",
                    updatedAt: now,
                });
            } else if (!isRecurring && slot.status === "paid") {
                tx.update(slotRef, { status: "played", updatedAt: now });
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
 * Analítica de sede — pagos con `date` en [start, end].
 * Query de campo único con rango → índice automático, sin índice compuesto.
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export async function getPaymentsInRange(
    venueId: string,
    start: string,
    end: string,
): Promise<ManualReservationPayment[]> {
    const col = collection(db, "venues", venueId, "payments");
    const q = query(col, where("date", ">=", start), where("date", "<=", end));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ManualReservationPayment);
}

/**
 * Analítica de sede — reservas relevantes al rango SIN leer toda la colección.
 * Dos queries de campo único (evita `getAllBlockedSlots`, cuya lectura full-collection
 * crece sin límite con la historia de la sede):
 *   1. puntuales:   where date >= start && date <= end
 *   2. recurrentes: where date == null  (plantillas; se expanden en memoria por el dominio)
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export async function getBlockedSlotsForRange(
    venueId: string,
    start: string,
    end: string,
): Promise<BlockedSlot[]> {
    const col = collection(db, "venues", venueId, "blocked_slots");
    const [oneOffSnap, recurringSnap] = await Promise.all([
        getDocs(query(col, where("date", ">=", start), where("date", "<=", end))),
        getDocs(query(col, where("date", "==", null))),
    ]);
    const map = (snap: typeof oneOffSnap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedSlot);
    return [...map(oneOffSnap), ...map(recurringSnap)];
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
