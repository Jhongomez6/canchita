/**
 * ========================
 * VENUE DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 *
 * Modelo de dominio para sedes deportivas.
 * Tipos puros, helpers y validaciones — sin Firebase, sin React.
 *
 * ESPECIFICACIÓN:
 * - Una sede tiene canchas físicas (courts) que pueden combinarse en formatos mayores
 * - Los horarios se definen por día de la semana con slots y precios por formato
 * - El depósito es un porcentaje configurable entre 20% y 50% del precio total
 */

import { ValidationError } from "./errors";

// ========================
// TIPOS
// ========================

export type CourtFormat = "5v5" | "6v6" | "7v7" | "8v8" | "9v9" | "10v10" | "11v11";

export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export const COURT_FORMATS: CourtFormat[] = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10", "11v11"];

export const DAY_OF_WEEK_ORDER: DayOfWeek[] = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
    monday: "Lunes",
    tuesday: "Martes",
    wednesday: "Miércoles",
    thursday: "Jueves",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo",
};

/** Porcentaje mínimo de depósito */
export const MIN_DEPOSIT_PERCENT = 20;

/** Porcentaje máximo de depósito */
export const MAX_DEPOSIT_PERCENT = 50;

// ========================
// ENTIDADES
// ========================

export interface Venue {
    id: string;
    name: string;
    address: string;
    placeId: string;
    lat: number;
    lng: number;
    locationId?: string;
    createdBy: string;
    active: boolean;
    depositRequired: boolean;
    depositPercent: number;
    imageURL?: string;
    phone?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Court {
    id: string;
    name: string;
    baseFormat: CourtFormat;
    active: boolean;
    sortOrder: number;
}

export interface CourtCombo {
    id: string;
    name: string;
    courtIds: string[];
    resultingFormat: CourtFormat;
    active: boolean;
}

export interface DaySchedule {
    dayOfWeek: DayOfWeek;
    enabled: boolean;
    slots: ScheduleSlot[];
}

export interface ScheduleSlot {
    startTime: string;
    endTime: string;
    formats: FormatPricing[];
}

export interface FormatPricing {
    format: CourtFormat;
    priceCOP: number;
}

export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

export interface BlockedSlotRecurrence {
    type: RecurrenceType;
    startDate: string;            // YYYY-MM-DD — fuente de verdad del patrón
    endDate?: string;             // YYYY-MM-DD (opcional, indefinido si falta)
}

export interface BlockedSlot {
    id: string;
    date: string | null;           // null si es recurrente
    startTime: string;
    endTime: string;
    courtIds: string[];
    reason?: string;
    clientName?: string;           // solo visible al admin
    recurrence?: BlockedSlotRecurrence;
    exceptDates?: string[];        // YYYY-MM-DD instancias canceladas
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
}

export interface BookingConflict {
    date: string;
    startTime: string;
    endTime: string;
    bookingId: string;
    bookedBy: string;
    bookedByName: string;
}

// ========================
// INPUT TYPES
// ========================

export interface CreateVenueInput {
    name: string;
    address: string;
    placeId: string;
    lat: number;
    lng: number;
    createdBy: string;
    depositRequired: boolean;
    depositPercent: number;
    phone?: string;
    description?: string;
    imageURL?: string;
}

// ========================
// HELPERS PUROS
// ========================

/**
 * Genera los time slots disponibles para un día dado, basado en el schedule del venue.
 * Filtra slots que ya pasaron si la fecha es hoy.
 */
export function generateTimeSlots(
    schedule: DaySchedule,
    date: string,
    nowISO?: string,
): ScheduleSlot[] {
    if (!schedule.enabled) return [];

    if (!nowISO) return schedule.slots;

    const now = new Date(nowISO);
    // Use local date/time — slot times are stored in local (venue) time
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const localDate = `${y}-${m}-${d}`;
    const localHH = String(now.getHours()).padStart(2, "0");
    const localMM = String(now.getMinutes()).padStart(2, "0");
    const nowTime = `${localHH}:${localMM}`;

    if (date !== localDate) return schedule.slots;

    return schedule.slots.filter((slot) => slot.startTime > nowTime);
}

/**
 * Obtiene el día de la semana como DayOfWeek a partir de una fecha ISO (YYYY-MM-DD).
 */
export function getDayOfWeek(dateStr: string): DayOfWeek {
    const date = new Date(dateStr + "T12:00:00");
    const jsDay = date.getDay();
    // JS: 0=Sun, 1=Mon...6=Sat → nuestro enum
    const map: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return map[jsDay];
}

/**
 * Obtiene los formatos disponibles en un venue basándose en sus courts y combos.
 * Un formato está disponible si hay al menos un court base o combo activo que lo provea.
 */
export function getAvailableFormats(courts: Court[], combos: CourtCombo[]): CourtFormat[] {
    const formats = new Set<CourtFormat>();

    for (const court of courts) {
        if (court.active) formats.add(court.baseFormat);
    }
    for (const combo of combos) {
        if (combo.active) formats.add(combo.resultingFormat);
    }

    return COURT_FORMATS.filter((f) => formats.has(f));
}

/**
 * Calcula el monto del depósito en centavos COP.
 */
export function calcDepositCOP(totalPriceCOP: number, depositPercent: number): number {
    return Math.round(totalPriceCOP * depositPercent / 100);
}

/**
 * Calcula el resto a pagar en sede en centavos COP.
 */
export function calcRemainingCOP(totalPriceCOP: number, depositCOP: number): number {
    return totalPriceCOP - depositCOP;
}

/**
 * Formatea un CourtFormat a label en español.
 * Ej: "6v6" → "Fútbol 6"
 */
export function formatLabel(format: CourtFormat): string {
    const perTeam = parseInt(format.split("v")[0], 10);
    return `Fútbol ${perTeam}`;
}

// ========================
// VALIDACIONES
// ========================

export function validateVenueData(data: CreateVenueInput): void {
    if (!data.name || data.name.trim().length < 2) {
        throw new ValidationError("El nombre de la sede es obligatorio (mínimo 2 caracteres)");
    }

    if (!data.address) {
        throw new ValidationError("La dirección es obligatoria");
    }

    if (!data.placeId) {
        throw new ValidationError("El placeId de Google es obligatorio");
    }

    if (typeof data.lat !== "number" || typeof data.lng !== "number") {
        throw new ValidationError("Las coordenadas son obligatorias");
    }

    if (!data.createdBy) {
        throw new ValidationError("El creador es obligatorio");
    }

    validateDepositPercent(data.depositPercent);
}

export function validateDepositPercent(percent: number): void {
    if (typeof percent !== "number" || percent < MIN_DEPOSIT_PERCENT || percent > MAX_DEPOSIT_PERCENT) {
        throw new ValidationError(
            `El porcentaje de depósito debe estar entre ${MIN_DEPOSIT_PERCENT}% y ${MAX_DEPOSIT_PERCENT}%`
        );
    }
}

export function validateScheduleSlot(slot: ScheduleSlot): void {
    if (!slot.startTime || !/^\d{2}:\d{2}$/.test(slot.startTime)) {
        throw new ValidationError("La hora de inicio es inválida (formato HH:mm)");
    }

    if (!slot.endTime || !/^\d{2}:\d{2}$/.test(slot.endTime)) {
        throw new ValidationError("La hora de fin es inválida (formato HH:mm)");
    }

    if (slot.startTime >= slot.endTime) {
        throw new ValidationError("La hora de inicio debe ser anterior a la hora de fin");
    }

    if (!slot.formats || slot.formats.length === 0) {
        throw new ValidationError("Debe haber al menos un formato con precio en el slot");
    }

    for (const fp of slot.formats) {
        if (!COURT_FORMATS.includes(fp.format)) {
            throw new ValidationError(`Formato inválido: ${fp.format}`);
        }
        if (typeof fp.priceCOP !== "number" || fp.priceCOP < 0) {
            throw new ValidationError("El precio debe ser un número positivo en centavos COP");
        }
    }
}
