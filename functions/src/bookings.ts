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

const NOTIFICATION_TTL_MS = 10 * 24 * 60 * 60 * 1000;

// Permanently invalid FCM error codes
const PERMANENT_ERROR_CODES = [
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
];

// ========================
// DURATION TIER HELPERS (inlined; mirror de lib/domain/venue.ts — functions/src es un módulo aislado)
// ========================

type DurationTier =
    | { minMinutes: number; percentOff: number; flatPriceCOP?: undefined }
    | { minMinutes: number; percentOff?: undefined; flatPriceCOP: number };

interface TierResult {
    finalCOP: number;
    discountCOP: number;
    appliedTier: DurationTier | null;
}

function findVenueFormatTiers(
    venue: FirebaseFirestore.DocumentData,
    formatId: string,
): DurationTier[] | undefined {
    const formats = venue.formats as Array<{ id: string; durationTiers?: DurationTier[] }> | undefined;
    if (!formats) return undefined;
    const vf = formats.find((f) => f.id === formatId);
    return vf?.durationTiers;
}

function applyDurationTier(
    subtotalCOP: number,
    durationMinutes: number,
    tiers?: DurationTier[],
): TierResult {
    if (!tiers || tiers.length === 0) {
        return { finalCOP: subtotalCOP, discountCOP: 0, appliedTier: null };
    }
    const eligible = tiers.filter((t) => durationMinutes >= t.minMinutes);
    if (eligible.length === 0) {
        return { finalCOP: subtotalCOP, discountCOP: 0, appliedTier: null };
    }
    const tier = eligible.reduce((best, t) => (t.minMinutes > best.minMinutes ? t : best));

    let finalCOP: number;
    if (tier.percentOff !== undefined) {
        const reduction = Math.round(subtotalCOP * tier.percentOff / 100);
        finalCOP = subtotalCOP - reduction;
    } else {
        finalCOP = tier.flatPriceCOP;
    }
    return { finalCOP, discountCOP: subtotalCOP - finalCOP, appliedTier: tier };
}

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

/**
 * Notifica a todos los admins de un venue (super_admin + location_admin asignados).
 * Crea notificación in-app + push para cada uno. Best-effort.
 */
async function notifyVenueAdmins(
    venueId: string,
    payload: { title: string; body: string; type: string; url: string },
): Promise<void> {
    try {
        // Buscar location admins asignados a este venue
        const locationAdminsSnap = await db
            .collection("users")
            .where("adminType", "==", "location_admin")
            .where("assignedLocationIds", "array-contains", venueId)
            .get();

        // Buscar super admins (global)
        const superAdminsSnap = await db
            .collection("users")
            .where("adminType", "==", "super_admin")
            .get();

        const adminUids = new Set<string>();
        locationAdminsSnap.docs.forEach((d) => adminUids.add(d.id));
        superAdminsSnap.docs.forEach((d) => adminUids.add(d.id));

        if (adminUids.size === 0) {
            console.log(`[notifyVenueAdmins] no admins for venue=${venueId}`);
            return;
        }

        const now = nowISO();
        const expireAt = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + NOTIFICATION_TTL_MS),
        );

        await Promise.all(
            Array.from(adminUids).map(async (uid) => {
                try {
                    await db.collection("notifications").doc(uid).collection("items").add({
                        title: payload.title,
                        body: payload.body,
                        type: payload.type,
                        url: payload.url,
                        read: false,
                        createdAt: now,
                        expireAt,
                    });
                } catch (err) {
                    console.error(`[notifyVenueAdmins] in-app fail uid=${uid}:`, err);
                }

                await sendBookingPush(uid, {
                    title: payload.title,
                    body: payload.body,
                }, payload.url);
            }),
        );
    } catch (err) {
        console.error("[notifyVenueAdmins] failed:", err);
    }
}

// ========================
// CONSTANTES
// ========================

const REFUND_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 horas

const MAX_PAYMENT_PROOF_ATTEMPTS = 3;

// ========================
// HELPERS
// ========================

