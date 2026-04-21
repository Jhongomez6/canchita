import type { BlockedSlot, BlockedSlotRecurrence } from "./venue";

function parseLocalDate(dateStr: string): Date {
    return new Date(dateStr + "T12:00:00");
}

function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function daysBetween(from: string, to: string): number {
    const a = parseLocalDate(from).getTime();
    const b = parseLocalDate(to).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function doesRecurrenceApplyToDate(
    recurrence: BlockedSlotRecurrence,
    exceptDates: string[] | undefined,
    date: string,
): boolean {
    if (date < recurrence.startDate) return false;
    if (recurrence.endDate && date > recurrence.endDate) return false;
    if (exceptDates?.includes(date)) return false;

    const start = parseLocalDate(recurrence.startDate);
    const target = parseLocalDate(date);

    switch (recurrence.type) {
        case "daily":
            return true;

        case "weekly":
            return start.getDay() === target.getDay();

        case "biweekly": {
            if (start.getDay() !== target.getDay()) return false;
            const diffDays = daysBetween(recurrence.startDate, date);
            return diffDays % 14 === 0;
        }

        case "monthly": {
            const startDay = start.getDate();
            if (startDay > 28) return false;
            return target.getDate() === startDay;
        }
    }
}

export function expandBlockedSlotsForDate(
    slots: BlockedSlot[],
    date: string,
): BlockedSlot[] {
    const out: BlockedSlot[] = [];
    for (const slot of slots) {
        if (!slot.recurrence) {
            if (slot.date === date) out.push(slot);
            continue;
        }
        if (doesRecurrenceApplyToDate(slot.recurrence, slot.exceptDates, date)) {
            out.push({ ...slot, date });
        }
    }
    return out;
}

export function listFutureInstances(
    slot: BlockedSlot,
    fromDate: string,
    horizonDays: number,
): string[] {
    if (!slot.recurrence) {
        return slot.date && slot.date >= fromDate ? [slot.date] : [];
    }
    const dates: string[] = [];
    const from = parseLocalDate(fromDate);
    for (let i = 0; i < horizonDays; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        const iso = toISODate(d);
        if (doesRecurrenceApplyToDate(slot.recurrence, slot.exceptDates, iso)) {
            dates.push(iso);
        }
    }
    return dates;
}

export function labelForRecurrence(recurrence: BlockedSlotRecurrence): string {
    switch (recurrence.type) {
        case "daily":
            return "Todos los días";
        case "weekly": {
            const days = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
            const d = parseLocalDate(recurrence.startDate).getDay();
            return `Todos los ${days[d]}`;
        }
        case "biweekly": {
            const days = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
            const d = parseLocalDate(recurrence.startDate).getDay();
            return `Cada 2 ${days[d].replace(/s$/, "")}s`;
        }
        case "monthly": {
            const day = parseLocalDate(recurrence.startDate).getDate();
            return `Día ${day} de cada mes`;
        }
    }
}
