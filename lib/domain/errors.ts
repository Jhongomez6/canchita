/**
 * ========================
 * DOMAIN ERRORS
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Errores de dominio compartidos por toda la aplicación.
 * Cada error tiene un nombre único para identificación en la UI.
 */

// ========================
// ERRORES BASE
// ========================

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

export class BusinessError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BusinessError";
    }
}

// ========================
// ERRORES DE PARTIDO
// ========================

export class MatchNotFoundError extends BusinessError {
    constructor() {
        super("El partido no existe");
        this.name = "MatchNotFoundError";
    }
}

export class MatchFullError extends BusinessError {
    constructor() {
        super("El partido está lleno");
        this.name = "MatchFullError";
    }
}

export class DuplicatePlayerError extends BusinessError {
    constructor(name: string) {
        super(`El jugador "${name}" ya está en el partido`);
        this.name = "DuplicatePlayerError";
    }
}

// ========================
// ERRORES DE INVITADO
// ========================

export class GuestValidationError extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = "GuestValidationError";
    }
}

export class GuestBusinessError extends BusinessError {
    constructor(message: string) {
        super(message);
        this.name = "GuestBusinessError";
    }
}

// ========================
// ERRORES DE BILLETERA
// ========================

export class InsufficientBalanceError extends BusinessError {
    constructor() {
        super("Saldo insuficiente en tu billetera");
        this.name = "InsufficientBalanceError";
    }
}

export class WalletNotFoundError extends BusinessError {
    constructor() {
        super("No se encontró la billetera del usuario");
        this.name = "WalletNotFoundError";
    }
}

export class CodeAlreadyRedeemedError extends BusinessError {
    constructor() {
        super("Este código ya fue canjeado");
        this.name = "CodeAlreadyRedeemedError";
    }
}

export class CodeNotFoundError extends BusinessError {
    constructor() {
        super("Código no válido");
        this.name = "CodeNotFoundError";
    }
}

// ========================
// ERRORES DE UBICACIÓN
// ========================

export class DuplicateLocationError extends BusinessError {
    constructor() {
        super("Esta cancha ya existe");
        this.name = "DuplicateLocationError";
    }
}

// ========================
// ERRORES DE RESERVAS
// ========================

export class SlotUnavailableError extends BusinessError {
    constructor() {
        super("Este horario ya no está disponible");
        this.name = "SlotUnavailableError";
    }
}

export class BookingExpiredError extends BusinessError {
    constructor() {
        super("La reserva ha expirado");
        this.name = "BookingExpiredError";
    }
}

export class VenueNotFoundError extends BusinessError {
    constructor() {
        super("La sede no existe o no está activa");
        this.name = "VenueNotFoundError";
    }
}

export class BookingNotFoundError extends BusinessError {
    constructor() {
        super("La reserva no existe");
        this.name = "BookingNotFoundError";
    }
}

export class BookingNotPendingError extends BusinessError {
    constructor() {
        super("La reserva no está en un estado pendiente válido para esta acción");
        this.name = "BookingNotPendingError";
    }
}

export class PaymentProofRejectedError extends BusinessError {
    constructor(reason: string) {
        super(`Comprobante rechazado: ${reason}`);
        this.name = "PaymentProofRejectedError";
    }
}

export class MaxRejectionsReachedError extends BusinessError {
    constructor() {
        super("Se alcanzó el número máximo de intentos de comprobante. La reserva fue cancelada.");
        this.name = "MaxRejectionsReachedError";
    }
}

export class InvalidStatusTransitionError extends BusinessError {
    constructor(from: string, to: string) {
        super(`Transición de estado inválida: ${from} → ${to}`);
        this.name = "InvalidStatusTransitionError";
    }
}

export class PaymentMethodValidationError extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = "PaymentMethodValidationError";
    }
}

// ========================
// ERRORES DE POST-MATCH REVIEW
// ========================

export class ReviewNotEligibleError extends BusinessError {
    constructor() {
        super("No podés calificar este partido");
        this.name = "ReviewNotEligibleError";
    }
}

export class ReviewWindowExpiredError extends BusinessError {
    constructor() {
        super("La ventana para calificar este partido ya cerró");
        this.name = "ReviewWindowExpiredError";
    }
}

export class ReviewAlreadyExistsError extends BusinessError {
    constructor() {
        super("Ya enviaste tu review de este partido");
        this.name = "ReviewAlreadyExistsError";
    }
}

export class ActiveReportLimitError extends BusinessError {
    constructor() {
        super("Ya tenés 2 reportes pendientes contra este jugador. Esperá a que el admin los revise.");
        this.name = "ActiveReportLimitError";
    }
}

export class SelfTargetError extends BusinessError {
    constructor() {
        super("No podés dar kudos ni reportarte a vos mismo");
        this.name = "SelfTargetError";
    }
}

// ========================
// ERRORES DE XP / NIVELES
// ========================

export class XpAwardError extends BusinessError {
    constructor(message: string) {
        super(message);
        this.name = "XpAwardError";
    }
}

export class XpEventAlreadyExistsError extends BusinessError {
    constructor(eventId: string) {
        super(`El evento de XP "${eventId}" ya fue otorgado`);
        this.name = "XpEventAlreadyExistsError";
    }
}
