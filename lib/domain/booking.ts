/**
 * ========================
 * BOOKING DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 *      docs/RESERVAS_PAGO_EXTERNO_SDD.md
 *
 * Modelo de dominio para reservas de canchas.
 * Tipos puros, helpers y validaciones — sin Firebase, sin React.
 *
 * ESPECIFICACIÓN:
 * - El abono se paga externamente (Nequi/Bancolombia/transferencia) y se aprueba por admin
 * - Ciclo: pending_payment → pending_approval → deposit_confirmed → confirmed → played → paid
 * - Cancelación de reservas legacy (paymentMethod=wallet_deposit) sigue con reembolso
 *   wallet si > 24h. Reservas nuevas (external_deposit) cancelan sin reembolso (el abono
 *   se paga/restituye fuera del app).
 * - Reservas pending_payment expiran al cumplir el TTL configurado por el venue (1-24h).
 */

import { ValidationError } from "./errors";
import { REFUND_DEADLINE_MS } from "./wallet";

// ========================
// TIPOS
// ========================

export type BookingStatus =
    // Pre-juego (gestión financiera del abono)
    | "pending_payment"      // Creada, esperando comprobante del jugador
    | "pending_approval"     // Comprobante subido, esperando verificación del admin
    | "deposit_confirmed"    // Admin aprobó el abono; falta confirmar asistencia con el cliente
    | "confirmed"            // Asistencia confirmada con el cliente, lista para jugarse
    // Post-juego (ciclo financiero igual a reservas manuales)
    | "played"               // El partido se jugó (admin lo marca)
    | "paid"                 // Admin cobró el resto en sede (cierra ciclo)
    // Terminales negativos
    | "no_show"              // Confirmó pero no asistió
    | "cancelled"            // Cancelada por jugador o admin (motivo obligatorio)
    | "expired"              // TTL expiró sin subir comprobante o 3 rechazos
    // Legacy (cron viejo, bookings pre-SDD pago externo)
    | "completed";

export type BookingPaymentMethod =
    | "wallet_deposit"   // LEGACY: bookings pre-SDD pago externo
    | "external_deposit" // NUEVO: abono pagado externamente y verificado por admin
    | "on_site"          // Sin depósito requerido (pago completo en sede)
    | "free";

/** Origen de la reserva — para badges visuales. */
export type BookingOrigin = "player" | "admin";

/**
 * Snapshot del tier de duración aplicado en el momento de crear el booking.
 * Permite auditar y mostrar el desglose, sin recomputar nada (los tiers pueden cambiar).
 */
export interface BookingTierApplied {
    minMinutes: number;
    percentOff?: number;
    flatPriceCOP?: number;
    discountCOP: number;  // subtotal − final, siempre presente
}

export interface Booking {
    id: string;
    venueId: string;
    venueName: string;
    venueAddress: string;
    bookedBy: string;
    bookedByName: string;
    bookedByPhotoURL?: string;
    /** VenueFormat.id o legacy CourtFormat string ("5v5", "6v6"…). */
    format: string;
    date: string;
    startTime: string;
    endTime: string;
    courtIds: string[];
    courtNames: string[];
    status: BookingStatus;
    totalPriceCOP: number;
    depositPercent: number;
    depositCOP: number;
    remainingCOP: number;
    paymentMethod: BookingPaymentMethod;
    paymentTxId?: string;
    expiresAt?: string;
    cancelledBy?: string;
    cancelledAt?: string;
    cancelledByRole?: BookingCancelRole;
    cancellationReason?: string;
    refundTxId?: string;
    matchId?: string;
    tierApplied?: BookingTierApplied;

    // ── Pago externo (nuevo flujo) ──
    /** URL del comprobante actual subido por el jugador. */
    paymentProofURL?: string | null;
    paymentProofUploadedAt?: string | null;
    /** Historial de comprobantes rechazados (max MAX_PAYMENT_PROOF_ATTEMPTS - 1). */
    paymentProofHistory?: PaymentProofAttempt[];
    /** Motivo del último rechazo, visible al jugador. */
    lastRejectionReason?: string | null;
    lastRejectionAt?: string | null;
    /** uid del admin que aprobó el abono (deposit_confirmed). */
    approvedBy?: string | null;
    approvedAt?: string | null;
    /** uid del admin que confirmó asistencia (confirmed). */
    attendanceConfirmedBy?: string | null;
    attendanceConfirmedAt?: string | null;

