/**
 * ========================
 * AVAILABILITY LEDGER — dominio puro de ocupación
 * ========================
 *
 * Specification-Driven Development (SDD)
 * See: docs/RESERVAS_CONCURRENCIA_LEDGER_SDD.md
 *
 * Libro único de ocupación por sede-día (`availability/{venueId}_{date}`). Es la
 * fuente de verdad de qué cancha está tomada en qué rango. TODO lo que bloquea un
 * slot (aprobación online + bloqueo manual one-off) contiende sobre el MISMO doc
 * dentro de una transacción → Firestore serializa → doble-booking imposible.
 *
 * Este módulo es PURO: sin Firebase, sin side-effects, sin Date. Todo lo temporal
 * (updatedAt) lo setea el caller. Así es 100% testeable de forma aislada.
 */

// ========================
// ESTADOS QUE OCUPAN SLOT
// ========================

/**
 * Estados de una reserva que ocupan (bloquean) el slot. Fuente única de verdad —
 * reemplaza los sets ad-hoc dispersos (y el bug de `createBlockedSlot` que chequeaba
 * `["confirmed","pending_payment"]`). Se usa para la MIGRACIÓN y las lecturas de UI;
 * la decisión de escritura la toma el ledger, no esta constante.
 */
export const SLOT_BLOCKING_STATUSES = ["deposit_confirmed", "confirmed", "played"] as const;
export type SlotBlockingStatus = (typeof SLOT_BLOCKING_STATUSES)[number];

// ========================
// MODELO DE DATOS
// ========================

export type OccupancyKind = "booking" | "block";

export interface TimeRange {
    startTime: string; // "HH:MM"
    endTime: string;   // "HH:MM"
}

/** Una ocupación concreta dentro del día: qué recurso (booking/block) toma qué canchas en qué rango. */
export interface OccupancyEntry extends TimeRange {
    /** bookingId (kind="booking") | blockedSlotId (kind="block"). */
    sourceId: string;
    kind: OccupancyKind;
    /** Todas las canchas que ocupa (combos = varias). */
    courtIds: string[];
}

/** Documento `availability/{venueId}_{date}`. */
export interface AvailabilityLedger {
    venueId: string;
    date: string; // "YYYY-MM-DD"
    entries: OccupancyEntry[];
    updatedAt: string; // ISO — lo setea el caller
}

// ========================
// CLAVE DEL DOC (punto de sharding futuro)
// ========================

/** Id del doc de disponibilidad para una sede-día. */
export function availabilityDocId(venueId: string, date: string): string {
    return `${venueId}_${date}`;
}

/**
 * Ids de los docs de contención que una operación debe reclamar.
 *
 * HOY: un único doc por sede-día. La lógica de la transacción itera sobre este
 * resultado (lee todos, luego escribe todos), así que shardear en el futuro
 * (p. ej. por cancha: `${venueId}_${date}_${courtId}`) es cambiar SOLO este helper,
 * sin tocar la lógica de negocio. `courtIds` se ignora hoy; queda en la firma para
 * ese futuro. See: SDD §2 (Escalabilidad / sharding).
 */
export function availabilityDocIds(
    venueId: string,
    date: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    courtIds?: string[],
): string[] {
    return [availabilityDocId(venueId, date)];
}

// ========================
// LÓGICA DE OCUPACIÓN (pura)
// ========================

/** Dos rangos horarios se solapan si uno empieza antes de que el otro termine, y viceversa. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
    return a.startTime < b.endTime && a.endTime > b.startTime;
}

/**
 * Canchas ocupadas en `range`, según el ledger + bloqueos recurrentes ya expandidos
 * a la fecha (los recurrentes no viven en el ledger; se consultan como plantillas).
 *
 * @param ledgerEntries entries del doc `availability` (o null si el doc no existe aún).
 * @param recurringBlocks bloqueos recurrentes aplicables a la fecha, ya expandidos a OccupancyEntry.
 * @param range rango horario solicitado.
 * @param excludeSourceId excluir la propia reserva/bloqueo (ej. re-aprobación de la misma solicitud).
 */
export function occupiedCourtIds(
    ledgerEntries: OccupancyEntry[] | null | undefined,
    recurringBlocks: OccupancyEntry[],
    range: TimeRange,
    excludeSourceId?: string,
): Set<string> {
    const occupied = new Set<string>();
    const collect = (entries: OccupancyEntry[]) => {
        for (const e of entries) {
            if (excludeSourceId && e.sourceId === excludeSourceId) continue;
            if (!rangesOverlap(e, range)) continue;
            for (const c of e.courtIds) occupied.add(c);
        }
    };
    collect(ledgerEntries ?? []);
    collect(recurringBlocks ?? []);
    return occupied;
}

// ========================
// RECURRENCIA DE BLOQUEOS (predicado puro)
// ========================

export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

export interface Recurrence {
    type: RecurrenceType;
    startDate: string; // "YYYY-MM-DD"
    endDate?: string;  // "YYYY-MM-DD"
}

/**
 * ¿El bloqueo recurrente aplica a `date`? Predicado determinístico (mismo input →
 * mismo output; usa `new Date` pero nunca `Date.now`). Los recurrentes NO viven en
 * el ledger (§3 del SDD): se consultan como plantillas y se expanden a la fecha con
 * este predicado. Extraído del inline duplicado de `allocateForApproval`.
 */
export function recurringBlockAppliesTo(
    recurrence: Recurrence,
    date: string,
    exceptDates: string[] = [],
): boolean {
    if (exceptDates.includes(date)) return false;
    if (date < recurrence.startDate) return false;
    if (recurrence.endDate && date > recurrence.endDate) return false;

    const start = new Date(recurrence.startDate + "T12:00:00");
    const target = new Date(date + "T12:00:00");
    switch (recurrence.type) {
        case "daily":
            return true;
        case "weekly":
            return start.getDay() === target.getDay();
        case "biweekly": {
            if (start.getDay() !== target.getDay()) return false;
            const diffDays = Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays % 14 === 0;
        }
        case "monthly": {
            const sd = start.getDate();
            return sd <= 28 && target.getDate() === sd;
        }
        default:
            return false;
    }
}

// ========================
// MUTACIONES (puras: devuelven arrays nuevos)
// ========================

/**
 * Inserta o reemplaza la entrada de `entry.sourceId`. Idempotente: reprocesar la
 * misma reserva no duplica (útil ante reintentos de la transacción).
 */
export function upsertEntry(entries: OccupancyEntry[], entry: OccupancyEntry): OccupancyEntry[] {
    return [...entries.filter((e) => e.sourceId !== entry.sourceId), entry];
}

/**
 * Libera (quita) la entrada de `sourceId`. Idempotente: si ya no está, no falla.
 * Se usa en los paths de release (cancelar/rechazar/expirar/borrar).
 */
export function removeEntry(entries: OccupancyEntry[], sourceId: string): OccupancyEntry[] {
    return entries.filter((e) => e.sourceId !== sourceId);
}
