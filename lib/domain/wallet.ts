/**
 * ========================
 * WALLET DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/WALLET_SDD.md
 *
 * Modelo de dominio para la billetera de usuario.
 * Tipos puros, helpers y validaciones — sin Firebase, sin React.
 *
 * ESPECIFICACIÓN:
 * - Todos los montos en Firestore se almacenan en centavos COP (entero)
 * - Las recargas Wompi se hacen en múltiplos de $10.000 COP (min $20k, max $500k)
 * - Los depósitos de partido son valores fijos: $5.000 o $10.000 COP
 * - La comisión de Wompi la paga el usuario: 2.65% + $700 + IVA (19%)
 */

// ========================
// TIPOS
// ========================

export type WalletTxType =
    | "topup_wompi"
    | "topup_code"
    | "deposit_debit"
    | "deposit_refund"
    | "match_refund"
    | "booking_deposit_debit"
    | "booking_deposit_refund"
    | "manual_credit"
    | "manual_debit";

export type WalletTxStatus = "pending" | "completed" | "failed" | "expired";

export interface Wallet {
    uid: string;
    balanceCOP: number;    // centavos COP, siempre >= 0
    updatedAt: string;     // ISO
    createdAt: string;     // ISO
}

export interface WalletTransaction {
    id: string;
    uid: string;
    type: WalletTxType;
    status: WalletTxStatus;
    amountCOP: number;          // centavos; positivo = crédito, negativo = débito
    balanceAfterCOP: number;    // snapshot del balance tras esta tx (centavos)
    description: string;
    matchId?: string;
    bookingId?: string;
    venueId?: string;
    locationId?: string;
    wompiTransactionId?: string;
    wompiReference?: string;
    paymentMethod?: string;       // "PSE" | "NEQUI" | "CARD" | etc.
    totalChargedCents?: number;   // total cobrado incluyendo comisión Wompi
    finalizedAt?: string;         // timestamp real de aprobación
    codeId?: string;
    expiresAt?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface TopupCode {
    code: string;
    amountCOP: number;      // centavos: 2000000 ($20k) o 5000000 ($50k)
    status: "available" | "redeemed";
    batchId: string;
    generatedBy: string;
    redeemedBy?: string;
    redeemedAt?: string;
    createdAt: string;
}

// ========================
// CONSTANTES
// ========================

/** Depósitos permitidos en centavos COP */
export const VALID_DEPOSITS_COP = [500000, 1000000] as const;

/** Depósito default en centavos COP ($5.000) */
export const DEFAULT_DEPOSIT_COP = 500000;

/** Recarga mínima en pesos COP */
export const MIN_TOPUP_COP = 20000;

/** Recarga máxima en pesos COP */
export const MAX_TOPUP_COP = 500000;

/** Paso de recarga en pesos COP */
export const TOPUP_STEP_COP = 10000;

/** Denominaciones de códigos físicos en centavos COP */
export const CODE_DENOMINATIONS_COP = [2000000, 5000000] as const;

/** Deadline de reembolso: 24 horas en milisegundos */
export const REFUND_DEADLINE_MS = 24 * 60 * 60 * 1000;

// ========================
// HELPERS PUROS
// ========================

/**
 * Formatea centavos COP a string legible.
 * Ej: 500000 → "$5.000"
 */
export function formatCOP(centavos: number): string {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(centavos / 100);
}

/**
 * Verifica si el wallet tiene saldo suficiente para un débito.
 */
export function hasSufficientBalance(wallet: Wallet, debitCentavos: number): boolean {
    return wallet.balanceCOP >= debitCentavos;
}

/**
 * Label en español para cada tipo de transacción.
 */
export function txTypeLabel(type: WalletTxType, paymentMethod?: string): string {
    if (type === "topup_wompi" && paymentMethod) {
        const methods: Record<string, string> = {
            PSE: "Recarga vía PSE",
            NEQUI: "Recarga vía Nequi",
            BANCOLOMBIA_TRANSFER: "Recarga vía Bancolombia",
            BANCOLOMBIA_COLLECT: "Recarga vía Bancolombia",
            CARD: "Recarga con tarjeta",
            DAVIPLATA: "Recarga vía Daviplata",
        };
        return methods[paymentMethod] ?? "Recarga Wompi";
    }
    const labels: Record<WalletTxType, string> = {
        topup_wompi: "Recarga Wompi",
        topup_code: "Canje de código",
        deposit_debit: "Depósito partido",
        deposit_refund: "Reembolso partido",
        match_refund: "Reembolso por cancelación",
        booking_deposit_debit: "Depósito reserva",
        booking_deposit_refund: "Reembolso reserva",
        manual_credit: "Crédito manual",
        manual_debit: "Débito manual",
    };
    return labels[type];
}

/**
 * Calcula la comisión de Wompi para un monto en pesos COP.
 * Tarifa: 2.65% + $700 + IVA (19%)
 *
 * Wompi aplica su comisión sobre el TOTAL cobrado al usuario, no sobre el monto base.
 * Se hace gross-up para que tras descontar la comisión quede exactamente amountCOP.
 *
 * Fórmula: total × (1 − 0.0265 × 1.19) = amountCOP + 700 × 1.19
 *          total = (amountCOP + 833) / 0.968465
 *
 * @param amountCOP - Monto en pesos que el usuario quiere en su wallet (ej: 20000)
 * @returns fee y total en pesos COP
 */
export function calcWompiFee(amountCOP: number): { fee: number; total: number } {
    // Gross-up: Wompi cobra su comisión sobre el total cobrado, no sobre el monto base.
    // Usando aritmética entera para evitar errores de punto flotante:
    //   833     = 700 × 1.19          (fijo exacto)
    //   968_465 = (1 − 0.0265×1.19) × 1_000_000  (exacto)
    // total = ceil((amountCOP + 833) × 1_000_000 / 968_465)
    const total = Math.ceil((amountCOP + 833) * 1_000_000 / 968_465);
    const fee = total - amountCOP;
    return { fee, total };
}

/**
 * Valida que un monto de recarga Wompi sea válido.
 * Debe ser múltiplo de $10.000, entre $20.000 y $500.000 COP.
 */
export function isValidTopupAmount(amountCOP: number): boolean {
    return (
        amountCOP >= MIN_TOPUP_COP &&
        amountCOP <= MAX_TOPUP_COP &&
        amountCOP % TOPUP_STEP_COP === 0
    );
}

/**
 * Valida que un depósito de partido sea uno de los valores permitidos (en centavos).
 */
export function isValidDeposit(depositCentavos: number): boolean {
    return (VALID_DEPOSITS_COP as readonly number[]).includes(depositCentavos);
}
