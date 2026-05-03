/**
 * ========================
 * BOOKING DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 *
 * Modelo de dominio para reservas de canchas.
 * Tipos puros, helpers y validaciones — sin Firebase, sin React.
 *
 * ESPECIFICACIÓN:
 * - Una reserva tiene venue, formato, fecha, horario y courts asignados automáticamente
 * - El depósito es un porcentaje (20-50%) del precio total, configurable por el admin
 * - Cancelación con reembolso de depósito solo si faltan > 24h para el slot
 * - Reservas pending_payment expiran en 15 minutos
 */

import { ValidationError } from "./errors";
import { REFUND_DEADLINE_MS } from "./wallet";
import type { CourtFormat } from "./venue";

// ========================
// TIPOS
// ========================

export type BookingStatus =
    | "pending_payment"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "expired"
    | "no_show";

export type BookingPaymentMethod = "wallet_deposit" | "on_site" | "free";

export interface Booking {
    id: string;
    venueId: string;
    venueName: string;
    venueAddress: string;
    bookedBy: string;
    bookedByName: string;
    bookedByPhotoURL?: string;
    format: CourtFormat;
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
    createdAt: string;
    updatedAt: string;
}

export type BookingCancelRole = "player" | "admin";

export interface CreateBookingInput {
    venueId: string;
    format: CourtFormat;
    date: string;
    startTime: string;
    endTime: string;
}

// ========================
// CONSTANTES
// ========================

/** TTL de reserva pendiente de pago: 15 minutos */
export const BOOKING_PAYMENT_TTL_MS = 15 * 60 * 1000;

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
        confirmed: "Confirmada",
        completed: "Completada",
        cancelled: "Cancelada",
        expired: "Expirada",
        no_show: "No asistió",
    };
    return labels[status];
}

/**
 * Color asociado a cada estado de reserva (para badges).
 */
export function bookingStatusColor(status: BookingStatus): string {
    const colors: Record<BookingStatus, string> = {
        pending_payment: "yellow",
        confirmed: "green",
        completed: "blue",
        cancelled: "red",
        expired: "gray",
        no_show: "orange",
    };
    return colors[status];
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
