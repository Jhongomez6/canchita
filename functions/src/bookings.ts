/**
 * ========================
 * BOOKING FUNCTIONS
 * ========================
 *
 * Firebase Functions para reservas de canchas:
 * - createBooking: validar disponibilidad + asignar courts + debitar depósito
 * - cancelBooking: cancelar reserva + reembolsar depósito si corresponde
 * - expirePendingBookings: marcar como expired las reservas sin pago (cada 5min)
 * - completePassedBookings: marcar como completed las reservas pasadas (cada 30min)
 *
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 */

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { APP_URL } from "./config";

const db = admin.firestore();

// Permanently invalid FCM error codes
const PERMANENT_ERROR_CODES = [
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
];

/**
 * Best-effort push notification for booking events.
 * Never throws — push is always best-effort.
 */
async function sendBookingPush(
    uid: string,
    payload: { title: string; body: string },
    url: string,
): Promise<void> {
    try {
        const userSnap = await db.collection("users").doc(uid).get();
        const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
        if (tokens.length === 0) return;

        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: payload.title, body: payload.body },
            data: { url },
            webpush: {
                notification: { icon: "/icons/icon-192x192.png" },
                fcmOptions: { link: `${APP_URL}${url}` },
            },
            apns: { payload: { aps: { badge: 1, sound: "default" } } },
        });

        // Clean up invalid tokens
        const invalidTokens: string[] = [];
        response.responses.forEach((res, idx) => {
            if (!res.success && PERMANENT_ERROR_CODES.includes(res.error?.code || "")) {
                invalidTokens.push(tokens[idx]);
            }
        });

        if (invalidTokens.length > 0) {
            await db.collection("users").doc(uid).update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
            });
        }

        console.log(`[BookingPush] ${uid}: sent=${response.successCount}, failed=${response.failureCount}`);
    } catch (err) {
        console.error(`[BookingPush] ${uid}: non-fatal error:`, err);
    }
}

// ========================
// CONSTANTES
// ========================

const REFUND_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 horas

// ========================
// HELPERS
// ========================

function nowISO(): string {
    return new Date().toISOString();
}

/**
 * Algoritmo de asignación de canchas — "Smallest Fit First".
 * Duplicado del dominio puro (lib/domain/court-allocation.ts)
 * porque Cloud Functions no comparten código con el frontend.
 */
function allocateCourts(
    requestedFormat: string,
    courts: Array<{ id: string; name: string; baseFormat: string; active: boolean }>,
    combos: Array<{ id: string; courtIds: string[]; resultingFormat: string; active: boolean }>,
    occupiedCourtIds: string[],
    blockedCourtIds: string[],
): { courtIds: string[]; courtNames: string[]; comboUsed?: string } | null {
    const unavailableIds = new Set([...occupiedCourtIds, ...blockedCourtIds]);
    const activeCourts = courts.filter((c) => c.active);
    const activeCombos = combos.filter((c) => c.active);

    interface Option {
        courtIds: string[];
        courtNames: string[];
        comboId?: string;
        impactScore: number;
    }

    const options: Option[] = [];

    // Courts individuales que matchean el formato
    for (const court of activeCourts) {
        if (court.baseFormat === requestedFormat && !unavailableIds.has(court.id)) {
            const impact = courtImpactScore(court.id, activeCombos, unavailableIds);
            options.push({
                courtIds: [court.id],
                courtNames: [court.name],
                impactScore: impact,
            });
        }
    }

    // Combos que producen el formato
    for (const combo of activeCombos) {
        if (combo.resultingFormat === requestedFormat) {
            const allFree = combo.courtIds.every((id) => !unavailableIds.has(id));
            if (allFree) {
                const impact = comboImpactScore(combo.courtIds, activeCombos, unavailableIds);
                const comboCourtNames = combo.courtIds.map((id) => {
                    const court = activeCourts.find((c) => c.id === id);
                    return court?.name ?? id;
                });
                options.push({
                    courtIds: [...combo.courtIds],
                    courtNames: comboCourtNames,
                    comboId: combo.id,
                    impactScore: impact,
                });
            }
        }
    }

    if (options.length === 0) return null;

    options.sort((a, b) => {
        if (a.impactScore !== b.impactScore) return a.impactScore - b.impactScore;
        if (a.courtIds.length !== b.courtIds.length) return a.courtIds.length - b.courtIds.length;
        return a.courtIds[0].localeCompare(b.courtIds[0]);
    });

    const best = options[0];
    return {
        courtIds: best.courtIds,
        courtNames: best.courtNames,
        comboUsed: best.comboId,
    };
}

