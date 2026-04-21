/**
 * ========================
 * BLOCKED SLOTS FUNCTIONS
 * ========================
 *
 * createBlockedSlot: crea un bloqueo puntual o recurrente, detectando
 * conflictos con bookings futuros antes de crear.
 *
 * Ref: docs/BLOQUEOS_RECURRENTES_SDD.md
 */

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

interface Recurrence {
    type: RecurrenceType;
    startDate: string;
    endDate?: string;
}

interface CreateInput {
    date: string | null;
    startTime: string;
    endTime: string;
    courtIds: string[];
    reason?: string;
    clientName?: string;
    recurrence?: Recurrence;
}

interface BookingConflict {
    date: string;
    startTime: string;
    endTime: string;
    bookingId: string;
    bookedBy: string;
    bookedByName: string;
}

const RECURRENCE_TYPES: RecurrenceType[] = ["daily", "weekly", "biweekly", "monthly"];
const HORIZON_DAYS = 90; // mirar 90 días hacia adelante para conflictos en recurrentes

function parseLocalDate(dateStr: string): Date {
    return new Date(dateStr + "T12:00:00");
}

function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function isValidDate(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = parseLocalDate(s);
    return !isNaN(d.getTime()) && toISODate(d) === s;
}

function isValidTime(s: string): boolean {
    return /^\d{2}:\d{2}$/.test(s);
}