    createdAt: string;
    updatedAt: string;
}

export type BookingCancelRole = "player" | "admin";

export interface PaymentProofAttempt {
    /** URL del comprobante (puede ser inaccesible tras lifecycle de 90 días). */
    url: string;
    uploadedAt: string;
    rejectedAt: string;
    rejectionReason: string;
}

export interface CreateBookingInput {
    venueId: string;
    /** VenueFormat.id o legacy CourtFormat string. */
    format: string;
    date: string;
    startTime: string;
    endTime: string;
}

// ========================
// CONSTANTES
// ========================

/** TTL de reserva pendiente de pago (legacy wallet_deposit): 15 minutos */
export const BOOKING_PAYMENT_TTL_MS = 15 * 60 * 1000;

/** Default de TTL para nuevas reservas con pago externo: 24h. */
export const DEFAULT_PENDING_APPROVAL_TTL_HOURS = 24;

/** Mín/máx del TTL configurable por venue. */
export const MIN_PENDING_APPROVAL_TTL_HOURS = 1;
export const MAX_PENDING_APPROVAL_TTL_HOURS = 24;

/** Máximo de intentos de comprobante por reserva antes de marcar como expired. */
export const MAX_PAYMENT_PROOF_ATTEMPTS = 3;

/** Tamaño máximo del comprobante tras compresión (500 KB). */
export const MAX_PAYMENT_PROOF_BYTES = 500 * 1024;

/** Estados pre-juego en los que la reserva bloquea slot pero aún no se cobró el resto en sede. */
export const PRE_GAME_ACTIVE_STATUSES: BookingStatus[] = [
    "pending_payment",
    "pending_approval",
    "deposit_confirmed",
    "confirmed",
];

/** Estados que aparecen en la lista por hora del admin (bloquean slot). */
export const SLOT_BLOCKING_STATUSES: BookingStatus[] = [
    "pending_payment",
    "pending_approval",
    "deposit_confirmed",
    "confirmed",
    "played",
];

/** Estados terminales (no aparecen en lista por hora, slot liberado o ciclo cerrado). */
export const BOOKING_TERMINAL_STATUSES: BookingStatus[] = [
    "paid",
    "no_show",
    "cancelled",
    "expired",
    "completed",
];

/** Sugerencias rápidas para cancelación del jugador. "Otro" deja el textarea vacío. */
export const PLAYER_CANCEL_SUGGESTIONS: readonly string[] = [
    "No puedo asistir",
    "Cambio de planes",
    "Encontré otro horario",
    "Lesión o enfermedad",
];

/** Sugerencias rápidas para cancelación del admin. */
export const ADMIN_CANCEL_SUGGESTIONS: readonly string[] = [
    "Mantenimiento de la cancha",
    "Evento privado",
    "Cancha no disponible",
    "Solicitud del cliente",
];

/** Longitud mínima del motivo de cancelación. */
export const CANCEL_REASON_MIN_LENGTH = 5;
export const CANCEL_REASON_MAX_LENGTH = 500;

// ========================
// HELPERS PUROS
// ========================

/**
 * Determina si el depósito de una reserva es reembolsable.
 * Regla: reembolsable si faltan más de 24 horas para el inicio del slot.
 */
export function isBookingRefundable(
    date: string,
    startTime: string,
    nowMs: number = Date.now(),
): boolean {
    const slotMs = new Date(`${date}T${startTime}:00`).getTime();
    const deadlineMs = slotMs - REFUND_DEADLINE_MS;
    return nowMs < deadlineMs;
}

/**
 * Determina si una reserva pending_payment ha expirado.
 */
export function isBookingExpired(expiresAt: string | undefined, nowMs: number = Date.now()): boolean {
    if (!expiresAt) return false;
    return nowMs >= new Date(expiresAt).getTime();
}

/**
 * Label en español para cada estado de reserva.
 */
export function bookingStatusLabel(status: BookingStatus): string {
    const labels: Record<BookingStatus, string> = {
        pending_payment: "Pendiente de pago",
        pending_approval: "Por aprobar pago",
        deposit_confirmed: "Abono confirmado",
        confirmed: "Confirmada",
        played: "Jugada",
        paid: "Pagada",
        completed: "Completada",
        cancelled: "Cancelada",
        expired: "Expirada",
        no_show: "No asistió",
    };
    return labels[status];
}