function courtImpactScore(
    courtId: string,
    combos: Array<{ courtIds: string[]; active: boolean }>,
    unavailableIds: Set<string>,
): number {
    return combos.filter((combo) => {
        const isViable = combo.courtIds.every((id) => !unavailableIds.has(id));
        const wouldBreak = combo.courtIds.includes(courtId);
        return isViable && wouldBreak;
    }).length;
}

function comboImpactScore(
    courtIds: string[],
    combos: Array<{ courtIds: string[]; active: boolean }>,
    unavailableIds: Set<string>,
): number {
    const courtIdSet = new Set(courtIds);
    return combos.filter((combo) => {
        const isSameCombo = combo.courtIds.length === courtIds.length &&
            combo.courtIds.every((id) => courtIdSet.has(id));
        if (isSameCombo) return false;
        const isViable = combo.courtIds.every((id) => !unavailableIds.has(id));
        const wouldBreak = combo.courtIds.some((id) => courtIdSet.has(id));
        return isViable && wouldBreak;
    }).length;
}

function formatCOPLabel(centavos: number): string {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(centavos / 100);
}

// ========================
// createBooking — onCall
// ========================

export const createBooking = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const {
            venueId,
            format,
            date,
            startTime,
            endTime,
        } = request.data as {
            venueId: string;
            format: string;
            date: string;
            startTime: string;
            endTime: string;
        };

        // ── VALIDACIONES DE INPUT ──
        if (!venueId || !format || !date || !startTime || !endTime) {
            throw new HttpsError("invalid-argument", "Todos los campos son requeridos");
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new HttpsError("invalid-argument", "Fecha inválida (YYYY-MM-DD)");
        }

        if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
            throw new HttpsError("invalid-argument", "Horario inválido (HH:mm)");
        }

        if (startTime >= endTime) {
            throw new HttpsError("invalid-argument", "La hora de inicio debe ser anterior a la hora de fin");
        }

        const todayISO = new Date().toISOString().split("T")[0];
        if (date < todayISO) {
            throw new HttpsError("invalid-argument", "No se puede reservar en una fecha pasada");
        }

        // ── LEER VENUE ──
        const venueRef = db.collection("venues").doc(venueId);
        const venueSnap = await venueRef.get();

        if (!venueSnap.exists) {
            throw new HttpsError("not-found", "La sede no existe");
        }

        const venue = venueSnap.data()!;
        if (!venue.active) {
            throw new HttpsError("failed-precondition", "La sede no está activa");
        }

        // ── LEER COURTS Y COMBOS ──
        const courtsSnap = await venueRef.collection("courts").get();
        const courts = courtsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
            id: string; name: string; baseFormat: string; active: boolean;
        }>;

        const combosSnap = await venueRef.collection("court_combos").get();
        const combos = combosSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
            id: string; courtIds: string[]; resultingFormat: string; active: boolean;
        }>;

        // ── LEER SCHEDULE para obtener precio ──
        const jsDate = new Date(date + "T12:00:00");
        const jsDay = jsDate.getDay();
        const dayMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dayOfWeek = dayMap[jsDay];

        const scheduleSnap = await venueRef.collection("schedules").doc(dayOfWeek).get();
        if (!scheduleSnap.exists) {
            throw new HttpsError("failed-precondition", "No hay horario configurado para este día");
        }

        const schedule = scheduleSnap.data()!;
        if (!schedule.enabled) {
            throw new HttpsError("failed-precondition", "La sede no está disponible este día");
        }

        // Buscar slot y precio para el formato solicitado
        const matchingSlot = (schedule.slots as Array<{
            startTime: string; endTime: string;
            formats: Array<{ format: string; priceCOP: number }>;
        }>).find((s) => s.startTime <= startTime && s.endTime >= endTime);

        if (!matchingSlot) {
            throw new HttpsError("failed-precondition", "El horario solicitado no está dentro del schedule");
        }

        const formatPricing = matchingSlot.formats.find((f) => f.format === format);
        if (!formatPricing) {
            throw new HttpsError("failed-precondition", "El formato no está disponible en este horario");
        }

        // Calcular precio (puede ser múltiples slots consecutivos)
        const slotDurationMin = (() => {
            const [sH, sM] = matchingSlot.startTime.split(":").map(Number);
            const [eH, eM] = matchingSlot.endTime.split(":").map(Number);
            return (eH * 60 + eM) - (sH * 60 + sM);
        })();
        const [reqSH, reqSM] = startTime.split(":").map(Number);
        const [reqEH, reqEM] = endTime.split(":").map(Number);
        const requestedMinutes = (reqEH * 60 + reqEM) - (reqSH * 60 + reqSM);
        const slotCount = Math.max(1, Math.floor(requestedMinutes / slotDurationMin));

        const pricePerSlotCOP = formatPricing.priceCOP;
        const totalPriceCOP = pricePerSlotCOP * slotCount;

        // Depósito
        const depositRequired: boolean = venue.depositRequired ?? false;
        const depositPercent: number = venue.depositPercent ?? 0;
        const depositCOP = depositRequired
            ? Math.round(totalPriceCOP * depositPercent / 100)
            : 0;
        const remainingCOP = totalPriceCOP - depositCOP;

        const paymentMethod: string = depositRequired && depositCOP > 0
            ? "wallet_deposit"
            : "on_site";

        // ── LEER PERFIL USUARIO ──
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "Usuario no encontrado");
        }
        const user = userSnap.data()!;

        // ── LEER BLOCKED SLOTS (puntuales + recurrentes expandidos) ──
        const [oneOffSnap, recurringSnap] = await Promise.all([
            venueRef.collection("blocked_slots").where("date", "==", date).get(),
            venueRef.collection("blocked_slots")
                .where("recurrence.type", "in", ["daily", "weekly", "biweekly", "monthly"])
                .get(),
        ]);

        const applicableBlocks: Array<{ startTime: string; endTime: string; courtIds: string[] }> = [];

        for (const d of oneOffSnap.docs) {
            const b = d.data();
            applicableBlocks.push({
                startTime: b.startTime,
                endTime: b.endTime,
                courtIds: b.courtIds || [],
            });
        }

        for (const d of recurringSnap.docs) {
            const b = d.data();
            const r = b.recurrence;
            if (!r) continue;
            // Chequear exceptDates
            const exceptDates: string[] = Array.isArray(b.exceptDates) ? b.exceptDates : [];
            if (exceptDates.includes(date)) continue;
            // Chequear rango
            if (date < r.startDate) continue;
            if (r.endDate && date > r.endDate) continue;
            // Chequear patrón
            const startLocal = new Date(r.startDate + "T12:00:00");
            const targetLocal = new Date(date + "T12:00:00");
            let applies = false;
            if (r.type === "daily") {
                applies = true;
            } else if (r.type === "weekly") {
                applies = startLocal.getDay() === targetLocal.getDay();
            } else if (r.type === "biweekly") {
                if (startLocal.getDay() === targetLocal.getDay()) {
                    const diffDays = Math.round(
                        (targetLocal.getTime() - startLocal.getTime()) / (1000 * 60 * 60 * 24),
                    );
                    applies = diffDays % 14 === 0;
                }
            } else if (r.type === "monthly") {
                const sd = startLocal.getDate();
                applies = sd <= 28 && targetLocal.getDate() === sd;
            }
            if (!applies) continue;

            applicableBlocks.push({
                startTime: b.startTime,
                endTime: b.endTime,
                courtIds: b.courtIds || [],
            });
        }

        const blockedCourtIds: string[] = [];
        for (const blocked of applicableBlocks) {
            if (blocked.startTime < endTime && blocked.endTime > startTime) {
                if (blocked.courtIds && blocked.courtIds.length > 0) {
                    blockedCourtIds.push(...blocked.courtIds);
                } else {
                    throw new HttpsError("failed-precondition", "Este horario está bloqueado");
                }
            }
        }

        // ── TRANSACCIÓN: ASIGNAR + CREAR BOOKING + DEBITAR ──
        const walletRef = paymentMethod === "wallet_deposit"
            ? db.collection("wallets").doc(uid)
            : null;
        const bookingRef = db.collection("bookings").doc();
        const txRef = paymentMethod === "wallet_deposit"
            ? db.collection("wallet_transactions").doc()
            : null;
        const now = nowISO();

        await db.runTransaction(async (transaction) => {
            // ── READS PRIMERO ──

            // Leer wallet si necesita pago
            let walletBalance = 0;
            if (walletRef) {
                const walletSnap = await transaction.get(walletRef);
                walletBalance = walletSnap.exists ? walletSnap.data()!.balanceCOP || 0 : 0;

                if (walletBalance < depositCOP) {
                    throw new HttpsError("failed-precondition", "Saldo insuficiente en tu billetera");
                }
            }

            // Leer bookings existentes en este venue+fecha para detectar courts ocupados
            // Firestore no permite queries complejas dentro de tx,
            // así que leemos todas las bookings del venue para esa fecha
            const existingBookingsSnap = await db
                .collection("bookings")
                .where("venueId", "==", venueId)
                .where("date", "==", date)
                .where("status", "in", ["confirmed", "pending_payment"])
                .get();

            // Encontrar courts ocupados en el rango solicitado
            const occupiedCourtIds: string[] = [];
            for (const doc of existingBookingsSnap.docs) {
                const b = doc.data();
                // Verificar solapamiento: startTime < endTime AND endTime > startTime
                if (b.startTime < endTime && b.endTime > startTime) {
                    occupiedCourtIds.push(...(b.courtIds || []));
                }
            }

            // ── ASIGNAR COURTS ──
            const allocation = allocateCourts(
                format,
                courts,
                combos,
                occupiedCourtIds,
                blockedCourtIds,
            );

            if (!allocation) {
                throw new HttpsError("failed-precondition", "Este horario ya no está disponible para el formato seleccionado");
            }

            // ── WRITES ──
            const expiresAt = paymentMethod === "wallet_deposit"
                ? undefined // se paga inmediatamente, no necesita TTL
                : undefined;

            const bookingData = {
                id: bookingRef.id,
                venueId,
                venueName: venue.name,
                venueAddress: venue.address,
                bookedBy: uid,
                bookedByName: user.name || "Usuario",
                bookedByPhotoURL: user.photoURL || null,
                format,
                date,
                startTime,
                endTime,
                courtIds: allocation.courtIds,
                courtNames: allocation.courtNames,
                status: "confirmed",
                totalPriceCOP,
                depositPercent: depositRequired ? depositPercent : 0,
                depositCOP,
                remainingCOP,
                paymentMethod,
                paymentTxId: txRef?.id ?? null,
                expiresAt: expiresAt ?? null,
                cancelledBy: null,
                cancelledAt: null,
                refundTxId: null,
                matchId: null,
                createdAt: now,
                updatedAt: now,
            };

            transaction.set(bookingRef, bookingData);

            // Debitar wallet si pago con depósito
            if (walletRef && txRef && depositCOP > 0) {
                const newBalance = walletBalance - depositCOP;

                transaction.update(walletRef, {
                    balanceCOP: newBalance,
                    updatedAt: now,
                });

                transaction.set(txRef, {
                    id: txRef.id,
                    uid,
                    type: "booking_deposit_debit",
                    status: "completed",
                    amountCOP: -depositCOP,
                    balanceAfterCOP: newBalance,
                    description: `Depósito reserva ${venue.name}`,
                    bookingId: bookingRef.id,
                    venueId,
                    createdAt: now,
                });
            }
        });

        // Push notification — best effort, outside transaction
        const formattedDate = (() => {
            const d = new Date(date + "T12:00:00");
            const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            return `${days[d.getDay()]} ${d.getDate()}`;
        })();

        await sendBookingPush(uid, {
            title: "Reserva confirmada",
            body: `${venue.name} · ${formattedDate} ${startTime}-${endTime}`,
        }, `/bookings/${bookingRef.id}`);

        return {
            bookingId: bookingRef.id,
            depositCOP,
            remainingCOP,
            totalPriceCOP,
        };
    }
);

