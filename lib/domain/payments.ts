/**
 * ========================
 * PAYMENTS DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/DAILY_BALANCE_PAYMENTS_SDD.md
 *
 * Helpers puros para registro y balance de pagos de reservas manuales.
 * Sin Firebase, sin React.
 */

import type { BlockedSlot, ManualReservationPayment } from "./venue";
import { getBlockedSlotStatus } from "./venue";

/**
 * id determinístico para el doc de pago. Garantiza unicidad por par
 * (reservationId, date), evitando duplicados por taps simultáneos de admins.
 */
export function buildPaymentId(reservationId: string, date: string): string {
    return `payment_${reservationId}_${date}`;
}

/**
 * Suma los pagos del día agrupando por método. Todos los montos en centavos COP.
 */
export function sumPayments(payments: ManualReservationPayment[]): {
    cashCOP: number;
    transferCOP: number;
    totalCOP: number;
    count: number;
} {
    let cashCOP = 0;
    let transferCOP = 0;
    let totalCOP = 0;
    for (const p of payments) {
        cashCOP += p.cashCOP;
        transferCOP += p.transferCOP;
        totalCOP += p.totalCOP;
    }
    return { cashCOP, transferCOP, totalCOP, count: payments.length };
}

/**
 * Una reserva es cobrable si no está cancelada/free/no_show y no es mensualidad.
 * Las mensualidades se cobran por flujo aparte (fuera del balance diario en V1).
 */
export function isReservationPayable(slot: BlockedSlot): boolean {
    if (slot.isMonthly) return false;
    const status = getBlockedSlotStatus(slot);
    return status !== "cancelled" && status !== "free" && status !== "no_show";
}

export type PaymentDiffKind = "exact" | "overpayment" | "underpayment" | "unknown";

/**
 * Calcula la diferencia entre lo cobrado y el precio de referencia de la reserva.
 * `unknown` cuando el slot no tiene priceCOP (legacy o no calculable).
 */
export function calcPaymentDiff(totalCOP: number, priceCOP?: number): {
    diff: number;
    kind: PaymentDiffKind;
} {
    if (typeof priceCOP !== "number" || priceCOP <= 0) {
        return { diff: 0, kind: "unknown" };
    }
    const diff = totalCOP - priceCOP;
    if (diff === 0) return { diff: 0, kind: "exact" };
    return { diff, kind: diff > 0 ? "overpayment" : "underpayment" };
}

/**
 * Valida los montos de un pago antes de persistir.
 * - Ambos enteros >= 0.
 * - Suma > 0 (no se permite pago vacío).
 *
 * Lanza Error con mensaje en español si falla. La capa UI/API decide cómo mostrarlo.
 */
export function validatePaymentAmounts(cashCOP: number, transferCOP: number): void {
    if (!Number.isInteger(cashCOP) || cashCOP < 0) {
        throw new Error("El monto en efectivo debe ser un entero ≥ 0 (centavos COP)");
    }
    if (!Number.isInteger(transferCOP) || transferCOP < 0) {
        throw new Error("El monto en transferencia debe ser un entero ≥ 0 (centavos COP)");
    }
    if (cashCOP + transferCOP <= 0) {
        throw new Error("Ingresa al menos un monto mayor a cero");
    }
}