/**
 * Color asociado a cada estado de reserva (para badges).
 * Valores semánticos — la UI mapea a clases tailwind.
 */
export function bookingStatusColor(status: BookingStatus): string {
    const colors: Record<BookingStatus, string> = {
        pending_payment: "yellow",
        pending_approval: "orange",
        deposit_confirmed: "blue",
        confirmed: "green",
        played: "indigo",
        paid: "purple",
        completed: "blue",
        cancelled: "red",
        expired: "gray",
        no_show: "orange",
    };
    return colors[status];
}

/**
 * Devuelve true si la reserva sigue ocupando un slot (visible en calendario por hora).
 */
export function isBookingBlockingSlot(status: BookingStatus): boolean {
    return SLOT_BLOCKING_STATUSES.includes(status);
}

/**
 * Devuelve true si la reserva está activa pre-juego.
 */
export function isBookingPreGame(status: BookingStatus): boolean {
    return PRE_GAME_ACTIVE_STATUSES.includes(status);
}

/**
 * Calcula el precio total para slots consecutivos.
 * pricePerSlotCOP × slotCount.
 */
export function calcTotalPrice(pricePerSlotCOP: number, slotCount: number): number {
    return pricePerSlotCOP * slotCount;
}

/**
 * Calcula la fecha/hora de expiración de una reserva pending_payment.
 */
export function calcBookingExpiration(createdAtISO: string): string {
    const expiresMs = new Date(createdAtISO).getTime() + BOOKING_PAYMENT_TTL_MS;
    return new Date(expiresMs).toISOString();
}

/**
 * Calcula los milisegundos restantes antes de que expire una reserva.
 * Retorna 0 si ya expiró.
 */
export function msUntilExpiration(expiresAt: string, nowMs: number = Date.now()): number {
    const expiresMs = new Date(expiresAt).getTime();
    return Math.max(0, expiresMs - nowMs);
}

/**
 * Calcula la cantidad de slots consecutivos entre startTime y endTime
 * dado un slotDuration en minutos.
 */
export function calcSlotCount(startTime: string, endTime: string, slotDurationMinutes: number): number {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return Math.max(1, Math.floor(totalMinutes / slotDurationMinutes));
}

// ========================
// VALIDACIONES
// ========================

export function validateBookingInput(data: CreateBookingInput): void {
    if (!data.venueId) {
        throw new ValidationError("La sede es obligatoria");
    }

    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        throw new ValidationError("La fecha es inválida (formato YYYY-MM-DD)");
    }

    if (!data.startTime || !/^\d{2}:\d{2}$/.test(data.startTime)) {
        throw new ValidationError("La hora de inicio es inválida (formato HH:mm)");
    }

    if (!data.endTime || !/^\d{2}:\d{2}$/.test(data.endTime)) {
        throw new ValidationError("La hora de fin es inválida (formato HH:mm)");
    }

    if (data.startTime >= data.endTime) {
        throw new ValidationError("La hora de inicio debe ser anterior a la hora de fin");
    }

    if (!data.format) {
        throw new ValidationError("El formato es obligatorio");
    }
}

/**
 * Valida que la fecha no sea en el pasado.
 */
export function validateBookingDate(date: string, todayISO: string): void {
    if (date < todayISO) {
        throw new ValidationError("No se puede reservar en una fecha pasada");
    }
}

/**
 * Valida el motivo de cancelación: requerido, length entre MIN y MAX.
 */
export function validateCancellationReason(reason: string): void {
    const trimmed = (reason ?? "").trim();
    if (trimmed.length < CANCEL_REASON_MIN_LENGTH) {
        throw new ValidationError(`El motivo debe tener al menos ${CANCEL_REASON_MIN_LENGTH} caracteres`);
    }
    if (trimmed.length > CANCEL_REASON_MAX_LENGTH) {
        throw new ValidationError(`El motivo no puede superar ${CANCEL_REASON_MAX_LENGTH} caracteres`);
    }
}

// ========================
// VALIDACIONES PAGO EXTERNO
// ========================

/**
 * Valida el TTL configurable de pendientes (1-24h).
 */