// ========================
// cancelBooking — onCall
// ========================

export const cancelBooking = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }

        const uid = request.auth.uid;
        const bookingId = request.data.bookingId as string;

        if (!bookingId) {
            throw new HttpsError("invalid-argument", "bookingId es requerido");
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();
        let refunded = false;
        let refundAmount = 0;

        await db.runTransaction(async (transaction) => {
            // ── READS PRIMERO ──
            const bookingSnap = await transaction.get(bookingRef);
            if (!bookingSnap.exists) {
                throw new HttpsError("not-found", "La reserva no existe");
            }

            const booking = bookingSnap.data()!;

            // Validar que el usuario puede cancelar (dueño de la reserva o admin del venue)
            if (booking.bookedBy !== uid) {
                // Verificar si es admin del venue
                const userDoc = await db.collection("users").doc(uid).get();
                const userData = userDoc.data();
                const isVenueAdmin = userData?.adminType === "super_admin" ||
                    (userData?.adminType === "location_admin" &&
                        userData?.assignedLocationIds?.includes(booking.venueId));

                if (!isVenueAdmin) {
                    throw new HttpsError("permission-denied", "No tienes permiso para cancelar esta reserva");
                }
            }

            // Solo se puede cancelar si está confirmed o pending_payment
            if (booking.status !== "confirmed" && booking.status !== "pending_payment") {
                throw new HttpsError("failed-precondition", "La reserva no se puede cancelar en su estado actual");
            }

            // Determinar si tiene reembolso
            const depositCOP: number = booking.depositCOP || 0;
            const shouldRefund = depositCOP > 0 && booking.paymentMethod === "wallet_deposit";

            let isRefundable = false;
            if (shouldRefund) {
                const slotMs = new Date(`${booking.date}T${booking.startTime}:00`).getTime();
                const deadlineMs = slotMs - REFUND_DEADLINE_MS;
                isRefundable = Date.now() < deadlineMs;
            }

            // ── READS DE WALLET (si aplica) ──
            const walletRef = (shouldRefund && isRefundable)
                ? db.collection("wallets").doc(booking.bookedBy)
                : null;

            const walletSnap = walletRef ? await transaction.get(walletRef) : null;

            // ── WRITES ──
            transaction.update(bookingRef, {
                status: "cancelled",
                cancelledBy: uid,
                cancelledAt: now,
                updatedAt: now,
            });

            if (shouldRefund && isRefundable && walletRef && walletSnap) {
                const balance = walletSnap.exists ? walletSnap.data()!.balanceCOP || 0 : 0;
                const newBalance = balance + depositCOP;

                transaction.update(walletRef, {
                    balanceCOP: newBalance,
                    updatedAt: now,
                });

                const txRef = db.collection("wallet_transactions").doc();
                transaction.set(txRef, {
                    id: txRef.id,
                    uid: booking.bookedBy,
                    type: "booking_deposit_refund",
                    status: "completed",
                    amountCOP: +depositCOP,
                    balanceAfterCOP: newBalance,
                    description: `Reembolso reserva ${booking.venueName}`,
                    bookingId,
                    venueId: booking.venueId,
                    createdAt: now,
                });

                transaction.update(bookingRef, {
                    refundTxId: txRef.id,
                });

                refunded = true;
                refundAmount = depositCOP;
            }
        });

        // Notificación in-app + push al usuario (fuera de tx — best effort)
        const bookingSnap = await bookingRef.get();
        const booking = bookingSnap.data();
        if (booking) {
            const isSelfCancel = booking.bookedBy === uid;
            const notifBody = refunded
                ? `Tu reserva en ${booking.venueName} fue cancelada. Tu depósito de ${formatCOPLabel(refundAmount)} fue reembolsado.`
                : `Tu reserva en ${booking.venueName} fue cancelada.`;
            const notifUrl = refunded ? "/wallet" : "/bookings";

            if (!isSelfCancel) {
                // Admin canceló — notificación in-app
                await db.collection("notifications").doc(booking.bookedBy).collection("items").add({
                    title: "Reserva cancelada",
                    body: notifBody,
                    type: "booking_cancelled",
                    url: notifUrl,
                    read: false,
                    createdAt: now,
                    expireAt: admin.firestore.Timestamp.fromDate(
                        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    ),
                });
            }

            // Push notification to booker
            await sendBookingPush(booking.bookedBy, {
                title: "Reserva cancelada",
                body: notifBody,
            }, notifUrl);
        }

        return { refunded, refundAmount };
    }
);

