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
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";
import { expandBlockedSlotsForDate } from "./domain/blocked-slots";
import type { Venue, Court, CourtCombo, DaySchedule, DayOfWeek, BlockedSlot, BookingConflict, CreateVenueInput } from "./domain/venue";

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
    data: Partial<Pick<Venue, "depositRequired" | "depositPercent" | "name" | "address" | "phone" | "description" | "active">>,
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
    recurrence?: BlockedSlot["recurrence"];
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