function nowISO(): string {
    return new Date().toISOString();
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
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

        // Usa hora de Colombia (UTC-5, sin DST). Si usáramos toISOString() puro,
        // después de las 7pm hora local UTC ya pasó al día siguiente y las reservas
        // del mismo día se rechazarían como "fecha pasada".
        const todayISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" })
            .format(new Date());
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

        // ── ANTICIPACIÓN MÍNIMA EN FIN DE SEMANA (solo clientes) ──
        // Ref: docs/WEEKEND_LEAD_TIME_SDD.md
        // Config por sede (weekendMinLeadHours). 0/ausente = sin restricción.
        const weekendLeadHours: number = (() => {
            const raw = venue.weekendMinLeadHours;
            return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 0;
        })();
        if (weekendLeadHours > 0) {
            const dayOfWeekNum = new Date(date + "T12:00:00Z").getUTCDay(); // 0=Dom … 6=Sáb
            const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
            if (isWeekend) {
                // Colombia = UTC-5 (sin DST): epoch absoluto del inicio del slot.
                const slotStartMs = new Date(`${date}T${startTime}:00-05:00`).getTime();
                if (slotStartMs - Date.now() < weekendLeadHours * 60 * 60 * 1000) {
                    throw new HttpsError(
                        "failed-precondition",
                        `En fin de semana debes reservar con al menos ${weekendLeadHours} hora(s) de anticipación`,
                    );
                }
            }
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
        const subtotalCOP = pricePerSlotCOP * slotCount;

        // Aplicar tier de duración si el VenueFormat tiene durationTiers configurados.
        // El cliente puede mostrar el precio con descuento, pero el server siempre recomputa.
        const tierResult = applyDurationTier(
            subtotalCOP,
            requestedMinutes,
            findVenueFormatTiers(venue, format),
        );
        const totalPriceCOP = tierResult.finalCOP;
        const tierAppliedSnapshot = tierResult.appliedTier
            ? {
                minMinutes: tierResult.appliedTier.minMinutes,
                discountCOP: tierResult.discountCOP,
                ...(tierResult.appliedTier.percentOff !== undefined
                    ? { percentOff: tierResult.appliedTier.percentOff }
                    : { flatPriceCOP: tierResult.appliedTier.flatPriceCOP }),
            }
            : null;

        // Depósito (sobre el precio final, ya con tier aplicado)
        const depositRequired: boolean = venue.depositRequired ?? false;
        const depositPercent: number = venue.depositPercent ?? 0;
        const depositCOP = depositRequired
            ? Math.round(totalPriceCOP * depositPercent / 100)
            : 0;
        const remainingCOP = totalPriceCOP - depositCOP;

        // Nuevo flujo: pago externo verificado por admin (no debit wallet).
        // Si no se requiere depósito, va directo a confirmed con paymentMethod=on_site.
        const paymentMethod: string = depositRequired && depositCOP > 0
            ? "external_deposit"
            : "on_site";

        // TTL configurable por el venue (1-24h). Default 24h.
        const pendingApprovalTTLHours: number = (() => {
            const raw = venue.pendingApprovalTTLHours;
            if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 24) {
                return raw;
            }
            return 24;
        })();

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

        // ── TRANSACCIÓN: ASIGNAR + CREAR BOOKING (sin debit wallet) ──
        const bookingRef = db.collection("bookings").doc();
        const now = nowISO();

        // Estado inicial:
        //   - on_site (sin depósito) → directo a "confirmed" (igual que antes)
        //   - external_deposit → "pending_payment" con expiresAt = now + ttlHours
        const initialStatus: string = paymentMethod === "external_deposit"
            ? "pending_payment"
            : "confirmed";
        const expiresAtISO: string | null = paymentMethod === "external_deposit"
            ? new Date(Date.now() + pendingApprovalTTLHours * 60 * 60 * 1000).toISOString()
            : null;

        await db.runTransaction(async (transaction) => {
            // ── READS PRIMERO ──
            // Leer bookings existentes en este venue+fecha para detectar courts ocupados.
            // Incluye todos los estados que bloquean slot.
            const existingBookingsSnap = await db
                .collection("bookings")
                .where("venueId", "==", venueId)
                .where("date", "==", date)
                .where("status", "in", [
                    "pending_payment",
                    "pending_approval",
                    "deposit_confirmed",
                    "confirmed",
                    "played",
                ])
                .get();

            // Encontrar courts ocupados en el rango solicitado
            const occupiedCourtIds: string[] = [];
            for (const doc of existingBookingsSnap.docs) {
                const b = doc.data();
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

            // Resuelve el label del formato — preferencia: catálogo del venue (VenueFormat.label).
            // Fallback: jerarquía sencilla/doble/triple basada en cantidad de jugadores.
            const resolveFormatLabel = (): string => {
                const venueFormats = venue.formats as Array<{ id: string; label: string }> | undefined;
                if (venueFormats) {
                    const vf = venueFormats.find((f) => f.id === format);
                    if (vf?.label) return vf.label;
                }
                // Fallback: "sport_XvX" o "XvX" → tier
                const match = format.match(/^(?:[a-z]+_)?(\d+)v\d+$/);
                if (match) {
                    const perTeam = parseInt(match[1], 10);
                    if (perTeam <= 6) return "Cancha sencilla";
                    if (perTeam <= 9) return "Cancha doble";
                    return "Cancha triple";
                }
                return format;
            };
            const formatLabel = resolveFormatLabel();

            // ── WRITES ──
            const bookingData = {
                id: bookingRef.id,
                venueId,
                venueName: venue.name,
                venueAddress: venue.address,
                bookedBy: uid,
                bookedByName: user.name || "Usuario",
                bookedByPhotoURL: user.photoURL || null,
                bookedByPhone: user.phone || null,
                format,
                formatLabel,
                date,
                startTime,
                endTime,
                courtIds: allocation.courtIds,
                courtNames: allocation.courtNames,
                status: initialStatus,
                totalPriceCOP,
                depositPercent: depositRequired ? depositPercent : 0,
                depositCOP,
                remainingCOP,
                paymentMethod,
                paymentTxId: null,
                expiresAt: expiresAtISO,
                cancelledBy: null,
                cancelledAt: null,
                refundTxId: null,
                matchId: null,
                tierApplied: tierAppliedSnapshot,
                paymentProofURL: null,
                paymentProofUploadedAt: null,
                paymentProofHistory: [],
                lastRejectionReason: null,
                lastRejectionAt: null,
                approvedBy: null,
                approvedAt: null,
                attendanceConfirmedBy: null,
                attendanceConfirmedAt: null,
                createdAt: now,
                updatedAt: now,
            };

            transaction.set(bookingRef, bookingData);
        });

        // Notifications — best effort, outside transaction
        const formattedDate = (() => {
            const d = new Date(date + "T12:00:00");
            const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            return `${days[d.getDay()]} ${d.getDate()}`;
        })();
        const slotLine = `${formattedDate} ${fmt12h(startTime)} – ${fmt12h(endTime)}`;

        // Notificación al jugador — varía según estado inicial
        const playerNotifTitle = initialStatus === "pending_payment"
            ? "Reserva creada — pendiente de pago"
            : "Reserva confirmada";
        const playerNotifBody = initialStatus === "pending_payment"
            ? `${venue.name} · ${slotLine}. Envía el comprobante de tu abono para confirmar.`
            : `${venue.name} · ${slotLine}`;
        const playerNotifType = initialStatus === "pending_payment"
            ? "booking_pending_payment"
            : "booking_confirmed";
        const playerNotifUrl = `/bookings/${bookingRef.id}`;

        try {
            await db.collection("notifications").doc(uid).collection("items").add({
                title: playerNotifTitle,
                body: playerNotifBody,
                type: playerNotifType,
                url: playerNotifUrl,
                read: false,
                createdAt: now,
                expireAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + NOTIFICATION_TTL_MS)
                ),
            });
        } catch (err) {
            console.error("[BookingNotif] failed to write player in-app notification:", err);
        }

        await sendBookingPush(uid, {
            title: playerNotifTitle,
            body: playerNotifBody,
        }, playerNotifUrl);

        // Notificación a admins del venue si la reserva quedó pendiente de pago
        if (initialStatus === "pending_payment") {
            const adminUrl = `/venues/admin/${venueId}?tab=pending`;
            await notifyVenueAdmins(venueId, {
                title: "Nueva reserva pendiente de pago",
                body: `${user.name || "Un usuario"} · ${slotLine}`,
                type: "booking_admin_pending_payment",
                url: adminUrl,
            });
        }

        return {
            bookingId: bookingRef.id,
            depositCOP,
            remainingCOP,
            totalPriceCOP,
            status: initialStatus,
            expiresAt: expiresAtISO,
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
        const rawReason = (request.data.reason as string | undefined) ?? "";
        const reason = rawReason.trim();

        if (!bookingId) {
            throw new HttpsError("invalid-argument", "bookingId es requerido");
        }
        if (reason.length < 5) {
            throw new HttpsError("invalid-argument", "El motivo debe tener al menos 5 caracteres");
        }
        if (reason.length > 500) {
            throw new HttpsError("invalid-argument", "El motivo no puede superar 500 caracteres");
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();
        let refunded = false;
        let refundAmount = 0;
        let actorRole: "player" | "admin" = "player";

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
                actorRole = "admin";
            }

            // Se puede cancelar desde cualquier estado pre-juego o desde played
            // (post-paid o terminales como cancelled/expired/no_show no se tocan)
            const cancellableStates = new Set([
                "pending_payment",
                "pending_approval",
                "deposit_confirmed",
                "confirmed",
                "played",
            ]);
            if (!cancellableStates.has(booking.status)) {
                throw new HttpsError("failed-precondition", "La reserva no se puede cancelar en su estado actual");
            }

            // Determinar si tiene reembolso
            const depositCOP: number = booking.depositCOP || 0;
            const shouldRefund = depositCOP > 0 && booking.paymentMethod === "wallet_deposit";

            // Admin que cancela siempre fuerza reembolso (no es culpa del jugador).
            // Jugador respeta regla 24h.
            let isRefundable = false;
            if (shouldRefund) {
                if (actorRole === "admin") {
                    isRefundable = true;
                } else {
                    const slotMs = new Date(`${booking.date}T${booking.startTime}:00`).getTime();
                    const deadlineMs = slotMs - REFUND_DEADLINE_MS;
                    isRefundable = Date.now() < deadlineMs;
                }
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
                cancelledByRole: actorRole,
                cancellationReason: reason,
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
            const refundLine = refunded
                ? ` Tu depósito de ${formatCOPLabel(refundAmount)} fue reembolsado.`
                : "";
            const reasonLine = !isSelfCancel ? ` Motivo: ${reason}` : "";
            const notifBody = `Tu reserva en ${booking.venueName} fue cancelada.${refundLine}${reasonLine}`;
            const notifUrl = refunded ? "/wallet" : `/bookings/${bookingId}`;

            if (!isSelfCancel) {
                // Admin canceló — notificación in-app
                await db.collection("notifications").doc(booking.bookedBy).collection("items").add({
                    title: "Reserva cancelada por admin",
                    body: notifBody,
                    type: "booking_cancelled_by_admin",
                    url: notifUrl,
                    read: false,
                    createdAt: now,
                    expireAt: admin.firestore.Timestamp.fromDate(
                        new Date(Date.now() + NOTIFICATION_TTL_MS)
                    ),
                });
            }

            // Push notification to booker (best effort)
            try {
                await sendBookingPush(booking.bookedBy, {
                    title: isSelfCancel ? "Reserva cancelada" : "Reserva cancelada por admin",
                    body: notifBody,
                }, notifUrl);
            } catch (err) {
                console.warn("Failed to send cancellation push", err);
            }
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

// ========================
// uploadPaymentProof — onCall
// ========================
// El cliente sube primero el archivo a Storage (con compresión y reglas que
// validan tamaño/tipo), luego llama esta función con la URL para mover el
// estado a "pending_approval" y disparar notificación al admin.

export const uploadPaymentProof = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const uid = request.auth.uid;
        const { bookingId, proofURL } = request.data as { bookingId: string; proofURL: string };

        if (!bookingId || !proofURL) {
            throw new HttpsError("invalid-argument", "bookingId y proofURL son requeridos");
        }
        if (typeof proofURL !== "string" || !proofURL.startsWith("http")) {
            throw new HttpsError("invalid-argument", "proofURL inválida");
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();
        let venueIdForNotif: string | null = null;
        let bookerName = "Un usuario";
        let slotLine = "";

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(bookingRef);
            if (!snap.exists) {
                throw new HttpsError("not-found", "La reserva no existe");
            }
            const booking = snap.data()!;

            if (booking.bookedBy !== uid) {
                throw new HttpsError("permission-denied", "No es tu reserva");
            }
            if (booking.status !== "pending_payment") {
                throw new HttpsError("failed-precondition", "La reserva no está pendiente de pago");
            }
            const expiresAt: string | undefined = booking.expiresAt;
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
                throw new HttpsError("failed-precondition", "La reserva expiró");
            }
            const history: unknown[] = Array.isArray(booking.paymentProofHistory) ? booking.paymentProofHistory : [];
            if (history.length >= MAX_PAYMENT_PROOF_ATTEMPTS) {
                throw new HttpsError("failed-precondition", "Se agotaron los intentos de comprobante");
            }

            venueIdForNotif = booking.venueId;
            bookerName = booking.bookedByName || bookerName;
            const d = new Date(booking.date + "T12:00:00");
            const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            slotLine = `${booking.venueName} · ${days[d.getDay()]} ${d.getDate()} ${fmt12h(booking.startTime)}`;

            tx.update(bookingRef, {
                status: "pending_approval",
                paymentProofURL: proofURL,
                paymentProofUploadedAt: now,
                // Una vez subido el comprobante, el TTL no cuenta más — queda en manos del admin
                expiresAt: null,
                updatedAt: now,
            });
        });

        // Notificar a admins del venue
        if (venueIdForNotif) {
            await notifyVenueAdmins(venueIdForNotif, {
                title: "Comprobante listo para revisar",
                body: `${bookerName} subió comprobante · ${slotLine}`,
                type: "booking_admin_proof_ready",
                url: `/venues/admin/${venueIdForNotif}?tab=pending`,
            });
        }

        return { status: "pending_approval" as const };
    },
);

