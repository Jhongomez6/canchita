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

// ========================
// MULTI-DEPORTE
// ========================

/**
 * Tipos de deporte soportados. Determina ícono y label visible.
 */
export type SportType =
    | "football"
    | "volleyball"
    | "basketball"
    | "tennis"
    | "padel"
    | "other";

export const SPORT_TYPES: SportType[] = [
    "football", "volleyball", "basketball", "tennis", "padel", "other",
];

export const SPORT_LABELS: Record<SportType, string> = {
    football: "Fútbol",
    volleyball: "Voleibol",
    basketball: "Baloncesto",
    tennis: "Tenis",
    padel: "Pádel",
    other: "Otro",
};

/**
 * Tier de tarifa por duración. EXACTAMENTE UNO de los dos valores
 * (percentOff o flatPriceCOP) está presente — el otro debe ser undefined.
 *
 * - `percentOff`: descuento % sobre el subtotal (suma de slots). 0.01–99.99 con máx 2 decimales.
 * - `flatPriceCOP`: precio total flat en centavos (override completo del subtotal). Entero ≥ 0.
 */
export type VenueFormatDurationTier =
    | {
        minMinutes: number;
        percentOff: number;
        flatPriceCOP?: undefined;
    }
    | {
        minMinutes: number;
        percentOff?: undefined;
        flatPriceCOP: number;
    };

/**
 * Formato configurable por sede. Reemplaza el union CourtFormat hardcoded.
 * El id es un slug único por sede (ej. "football_5v5", "volleyball_6v6").
 */
export interface VenueFormat {
    id: string;             // slug único por sede
    sport: SportType;
    label: string;          // label visible (2–50 chars)
    playersPerTeam: number; // 1–20
    durationTiers?: VenueFormatDurationTier[];
}

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
// MÉTODOS DE PAGO EXTERNO
// ========================

/**
 * Tipos de método de pago aceptados por una sede.
 * - `nequi`: cuenta Nequi (identificador = teléfono)
 * - `bancolombia`: cuenta Bancolombia (identificador = número de cuenta)
 * - `daviplata`: cuenta Daviplata
 * - `llave`: alias Transfiya (Bancolombia/Nequi/Movii — identificador alfanumérico)
 * - `transfer`: transferencia bancaria genérica
 * - `other`: otro método con texto libre
 */
export type PaymentMethodType =
    | "nequi"
    | "bancolombia"
    | "daviplata"
    | "llave"
    | "transfer"
    | "other";

export const PAYMENT_METHOD_TYPES: PaymentMethodType[] = [
    "nequi", "bancolombia", "daviplata", "llave", "transfer", "other",
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
    nequi: "Nequi",
    bancolombia: "Bancolombia",
    daviplata: "Daviplata",
    llave: "Llave (Transfiya)",
    transfer: "Transferencia bancaria",
    other: "Otro",
};

/**
 * Método de pago externo configurado por la sede.
 * Solo el Super Admin puede modificar la lista (datos bancarios sensibles del dueño).
 */
export interface PaymentMethod {
    id: string;                          // uuid
    type: PaymentMethodType;
    label: string;                       // 2-40 chars, label visible
    accountHolderName: string;           // 2-80 chars
    accountIdentifier: string;           // 1-50 chars (teléfono, cuenta, llave)
    qrImageURL?: string;                 // Storage URL del QR opcional
    instructions?: string;               // Texto opcional ≤ 200 chars
    active: boolean;
    sortOrder: number;
}

/** Mín/máx caracteres para campos de PaymentMethod. */
export const PAYMENT_METHOD_LABEL_MIN = 2;
export const PAYMENT_METHOD_LABEL_MAX = 40;
export const PAYMENT_METHOD_HOLDER_MIN = 2;
export const PAYMENT_METHOD_HOLDER_MAX = 80;
export const PAYMENT_METHOD_IDENTIFIER_MIN = 1;
export const PAYMENT_METHOD_IDENTIFIER_MAX = 50;
export const PAYMENT_METHOD_INSTRUCTIONS_MAX = 200;

