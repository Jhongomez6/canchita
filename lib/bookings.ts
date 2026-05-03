/**
 * ========================
 * BOOKINGS CLIENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 *
 * Lecturas de reservas + llamadas a Cloud Functions para crear/cancelar.
 */

import {
    doc,
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
import { db, app } from "./firebase";
import type { Booking } from "./domain/booking";
import type { CourtFormat } from "./domain/venue";

const functions = getFunctions(app);

// ========================
// LECTURAS
// ========================

/**
 * Obtiene las reservas de un usuario, ordenadas por fecha descendente.
 */
export async function getUserBookings(
    uid: string,
    pageSize: number = 20,
    lastDoc?: DocumentSnapshot,
): Promise<{ bookings: Booking[]; lastDoc: DocumentSnapshot | null }> {
    const ref = collection(db, "bookings");

    const q = lastDoc
        ? query(ref, where("bookedBy", "==", uid), orderBy("date", "desc"), startAfter(lastDoc), firestoreLimit(pageSize))
        : query(ref, where("bookedBy", "==", uid), orderBy("date", "desc"), firestoreLimit(pageSize));

    const snap = await getDocs(q);
    const bookings = snap.docs.map((d) => d.data() as Booking);
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { bookings, lastDoc: last };
}

/**
 * Obtiene reservas de un venue en una fecha (para calcular courts ocupados en UI).
 */
export async function getBookingsForDate(
    venueId: string,
    date: string,
): Promise<Booking[]> {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("date", "==", date),
        where("status", "in", ["confirmed", "pending_payment"]),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Booking);
}

/**
 * Suscripción reactiva a las reservas confirmadas/pendientes del venue+fecha.
 */
export function subscribeToBookingsForDate(
    venueId: string,
    date: string,
    callback: (bookings: Booking[]) => void,
): () => void {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("date", "==", date),
        where("status", "in", ["confirmed", "pending_payment"]),
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => d.data() as Booking));
    });
}

/**
 * Suscripción en tiempo real a una reserva individual.
 */
export function subscribeToBooking(
    bookingId: string,
    callback: (booking: Booking | null) => void,
): () => void {
    return onSnapshot(doc(db, "bookings", bookingId), (snap) => {
        if (!snap.exists()) {
            callback(null);
            return;
        }
        callback(snap.data() as Booking);
    });
}

// ========================
// FIREBASE FUNCTIONS CALLS
// ========================

/**
 * Crear una reserva. El server asigna courts automáticamente.
 */
export async function createBooking(input: {
    venueId: string;
    format: CourtFormat;
    date: string;
    startTime: string;
    endTime: string;
}) {
    const fn = httpsCallable<
        typeof input,
        {
            bookingId: string;
            depositCOP: number;
            remainingCOP: number;
            totalPriceCOP: number;
        }
    >(functions, "createBooking");
    const result = await fn(input);
    return result.data;
}

/**
 * Cancelar una reserva (con posible reembolso de depósito).
 */
export async function cancelBooking(bookingId: string, reason: string) {
    const fn = httpsCallable<
        { bookingId: string; reason: string },
        { refunded: boolean; refundAmount: number }
    >(functions, "cancelBooking");
    const result = await fn({ bookingId, reason });
    return result.data;
}