// ========================
// HELPER — verificar admin del venue
// ========================
async function assertVenueAdmin(authUid: string, venueId: string): Promise<"super_admin" | "location_admin"> {
    const userDoc = await db.collection("users").doc(authUid).get();
    const userData = userDoc.data();
    if (userData?.adminType === "super_admin") return "super_admin";
    if (userData?.adminType === "location_admin" && Array.isArray(userData?.assignedLocationIds) && userData.assignedLocationIds.includes(venueId)) {
        return "location_admin";
    }
    throw new HttpsError("permission-denied", "No tienes permisos sobre esta sede");
}

// ========================
// approveBookingDeposit — onCall
// ========================
// Admin aprueba el abono: status pending_approval → deposit_confirmed.

export const approveBookingDeposit = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const adminUid = request.auth.uid;
        const { bookingId } = request.data as { bookingId: string };
        if (!bookingId) {
            throw new HttpsError("invalid-argument", "bookingId es requerido");
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();
        let bookerUid = "";
        let venueName = "";
        let slotLine = "";

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(bookingRef);
            if (!snap.exists) throw new HttpsError("not-found", "La reserva no existe");
            const booking = snap.data()!;
            await assertVenueAdmin(adminUid, booking.venueId);
            if (booking.status !== "pending_approval") {
                throw new HttpsError("failed-precondition", "La reserva ya fue gestionada o no está pendiente de aprobación");
            }

            bookerUid = booking.bookedBy;
            venueName = booking.venueName;
            const d = new Date(booking.date + "T12:00:00");
            const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            slotLine = `${days[d.getDay()]} ${d.getDate()} ${fmt12h(booking.startTime)}`;

            tx.update(bookingRef, {
                status: "deposit_confirmed",
                approvedBy: adminUid,
                approvedAt: now,
                updatedAt: now,
            });
        });

        // Notificar al jugador
        try {
            await db.collection("notifications").doc(bookerUid).collection("items").add({
                title: "Abono verificado",
                body: `Tu abono en ${venueName} fue aprobado · ${slotLine}`,
                type: "booking_deposit_approved",
                url: `/bookings/${bookingId}`,
                read: false,
                createdAt: now,
                expireAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + NOTIFICATION_TTL_MS),
                ),
            });
        } catch (err) {
            console.error("[approveBookingDeposit] in-app notif fail:", err);
        }
        await sendBookingPush(bookerUid, {
            title: "Abono verificado",
            body: `Tu abono en ${venueName} fue aprobado.`,
        }, `/bookings/${bookingId}`);

        return { status: "deposit_confirmed" as const };
    },
);