// ========================
// expirePendingBookings — cada 5 minutos
// ========================

export const expirePendingBookings = onSchedule(
    { schedule: "every 5 minutes", maxInstances: 1 },
    async () => {
        const now = nowISO();

        const expired = await db
            .collection("bookings")
            .where("status", "==", "pending_payment")
            .where("expiresAt", "<=", now)
            .get();

        if (expired.empty) {
            console.log("No expired pending bookings found");
            return;
        }

        const BATCH_LIMIT = 500;
        const docs = expired.docs;

        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const chunk = docs.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();

            for (const doc of chunk) {
                batch.update(doc.ref, {
                    status: "expired",
                    updatedAt: now,
                });
            }

            await batch.commit();
        }

        console.log(`Expired ${docs.length} pending bookings`);
    }
);

// ========================
// completePassedBookings — cada 30 minutos
// ========================

export const completePassedBookings = onSchedule(
    { schedule: "every 30 minutes", maxInstances: 1 },
    async () => {
        const now = new Date();
        const todayISO = now.toISOString().split("T")[0];
        const currentTime = now.toTimeString().substring(0, 5); // HH:mm
        const nowStr = nowISO();

        // Bookings confirmadas de hoy cuyo endTime ya pasó
        const todayPassed = await db
            .collection("bookings")
            .where("status", "==", "confirmed")
            .where("date", "==", todayISO)
            .get();

        const toComplete = todayPassed.docs.filter((doc) => {
            const b = doc.data();
            return b.endTime <= currentTime;
        });

        // Bookings confirmadas de días anteriores (siempre completar)
        const pastDays = await db
            .collection("bookings")
            .where("status", "==", "confirmed")
            .where("date", "<", todayISO)
            .get();

        const allToComplete = [...toComplete, ...pastDays.docs];

        if (allToComplete.length === 0) {
            console.log("No bookings to complete");
            return;
        }

        const BATCH_LIMIT = 500;

        for (let i = 0; i < allToComplete.length; i += BATCH_LIMIT) {
            const chunk = allToComplete.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();

            for (const doc of chunk) {
                batch.update(doc.ref, {
                    status: "completed",
                    updatedAt: nowStr,
                });
            }

            await batch.commit();
        }

        console.log(`Completed ${allToComplete.length} past bookings`);
    }
);