/** Máximo de métodos configurables por sede. */
export const MAX_PAYMENT_METHODS_PER_VENUE = 5;

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
    icon?: string;
    phone?: string;
    description?: string;
    /** Catálogo multi-deporte de la sede. undefined o vacío = modo legacy football-only. */
    formats?: VenueFormat[];

    // ── Pago externo (nuevo flujo) ──
    /** Métodos de pago aceptados (Nequi/Banco/Llave/etc.). Solo Super Admin edita. */
    paymentMethods?: PaymentMethod[];
    /** TTL configurable (1-24h) para reservas pending_payment. Default 24. */
    pendingApprovalTTLHours?: number;
    /** Número WhatsApp opcional E.164 para el botón "Avisar al admin". */
    whatsappNotificationNumber?: string;

    createdAt: string;
    updatedAt: string;
}

export interface Court {
    id: string;
    name: string;
    /** Antes: CourtFormat. Ahora: VenueFormat.id o legacy CourtFormat string. */
    baseFormat: string;
    active: boolean;
    sortOrder: number;
}

export interface CourtCombo {
    id: string;
    name: string;
    courtIds: string[];
    /** Antes: CourtFormat. Ahora: VenueFormat.id o legacy CourtFormat string. */
    resultingFormat: string;
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
    /** Antes: CourtFormat. Ahora: VenueFormat.id o legacy CourtFormat string. */
    format: string;
    priceCOP: number;
}

export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

export interface BlockedSlotRecurrence {
    type: RecurrenceType;
    startDate: string;            // YYYY-MM-DD — fuente de verdad del patrón
    endDate?: string;             // YYYY-MM-DD (opcional, indefinido si falta)
}

export type ManualReservationStatus = "pending" | "confirmed" | "delivered" | "played" | "paid" | "no_show" | "free" | "cancelled";

// Excluye "cancelled" — no aparece en el popover del badge (solo se llega desde el sheet de cancelación).
export const MANUAL_RESERVATION_STATUS_ORDER: ManualReservationStatus[] = [
    "pending", "confirmed", "delivered", "played", "paid", "no_show", "free",
];

// Orden lineal para el quick-advance (no incluye no_show, que es un estado terminal paralelo).
const ADVANCE_ORDER: ManualReservationStatus[] = ["pending", "confirmed", "delivered", "played", "paid"];

export interface BlockedSlot {
    id: string;
    date: string | null;           // null si es recurrente
    startTime: string;
    endTime: string;
    courtIds: string[];
    reason?: string;               // visible como "Información adicional" en UI
    clientName?: string;           // solo visible al admin (obligatorio en escritura desde el SDD de mejoras)
    clientPhone?: string;          // obligatorio en escritura (opcional en docs viejos). PII solo para admin de la sede.
    priceCOP?: number;             // calculado al crear desde el schedule
    status?: ManualReservationStatus; // default `pending` si falta (docs viejos)
    cancellationReason?: string;   // motivo al cancelar (opcional)
    cancelledAt?: string;          // ISO timestamp del momento de cancelación
    recurrence?: BlockedSlotRecurrence;
    isMonthly?: boolean;           // true si el cliente paga mensualidad
    isBirthday?: boolean;          // true si la reserva es para un cumpleaños (v1: solo afecta UI)
    exceptDates?: string[];        // YYYY-MM-DD instancias canceladas
    statusOverrides?: Record<string, ManualReservationStatus>; // YYYY-MM-DD → estado de esa instancia
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
}

export function isCancelled(slot: BlockedSlot): boolean {
    return slot.status === "cancelled";
}

/**
 * Status efectivo de una reserva manual.
 * Para reservas recurrentes, `date` (YYYY-MM-DD) permite leer el override de esa instancia.
 */
export function getBlockedSlotStatus(slot: BlockedSlot, date?: string): ManualReservationStatus {
    if (date && slot.statusOverrides?.[date] !== undefined) {
        return slot.statusOverrides[date];
    }
    return slot.status ?? "pending";
}

/**
 * Próximo status en el orden lineal. Devuelve null si ya está en el último (paid).
 */
export function getNextStatus(current: ManualReservationStatus): ManualReservationStatus | null {
    const idx = ADVANCE_ORDER.indexOf(current);
    if (idx < 0 || idx >= ADVANCE_ORDER.length - 1) return null;
    return ADVANCE_ORDER[idx + 1];
}