export function validatePendingApprovalTTL(hours: number): void {
    if (!Number.isFinite(hours) || !Number.isInteger(hours)) {
        throw new ValidationError("El TTL debe ser un número entero de horas");
    }
    if (hours < MIN_PENDING_APPROVAL_TTL_HOURS || hours > MAX_PENDING_APPROVAL_TTL_HOURS) {
        throw new ValidationError(
            `El TTL debe estar entre ${MIN_PENDING_APPROVAL_TTL_HOURS} y ${MAX_PENDING_APPROVAL_TTL_HOURS} horas`,
        );
    }
}

/**
 * Calcula la fecha de expiración a partir de horas configurables.
 */
export function calcPendingExpiration(createdAtISO: string, ttlHours: number): string {
    const expiresMs = new Date(createdAtISO).getTime() + ttlHours * 60 * 60 * 1000;
    return new Date(expiresMs).toISOString();
}

/**
 * Cuenta los intentos previos rechazados de comprobante para una reserva.
 */
export function getPaymentProofAttemptCount(history?: PaymentProofAttempt[]): number {
    return (history ?? []).length;
}

/**
 * ¿Quedan intentos disponibles para subir comprobante?
 */
export function hasRemainingProofAttempts(history?: PaymentProofAttempt[]): boolean {
    return getPaymentProofAttemptCount(history) < MAX_PAYMENT_PROOF_ATTEMPTS;
}

// ========================
// HELPERS DE TRANSICIÓN DE ESTADO
// ========================

/**
 * Devuelve true si el booking está en un estado donde el jugador puede subir comprobante.
 */
export function canUploadPaymentProof(booking: Pick<Booking, "status" | "paymentProofHistory" | "expiresAt">, nowMs: number = Date.now()): boolean {
    if (booking.status !== "pending_payment") return false;
    if (!hasRemainingProofAttempts(booking.paymentProofHistory)) return false;
    if (isBookingExpired(booking.expiresAt ?? undefined, nowMs)) return false;
    return true;
}

/**
 * Devuelve true si el admin puede aprobar el abono de esta reserva.
 */
export function canApproveBookingDeposit(booking: Pick<Booking, "status">): boolean {
    return booking.status === "pending_approval";
}

/**
 * Devuelve true si el admin puede rechazar el comprobante.
 */
export function canRejectPaymentProof(booking: Pick<Booking, "status">): boolean {
    return booking.status === "pending_approval";
}

/**
 * Devuelve true si el admin puede confirmar asistencia (deposit_confirmed → confirmed).
 */
export function canConfirmAttendance(booking: Pick<Booking, "status">): boolean {
    return booking.status === "deposit_confirmed";
}

/**
 * Próximo status del avance manual del admin (post-juego).
 * confirmed → played → paid. Cualquier otro estado: null.
 */
export function getNextBookingStatus(current: BookingStatus): BookingStatus | null {
    if (current === "confirmed") return "played";
    if (current === "played") return "paid";
    return null;
}

/**
 * Label del próximo avance, para botones tipo "Marcar X".
 */
export function nextBookingStatusActionLabel(current: BookingStatus): string | null {
    const next = getNextBookingStatus(current);
    if (!next) return null;
    if (next === "played") return "Marcar jugada";
    if (next === "paid") return "Marcar pagada";
    return null;
}

/**
 * Estados a los que un admin puede transicionar directamente (avance + terminales).
 * Útil para popovers tipo "Cambiar estado".
 */
export const ADMIN_BOOKING_STATUS_PICKER: BookingStatus[] = [
    "confirmed",
    "played",
    "paid",
    "no_show",
];

/**
 * Valida que una transición de estado sea legal para el ciclo post-aprobación.
 * Permite transiciones lineales (confirmed → played → paid) y terminales (→ no_show).
 * Rollback (paid → played) está permitido para corrección de errores admin.
 */
export function isValidAdminStatusTransition(from: BookingStatus, to: BookingStatus): boolean {
    if (from === to) return false;
    // Solo se puede operar sobre estados post-aprobación
    const allowedFrom: BookingStatus[] = ["deposit_confirmed", "confirmed", "played", "paid", "no_show"];
    if (!allowedFrom.includes(from)) return false;
    if (!ADMIN_BOOKING_STATUS_PICKER.includes(to)) return false;
    return true;
}