// ========================
// confirmBookingAttendance — onCall
// ========================
// Admin confirma asistencia: deposit_confirmed → confirmed.

export const confirmBookingAttendance = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const adminUid = request.auth.uid;
        const { bookingId } = request.data as { bookingId: string };
        if (!bookingId) {
            throw new HttpsError("invalid-argument", "bookingId es requerido");
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();
        let bookerUid = "";
        let venueName = "";

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(bookingRef);
            if (!snap.exists) throw new HttpsError("not-found", "La reserva no existe");
            const booking = snap.data()!;
            await assertVenueAdmin(adminUid, booking.venueId);
            if (booking.status !== "deposit_confirmed") {
                throw new HttpsError("failed-precondition", "La reserva no está en estado para confirmar asistencia");
            }

            bookerUid = booking.bookedBy;
            venueName = booking.venueName;

            tx.update(bookingRef, {
                status: "confirmed",
                attendanceConfirmedBy: adminUid,
                attendanceConfirmedAt: now,
                updatedAt: now,
            });
        });

        try {
            await db.collection("notifications").doc(bookerUid).collection("items").add({
                title: "Reserva confirmada",
                body: `${venueName}: tu reserva está confirmada.`,
                type: "booking_confirmed",
                url: `/bookings/${bookingId}`,
                read: false,
                createdAt: now,
                expireAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + NOTIFICATION_TTL_MS),
                ),
            });
        } catch (err) {
            console.error("[confirmBookingAttendance] in-app notif fail:", err);
        }
        await sendBookingPush(bookerUid, {
            title: "Reserva confirmada",
            body: `${venueName}: tu reserva está confirmada.`,
        }, `/bookings/${bookingId}`);

        return { status: "confirmed" as const };
    },
);