/**
 * Label + clases tailwind para renderizar el badge de status.
 */
export function statusBadge(status: ManualReservationStatus): { label: string; classes: string } {
    switch (status) {
        case "pending":
            return { label: "Pendiente", classes: "bg-amber-50 text-amber-700" };
        case "confirmed":
            return { label: "Confirmado", classes: "bg-blue-50 text-blue-700" };
        case "delivered":
            return { label: "Entregado", classes: "bg-cyan-50 text-cyan-700" };
        case "played":
            return { label: "Jugado", classes: "bg-slate-100 text-slate-700" };
        case "paid":
            return { label: "Pagado", classes: "bg-emerald-50 text-emerald-700" };
        case "no_show":
            return { label: "No asistió", classes: "bg-red-50 text-red-600" };
        case "free":
            return { label: "Gratis", classes: "bg-purple-50 text-purple-600" };
        case "cancelled":
            return { label: "Cancelada", classes: "bg-slate-100 text-slate-500" };
        default:
            return { label: "Pendiente", classes: "bg-amber-50 text-amber-700" };
    }
}

/**
 * Label corto para el botón quick-advance (texto del próximo estado).
 */
export function nextStatusActionLabel(current: ManualReservationStatus): string | null {
    const next = getNextStatus(current);
    if (!next) return null;
    switch (next) {
        case "confirmed": return "Confirmar";
        case "delivered": return "Marcar entregado";
        case "played": return "Marcar jugado";
        case "paid": return "Marcar pagado";
        default: return null;
    }
}

export interface BookingConflict {
    date: string;
    startTime: string;
    endTime: string;
    bookingId: string;
    bookedBy: string;
    bookedByName: string;
}

/**
 * Pago registrado contra una reserva manual (BlockedSlot) en una fecha concreta.
 * Vive en `venues/{venueId}/payments`. El id es determinístico
 * (`payment_${reservationId}_${date}`) para garantizar unicidad por par
 * (reserva, fecha) — clave para reservas recurrentes con un pago por instancia.
 */
export interface ManualReservationPayment {
    id: string;
    reservationId: string;       // BlockedSlot.id
    date: string;                // YYYY-MM-DD (la instancia)

    cashCOP: number;             // centavos, >= 0
    transferCOP: number;         // centavos, >= 0
    totalCOP: number;            // cashCOP + transferCOP (denormalizado)
    note?: string;               // nota opcional del admin (máx 200 chars). Ausente si vacía.

    // Snapshot denormalizado para el balance (evita N+1 reads)
    startTime: string;
    endTime: string;
    courtIds: string[];
    clientName?: string;
    priceCOP?: number;

    registeredBy: string;
    registeredAt: string;
    updatedAt?: string;
    slotStatus?: ManualReservationStatus; // denormalizado: "cancelled" si la reserva fue cancelada
}

/** Largo máximo de la nota opcional de un pago manual. */
export const PAYMENT_NOTE_MAX_LENGTH = 200;

