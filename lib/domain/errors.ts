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
// ERRORES DE UBICACIÓN
// ========================

export class DuplicateLocationError extends BusinessError {
    constructor() {
        super("Esta cancha ya existe");
        this.name = "DuplicateLocationError";
    }
}