// ========================
// rejectPaymentProof — onCall
// ========================
// Admin rechaza el comprobante. Vuelve a pending_payment con nuevo TTL.
// Al 3er intento rechazado, marca como expired y libera la cancha.

export const rejectPaymentProof = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const adminUid = request.auth.uid;
        const { bookingId, reason } = request.data as { bookingId: string; reason: string };

        if (!bookingId) {
            throw new HttpsError("invalid-argument", "bookingId es requerido");
        }
        const trimmedReason = (reason ?? "").trim();
        if (trimmedReason.length < 5 || trimmedReason.length > 500) {
            throw new HttpsError("invalid-argument", "El motivo debe tener entre 5 y 500 caracteres");
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();
        let bookerUid = "";
        let venueName = "";
        let venueId = "";
        type RejectionResultStatus = "pending_payment" | "expired";
        let nextStatus = "pending_payment" as RejectionResultStatus;
        let attemptsRemaining = 0;

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(bookingRef);
            if (!snap.exists) throw new HttpsError("not-found", "La reserva no existe");
            const booking = snap.data()!;
            await assertVenueAdmin(adminUid, booking.venueId);
            if (booking.status !== "pending_approval") {
                throw new HttpsError("failed-precondition", "La reserva no está en estado para rechazar comprobante");
            }

            bookerUid = booking.bookedBy;
            venueName = booking.venueName;
            venueId = booking.venueId;

            const history = Array.isArray(booking.paymentProofHistory) ? [...booking.paymentProofHistory] : [];
            history.push({
                url: booking.paymentProofURL || "",
                uploadedAt: booking.paymentProofUploadedAt || now,
                rejectedAt: now,
                rejectionReason: trimmedReason,
            });

            // TTL configurable del venue
            const venueSnap = await tx.get(db.collection("venues").doc(booking.venueId));
            const ttlHours: number = (() => {
                const raw = venueSnap.data()?.pendingApprovalTTLHours;
                if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 24) return raw;
                return 24;
            })();

            if (history.length >= MAX_PAYMENT_PROOF_ATTEMPTS) {
                nextStatus = "expired";
                attemptsRemaining = 0;
                tx.update(bookingRef, {
                    status: "expired",
                    paymentProofURL: null,
                    paymentProofUploadedAt: null,
                    paymentProofHistory: history,
                    lastRejectionReason: trimmedReason,
                    lastRejectionAt: now,
                    expiresAt: null,
                    updatedAt: now,
                });
            } else {
                nextStatus = "pending_payment";
                attemptsRemaining = MAX_PAYMENT_PROOF_ATTEMPTS - history.length;
                const newExpiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
                tx.update(bookingRef, {
                    status: "pending_payment",
                    paymentProofURL: null,
                    paymentProofUploadedAt: null,
                    paymentProofHistory: history,
                    lastRejectionReason: trimmedReason,
                    lastRejectionAt: now,
                    expiresAt: newExpiresAt,
                    updatedAt: now,
                });
            }
        });

        // Notificar al jugador
        const notifTitle = nextStatus === "expired"
            ? "Reserva cancelada"
            : "Comprobante rechazado";
        const notifBody = nextStatus === "expired"
            ? `${venueName}: se alcanzó el máximo de intentos. Motivo: ${trimmedReason}`
            : `${venueName}: ${trimmedReason}. Podés intentar nuevamente.`;
        try {
            await db.collection("notifications").doc(bookerUid).collection("items").add({
                title: notifTitle,
                body: notifBody,
                type: nextStatus === "expired" ? "booking_expired_max_rejections" : "booking_proof_rejected",
                url: `/bookings/${bookingId}`,
                read: false,
                createdAt: now,
                expireAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + NOTIFICATION_TTL_MS),
                ),
            });
        } catch (err) {
            console.error("[rejectPaymentProof] in-app notif fail:", err);
        }
        await sendBookingPush(bookerUid, {
            title: notifTitle,
            body: notifBody,
        }, `/bookings/${bookingId}`);

        // venueId disponible para futuras hooks; por ahora silenciamos lint:
        void venueId;

        return { status: nextStatus, attemptsRemaining };
    },
);

