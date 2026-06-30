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
import { withTimeout } from "./utils/withTimeout";
import type { Booking } from "./domain/booking";

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

    const snap = await withTimeout(getDocs(q));
    const bookings = snap.docs.map((d) => d.data() as Booking);
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { bookings, lastDoc: last };
}

/** Estados que bloquean slot — usados en queries del calendario admin. */
const SLOT_BLOCKING_STATUSES = [
    "pending_payment",
    "pending_approval",
    "deposit_confirmed",
    "confirmed",
    "played",
] as const;

/**
 * Obtiene reservas de un venue en una fecha (para calcular courts ocupados en UI).
 * Incluye todos los estados que bloquean slot (pre-juego + played).
 */
export async function getBookingsForDate(
    venueId: string,
    date: string,
): Promise<Booking[]> {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("date", "==", date),
        where("status", "in", SLOT_BLOCKING_STATUSES as unknown as string[]),
    );
    const snap = await withTimeout(getDocs(q));
    return snap.docs.map((d) => d.data() as Booking);
}

/**
 * Reservas de un venue en un rango de fechas (inclusive). `date` es "YYYY-MM-DD",
 * así que el orden lexicográfico coincide con el cronológico. Una sola query en vez
 * de una por día — usado por el calendario admin para marcar los días con reservas.
 * Sin filtro de status (el caller filtra en cliente) para reusar el prefijo del índice
 * existente `(venueId, date)` y no requerir uno nuevo.
 */
export async function getBookingsInDateRange(
    venueId: string,
    startDate: string,
    endDate: string,
): Promise<Booking[]> {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
    );
    const snap = await withTimeout(getDocs(q));
    return snap.docs.map((d) => d.data() as Booking);
}

/**
 * Suscripción reactiva a las reservas que bloquean slot del venue+fecha.
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
        where("status", "in", SLOT_BLOCKING_STATUSES as unknown as string[]),
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => d.data() as Booking));
    });
}

/**
 * Suscripción a TODAS las reservas del día (sin filtro de status). Para vistas
 * admin que necesitan mostrar histórico completo (incluye no_show, paid, cancelled,
 * expired). Para queries de disponibilidad usar `subscribeToBookingsForDate` que
 * solo trae estados que bloquean slot.
 */
export function subscribeToAllBookingsForDate(
    venueId: string,
    date: string,
    callback: (bookings: Booking[]) => void,
): () => void {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("date", "==", date),
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => d.data() as Booking));
    });
}

/** Estados que efectivamente bloquean un slot (impiden que otro reserve esa cancha). */
export const SLOT_BLOCKING_BOOKING_STATUSES = [
    "pending_payment",
    "pending_approval",
    "deposit_confirmed",
    "confirmed",
    "played",
] as const;

/**
 * Suscripción a las reservas pendientes (sin comprobante o por aprobar) de un venue.
 * Para la vista admin "Reservas pendientes".
 */
export function subscribeToPendingBookings(
    venueId: string,
    callback: (bookings: Booking[]) => void,
): () => void {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("status", "in", ["pending_payment", "pending_approval"]),
        orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => d.data() as Booking));
    });
}

/**
 * Lectura puntual del listado de pendientes para un venue.
 */
export async function getPendingBookingsForVenue(venueId: string): Promise<Booking[]> {
    const q = query(
        collection(db, "bookings"),
        where("venueId", "==", venueId),
        where("status", "in", ["pending_payment", "pending_approval"]),
        orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Booking);
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
    format: string;
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
 * Cancelar una reserva (con posible reembolso de depósito para bookings legacy).
 */
export async function cancelBooking(bookingId: string, reason: string) {
    const fn = httpsCallable<
        { bookingId: string; reason: string },
        { refunded: boolean; refundAmount: number }
    >(functions, "cancelBooking");
    const result = await fn({ bookingId, reason });
    return result.data;
}

// ========================
// PAGO EXTERNO — NUEVO FLUJO
// ========================

/**
 * Marca el comprobante subido en una reserva. El cliente debe haber subido
 * el archivo a Storage previamente; aquí solo persiste la URL y mueve el
 * estado a pending_approval.
 */
export async function markPaymentProofUploaded(
    bookingId: string,
    proofURL: string,
): Promise<{ status: "pending_approval" }> {
    const fn = httpsCallable<
        { bookingId: string; proofURL: string },
        { status: "pending_approval" }
    >(functions, "uploadPaymentProof");
    const res = await fn({ bookingId, proofURL });
    return res.data;
}

/**
 * Admin aprueba el abono → estado pasa a deposit_confirmed.
 */
export async function approveBookingDeposit(
    bookingId: string,
): Promise<{ status: "deposit_confirmed" }> {
    const fn = httpsCallable<
        { bookingId: string },
        { status: "deposit_confirmed" }
    >(functions, "approveBookingDeposit");
    const res = await fn({ bookingId });
    return res.data;
}

/**
 * Admin confirma asistencia → estado pasa a confirmed.
 */
export async function confirmBookingAttendance(
    bookingId: string,
): Promise<{ status: "confirmed" }> {
    const fn = httpsCallable<
        { bookingId: string },
        { status: "confirmed" }
    >(functions, "confirmBookingAttendance");
    const res = await fn({ bookingId });
    return res.data;
}

/**
 * Admin rechaza el comprobante con motivo. Si es el 3er rechazo,
 * el server marca la reserva como expired.
 */
export async function rejectPaymentProof(
    bookingId: string,
    reason: string,
): Promise<{ status: "pending_payment" | "expired"; attemptsRemaining: number }> {
    const fn = httpsCallable<
        { bookingId: string; reason: string },
        { status: "pending_payment" | "expired"; attemptsRemaining: number }
    >(functions, "rejectPaymentProof");
    const res = await fn({ bookingId, reason });
    return res.data;
}

/**
 * Admin avanza estado post-aprobación: confirmed → played → paid, o → no_show.
 */
export type AdvanceBookingTargetStatus =
    | "deposit_confirmed"
    | "confirmed"
    | "played"
    | "paid"
    | "no_show";

export async function advanceBookingStatus(
    bookingId: string,
    nextStatus: AdvanceBookingTargetStatus,
): Promise<{ status: string }> {
    const fn = httpsCallable<
        { bookingId: string; nextStatus: string },
        { status: string }
    >(functions, "advanceBookingStatus");
    const res = await fn({ bookingId, nextStatus });
    return res.data;
}