/** Normaliza la nota de un pago: trim + cap. Devuelve undefined si queda vacía. */
export function normalizePaymentNote(note: string | undefined | null): string | undefined {
    if (!note) return undefined;
    const trimmed = note.trim().slice(0, PAYMENT_NOTE_MAX_LENGTH);
    return trimmed.length > 0 ? trimmed : undefined;
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
    icon?: string;
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
 *
 * Devuelve `string[]` para soportar tanto valores legacy `CourtFormat` como `VenueFormat.id`s.
 * Si todos los formatos son valores legacy (`"5v5"`…`"11v11"`), preserva el orden de `COURT_FORMATS`.
 */
export function getAvailableFormats(courts: Court[], combos: CourtCombo[]): string[] {
    const formats = new Set<string>();

    for (const court of courts) {
        if (court.active) formats.add(court.baseFormat);
    }
    for (const combo of combos) {
        if (combo.active) formats.add(combo.resultingFormat);
    }

    const legacyOrdered = COURT_FORMATS.filter((f) => formats.has(f));
    const nonLegacy = [...formats].filter((f) => !(COURT_FORMATS as string[]).includes(f));
    return [...legacyOrdered, ...nonLegacy];
}

/**
 * Filtra el catálogo `VenueFormat[]` de la sede dejando solo los formatos que
 * tienen al menos un court base o combo activo asociado.
 */
export function getAvailableVenueFormats(
    courts: Court[],
    combos: CourtCombo[],
    venueFormats: VenueFormat[],
): VenueFormat[] {
    const ids = new Set<string>();
    for (const court of courts) {
        if (court.active) ids.add(court.baseFormat);
    }
    for (const combo of combos) {
        if (combo.active) ids.add(combo.resultingFormat);
    }
    return venueFormats.filter((f) => ids.has(f.id));
}

/**
 * Devuelve el tier de tarifa aplicable a una duración dada.
 * Es el tier con mayor `minMinutes` cuyo umbral se cumple (`duración ≥ minMinutes`).
 * Devuelve null si no hay tiers o ninguno aplica.
 */
export function findApplicableTier(
    durationMinutes: number,
    tiers?: VenueFormatDurationTier[],
): VenueFormatDurationTier | null {
    if (!tiers || tiers.length === 0) return null;
    const eligible = tiers.filter((t) => durationMinutes >= t.minMinutes);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, t) => (t.minMinutes > best.minMinutes ? t : best));
}

export interface DurationTierBreakdown {
    subtotalCOP: number;
    discountCOP: number;            // subtotal − final, siempre presente (0 si no aplica)
    finalCOP: number;
    appliedTier: VenueFormatDurationTier | null;
}

/**
 * Aplica el tier de tarifa (percent o flat) a un subtotal y devuelve la desagregación.
 * Si el tier es percent, el final = subtotal − (subtotal × percentOff / 100).
 * Si el tier es flat, el final = flatPriceCOP (override completo).
 * `discountCOP` siempre se computa como `subtotal − final` para unificar el display.
 */