// ========================
// advanceBookingStatus — onCall
// ========================
// Admin avanza ciclo post-aprobación: confirmed → played → paid, o → no_show.
// Permite rollback (paid → played, played → confirmed) para corrección admin.

// Estados a los que admin puede transicionar manualmente (incluye rollback a deposit_confirmed).
const ADMIN_PICKER_STATUSES = new Set(["deposit_confirmed", "confirmed", "played", "paid", "no_show"]);
const ADMIN_FROM_STATUSES = new Set(["deposit_confirmed", "confirmed", "played", "paid", "no_show"]);

export const advanceBookingStatus = onCall(
    { maxInstances: 10 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión");
        }
        const adminUid = request.auth.uid;
        const { bookingId, nextStatus } = request.data as {
            bookingId: string;
            nextStatus: string;
        };
        if (!bookingId || !nextStatus) {
            throw new HttpsError("invalid-argument", "bookingId y nextStatus son requeridos");
        }
        if (!ADMIN_PICKER_STATUSES.has(nextStatus)) {
            throw new HttpsError("invalid-argument", `nextStatus inválido: ${nextStatus}`);
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const now = nowISO();

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(bookingRef);
            if (!snap.exists) throw new HttpsError("not-found", "La reserva no existe");
            const booking = snap.data()!;
            await assertVenueAdmin(adminUid, booking.venueId);

            if (!ADMIN_FROM_STATUSES.has(booking.status)) {
                throw new HttpsError(
                    "failed-precondition",
                    `No se puede avanzar desde estado ${booking.status}`,
                );
            }
            if (booking.status === nextStatus) {
                throw new HttpsError("failed-precondition", "La reserva ya está en ese estado");
            }

            tx.update(bookingRef, {
                status: nextStatus,
                updatedAt: now,
            });
        });

        return { status: nextStatus };
    },
);