function doesRecurrenceApplyToDate(r: Recurrence, date: string): boolean {
    if (date < r.startDate) return false;
    if (r.endDate && date > r.endDate) return false;

    const start = parseLocalDate(r.startDate);
    const target = parseLocalDate(date);

    switch (r.type) {
        case "daily":
            return true;
        case "weekly":
            return start.getDay() === target.getDay();
        case "biweekly": {
            if (start.getDay() !== target.getDay()) return false;
            const diffDays = Math.round(
                (target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
            );
            return diffDays % 14 === 0;
        }
        case "monthly": {
            const startDay = start.getDate();
            if (startDay > 28) return false;
            return target.getDate() === startDay;
        }
    }
}

function listInstancesInRange(r: Recurrence, fromDate: string, horizonDays: number): string[] {
    const dates: string[] = [];
    const from = parseLocalDate(fromDate);
    for (let i = 0; i < horizonDays; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        const iso = toISODate(d);
        if (doesRecurrenceApplyToDate(r, iso)) dates.push(iso);
    }
    return dates;
}

export const createBlockedSlot = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Debes iniciar sesión");
    }

    const { venueId, input, force } = request.data as {
        venueId: string;
        input: CreateInput;
        force: boolean;
    };

    if (!venueId || !input) {
        throw new HttpsError("invalid-argument", "Faltan parámetros");
    }

    // ── AUTORIZACIÓN ──
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const isAdmin = userData?.adminType === "super_admin"
        || (userData?.adminType === "location_admin"
            && Array.isArray(userData?.assignedLocationIds)
            && userData.assignedLocationIds.includes(venueId));

    if (!isAdmin) {
        throw new HttpsError("permission-denied", "Solo admins pueden crear bloqueos");
    }

    // ── VALIDACIÓN DE INPUT ──
    if (!isValidTime(input.startTime) || !isValidTime(input.endTime)) {
        throw new HttpsError("invalid-argument", "Formato de hora inválido (HH:MM)");
    }
    if (input.startTime >= input.endTime) {
        throw new HttpsError("invalid-argument", "La hora de inicio debe ser anterior a la hora de fin");
    }
    if (!Array.isArray(input.courtIds) || input.courtIds.length === 0) {
        throw new HttpsError("invalid-argument", "Selecciona al menos una cancha");
    }

    const clientName = typeof input.clientName === "string"
        ? input.clientName.trim().slice(0, 80)
        : undefined;
    const reason = typeof input.reason === "string"
        ? input.reason.trim().slice(0, 200)
        : undefined;

    // ── VALIDACIÓN: RECURRENCIA vs PUNTUAL ──
    let normalizedDate: string | null = null;
    let normalizedRecurrence: Recurrence | undefined;

    if (input.recurrence) {
        const r = input.recurrence;
        if (!RECURRENCE_TYPES.includes(r.type)) {
            throw new HttpsError("invalid-argument", "Tipo de recurrencia inválido");
        }
        if (!isValidDate(r.startDate)) {
            throw new HttpsError("invalid-argument", "Fecha de inicio inválida");
        }
        if (r.endDate !== undefined && !isValidDate(r.endDate)) {
            throw new HttpsError("invalid-argument", "Fecha de fin inválida");
        }
        if (r.endDate && r.endDate < r.startDate) {
            throw new HttpsError("invalid-argument", "Fecha de fin debe ser posterior a inicio");
        }
        if (r.type === "monthly") {
            const day = parseLocalDate(r.startDate).getDate();
            if (day > 28) {
                throw new HttpsError(
                    "invalid-argument",
                    "Para recurrencia mensual, el día debe estar entre 1 y 28",
                );
            }
        }
        normalizedRecurrence = {
            type: r.type,
            startDate: r.startDate,
            ...(r.endDate ? { endDate: r.endDate } : {}),
        };
        normalizedDate = null;
    } else {
        if (!input.date || !isValidDate(input.date)) {
            throw new HttpsError("invalid-argument", "Fecha inválida");
        }
        normalizedDate = input.date;
    }

    // ── VALIDAR COURTS PERTENECEN AL VENUE ──
    const venueRef = db.collection("venues").doc(venueId);
    const venueSnap = await venueRef.get();
    if (!venueSnap.exists) {
        throw new HttpsError("not-found", "Sede no encontrada");
    }
    const courtsSnap = await venueRef.collection("courts").get();
    const validCourtIds = new Set(courtsSnap.docs.map((d) => d.id));
    for (const cid of input.courtIds) {
        if (!validCourtIds.has(cid)) {
            throw new HttpsError("invalid-argument", `Cancha ${cid} no existe en este venue`);
        }
    }

    // ── DETECTAR CONFLICTOS CON BOOKINGS FUTUROS ──
    const now = new Date();
    const todayISO = toISODate(now);

    const datesToCheck: string[] = normalizedRecurrence
        ? listInstancesInRange(
            normalizedRecurrence,
            normalizedRecurrence.startDate > todayISO
                ? normalizedRecurrence.startDate
                : todayISO,
            HORIZON_DAYS,
        )
        : (normalizedDate && normalizedDate >= todayISO ? [normalizedDate] : []);

    const conflicts: BookingConflict[] = [];

    for (const checkDate of datesToCheck) {
        const bookingsSnap = await db.collection("bookings")
            .where("venueId", "==", venueId)
            .where("date", "==", checkDate)
            .where("status", "in", ["confirmed", "pending_payment"])
            .get();

        for (const bDoc of bookingsSnap.docs) {
            const b = bDoc.data();
            // Overlap de horario
            const overlaps = b.startTime < input.endTime && b.endTime > input.startTime;
            if (!overlaps) continue;
            // Overlap de canchas
            const bCourts: string[] = b.courtIds || [];
            const hasCourtOverlap = bCourts.some((cid) => input.courtIds.includes(cid));
            if (!hasCourtOverlap) continue;

            conflicts.push({
                date: checkDate,
                startTime: b.startTime,
                endTime: b.endTime,
                bookingId: bDoc.id,
                bookedBy: b.bookedBy,
                bookedByName: b.bookedByName || "Jugador",
            });
        }

        if (conflicts.length >= 20) break; // cap para no sobrecargar
    }

    if (conflicts.length > 0 && !force) {
        return { conflicts };
    }

    // ── CREAR DOCUMENTO ──
    const id = `blocked_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowISO = new Date().toISOString();

    const docData: Record<string, unknown> = {
        date: normalizedDate,
        startTime: input.startTime,
        endTime: input.endTime,
        courtIds: input.courtIds,
        createdBy: uid,
        createdAt: nowISO,
    };
    if (clientName) docData.clientName = clientName;
    if (reason) docData.reason = reason;
    if (normalizedRecurrence) docData.recurrence = normalizedRecurrence;

    await venueRef.collection("blocked_slots").doc(id).set(docData);

    return { id };
});