export function applyDurationTier(
    subtotalCOP: number,
    durationMinutes: number,
    tiers?: VenueFormatDurationTier[],
): DurationTierBreakdown {
    const tier = findApplicableTier(durationMinutes, tiers);
    if (!tier) {
        return { subtotalCOP, discountCOP: 0, finalCOP: subtotalCOP, appliedTier: null };
    }
    let finalCOP: number;
    if (tier.percentOff !== undefined) {
        const reduction = Math.round(subtotalCOP * tier.percentOff / 100);
        finalCOP = subtotalCOP - reduction;
    } else {
        finalCOP = tier.flatPriceCOP;
    }
    return {
        subtotalCOP,
        discountCOP: subtotalCOP - finalCOP,
        finalCOP,
        appliedTier: tier,
    };
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
 * Mapea el tamaño de equipo a una jerarquía de canchas:
 *  - 5v5/6v6   → "Cancha sencilla"
 *  - 7v7/8v8/9v9 → "Cancha doble"
 *  - 10v10/11v11 → "Cancha triple"
 */
export function formatLabel(format: string, venueFormats?: VenueFormat[]): string {
    // 1. Catálogo multi-deporte de la sede
    if (venueFormats && venueFormats.length > 0) {
        const vf = venueFormats.find((f) => f.id === format);
        if (vf) return vf.label;
    }
    // 2. Fallback legacy: strings tipo "XvX" → jerarquía sencilla/doble/triple
    const match = format.match(/^(\d+)v\d+$/);
    if (match) {
        const perTeam = parseInt(match[1], 10);
        if (perTeam <= 6) return "Cancha sencilla";
        if (perTeam <= 9) return "Cancha doble";
        return "Cancha triple";
    }
    // 3. Último recurso: mostrar el id crudo
    return format;
}

/**
 * Resuelve el deporte de un formato (VenueFormat.id) buscándolo en el catálogo de la sede.
 * En modo legacy (sin catálogo) devuelve `null` — el llamador debe asumir sede mono-deporte
 * (football-only) y tratar todas las canchas como del mismo deporte.
 */
export function sportOfFormat(format: string, venueFormats?: VenueFormat[]): SportType | null {
    if (venueFormats && venueFormats.length > 0) {
        const vf = venueFormats.find((f) => f.id === format);
        if (vf) return vf.sport;
    }
    return null;
}

/**
 * Devuelve "Cancha sencilla/doble/triple" según cuántas canchas se usan.
 * Útil para bloqueos que no tienen `format`.
 */
export function tierLabelFromCount(count: number): string {
    if (count <= 1) return "Cancha sencilla";
    if (count <= 2) return "Cancha doble";
    if (count <= 3) return "Cancha triple";
    return "Múltiples canchas";
}

/**
 * Une items con coma + "y" final (estilo español).
 * Ej: ["A", "B", "C"] → "A, B y C"
 */
export function spanishJoin(items: string[]): string {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Compacta una lista de nombres de cancha que comparten prefijo + número.
 * Ej: ["Cancha 1", "Cancha 3", "Cancha 2"] → "Cancha 1, 2 y 3" (orden numérico)
 * Si no comparten patrón, hace spanishJoin directo.
 */
export function formatCourtList(names: string[]): string {
    if (names.length === 0) return "";
    const matches = names.map((n) => n.match(/^(.+?)\s+(\d+)$/));
    if (names.length > 1 && matches.every((m) => m !== null)) {
        const prefix = matches[0]![1];
        const allSame = matches.every((m) => m![1] === prefix);
        if (allSame) {
            const numbers = matches
                .map((m) => parseInt(m![2], 10))
                .sort((a, b) => a - b)
                .map(String);
            return `${prefix} ${spanishJoin(numbers)}`;
        }
    }
    return spanishJoin(names);
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
        if (typeof fp.format !== "string" || fp.format.length === 0) {
            throw new ValidationError(`Formato inválido: ${fp.format}`);
        }
        if (typeof fp.priceCOP !== "number" || fp.priceCOP < 0) {
            throw new ValidationError("El precio debe ser un número positivo en centavos COP");
        }
    }
}

// ========================
// VALIDACIONES MULTI-DEPORTE
// ========================

export function validateVenueFormat(f: VenueFormat): void {
    if (!f.id || /\s/.test(f.id)) {
        throw new ValidationError("El id del formato es obligatorio y no puede tener espacios");
    }
    if (!SPORT_TYPES.includes(f.sport)) {
        throw new ValidationError(`Deporte inválido: ${f.sport}`);
    }
    if (!f.label || f.label.trim().length < 2 || f.label.length > 50) {
        throw new ValidationError("El label debe tener entre 2 y 50 caracteres");
    }
    if (!Number.isInteger(f.playersPerTeam) || f.playersPerTeam < 1 || f.playersPerTeam > 20) {
        throw new ValidationError("Jugadores por equipo debe ser un entero entre 1 y 20");
    }
    if (f.durationTiers) {
        const seen = new Set<number>();
        for (const t of f.durationTiers) {
            if (!Number.isInteger(t.minMinutes) || t.minMinutes <= 0 || t.minMinutes > 1440) {
                throw new ValidationError("minMinutes debe ser entero entre 1 y 1440");
            }
            if (seen.has(t.minMinutes)) {
                throw new ValidationError(`minMinutes duplicado en tiers: ${t.minMinutes}`);
            }
            seen.add(t.minMinutes);

            const hasPercent = typeof t.percentOff === "number";
            const hasFlat = typeof t.flatPriceCOP === "number";
            if (hasPercent === hasFlat) {
                throw new ValidationError(
                    "Cada tier debe tener exactamente uno de percentOff o flatPriceCOP",
                );
            }
            if (hasPercent) {
                if (t.percentOff! < 0.01 || t.percentOff! > 99.99) {
                    throw new ValidationError("percentOff debe estar entre 0.01 y 99.99");
                }
                if (Math.round(t.percentOff! * 100) / 100 !== t.percentOff) {
                    throw new ValidationError("percentOff admite máximo 2 decimales");
                }
            } else {
                if (!Number.isInteger(t.flatPriceCOP) || t.flatPriceCOP! < 0) {
                    throw new ValidationError("flatPriceCOP debe ser entero ≥ 0 en centavos");
                }
            }
        }
    }
}

export function validateVenueFormats(formats: VenueFormat[]): void {
    const ids = new Set<string>();
    for (const f of formats) {
        validateVenueFormat(f);
        if (ids.has(f.id)) {
            throw new ValidationError(`Id de formato duplicado: ${f.id}`);
        }
        ids.add(f.id);
    }
}

// ========================
// VALIDACIONES PAGO EXTERNO
// ========================

export function validatePaymentMethod(m: PaymentMethod): void {
    if (!m.id || typeof m.id !== "string") {
        throw new ValidationError("El id del método de pago es obligatorio");
    }
    if (!PAYMENT_METHOD_TYPES.includes(m.type)) {
        throw new ValidationError(`Tipo de método inválido: ${m.type}`);
    }
    const label = (m.label ?? "").trim();
    if (label.length < PAYMENT_METHOD_LABEL_MIN || label.length > PAYMENT_METHOD_LABEL_MAX) {
        throw new ValidationError(
            `El label debe tener entre ${PAYMENT_METHOD_LABEL_MIN} y ${PAYMENT_METHOD_LABEL_MAX} caracteres`,
        );
    }
    const holder = (m.accountHolderName ?? "").trim();
    if (holder.length < PAYMENT_METHOD_HOLDER_MIN || holder.length > PAYMENT_METHOD_HOLDER_MAX) {
        throw new ValidationError(
            `El nombre del titular debe tener entre ${PAYMENT_METHOD_HOLDER_MIN} y ${PAYMENT_METHOD_HOLDER_MAX} caracteres`,
        );
    }
    const id = (m.accountIdentifier ?? "").trim();
    if (id.length < PAYMENT_METHOD_IDENTIFIER_MIN || id.length > PAYMENT_METHOD_IDENTIFIER_MAX) {
        throw new ValidationError(
            `El identificador debe tener entre ${PAYMENT_METHOD_IDENTIFIER_MIN} y ${PAYMENT_METHOD_IDENTIFIER_MAX} caracteres`,
        );
    }
    if (m.instructions !== undefined && m.instructions.length > PAYMENT_METHOD_INSTRUCTIONS_MAX) {
        throw new ValidationError(
            `Las instrucciones no pueden superar ${PAYMENT_METHOD_INSTRUCTIONS_MAX} caracteres`,
        );
    }
    if (typeof m.active !== "boolean") {
        throw new ValidationError("El campo active debe ser booleano");
    }
    if (!Number.isInteger(m.sortOrder) || m.sortOrder < 0) {
        throw new ValidationError("El sortOrder debe ser entero ≥ 0");
    }
}

export function validatePaymentMethods(methods: PaymentMethod[]): void {
    if (!Array.isArray(methods)) {
        throw new ValidationError("paymentMethods debe ser un array");
    }
    if (methods.length > MAX_PAYMENT_METHODS_PER_VENUE) {
        throw new ValidationError(
            `Máximo ${MAX_PAYMENT_METHODS_PER_VENUE} métodos de pago por sede`,
        );
    }
    const ids = new Set<string>();
    for (const m of methods) {
        validatePaymentMethod(m);
        if (ids.has(m.id)) {
            throw new ValidationError(`Id de método duplicado: ${m.id}`);
        }
        ids.add(m.id);
    }
}

/**
 * Valida un número WhatsApp en formato E.164 simple (+57 312345...).
 * Acepta vacío/undefined (campo opcional).
 */
export function validateWhatsAppNumber(num: string | undefined | null): void {
    if (num === undefined || num === null || num === "") return;
    const trimmed = num.trim();
    if (!/^\+?[0-9]{8,15}$/.test(trimmed)) {
        throw new ValidationError(
            "El número WhatsApp debe tener entre 8 y 15 dígitos (formato E.164, opcional el +)",
        );
    }
}

/**
 * Formatea un mensaje pre-llenado para el deep-link WhatsApp con resumen de booking.
 */
export function formatWhatsAppNotifyMessage(
    bookingShortSummary: string,
    appUrl?: string,
): string {
    const tail = appUrl ? `\n${appUrl}` : "";
    return `Hola, acabo de pagar el abono de mi reserva: ${bookingShortSummary}${tail}`;
}
