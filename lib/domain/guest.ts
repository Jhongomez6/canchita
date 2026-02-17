/**
 * ========================
 * GUEST DOMAIN MODEL
 * ========================
 * 
 * Specification-Driven Development (SDD)
 * 
 * Este módulo implementa el modelo de dominio Guest
 * siguiendo estrictamente la especificación funcional.
 * 
 * ESPECIFICACIÓN:
 * - Un jugador puede agregar máximo 1 invitado por partido
 * - El invitado NO requiere cuenta de usuario
 * - El invitado ocupa un cupo del partido
 * - Campos obligatorios: name (min 2 chars), positions (1-2)
 * - Posiciones permitidas: GK, DEF, MID, FWD
 */

// ========================
// TIPOS Y CONSTANTES
// ========================

export type Position = "GK" | "DEF" | "MID" | "FWD";

export const ALLOWED_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export interface Guest {
  name: string;
  positions: Position[];
  invitedBy: string; // UID del jugador que invitó
}

// ========================
// ERRORES DE DOMINIO
// ========================

export class GuestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestValidationError";
  }
}

// ========================
// VALIDACIONES DE DOMINIO
// ========================

/**
 * Valida el nombre del invitado según la especificación:
 * - Es obligatorio
 * - Debe tener al menos 2 caracteres
 */
export function validateGuestName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new GuestValidationError("El nombre del invitado es obligatorio");
  }

  const trimmedName = name.trim();
  
  if (trimmedName.length < 2) {
    throw new GuestValidationError(
      "El nombre del invitado debe tener al menos 2 caracteres"
    );
  }
}

/**
 * Valida las posiciones del invitado según la especificación:
 * - Deben ser entre 1 y 2
 * - No se permiten posiciones duplicadas
 * - Solo posiciones permitidas: GK, DEF, MID, FWD
 */
export function validateGuestPositions(positions: Position[]): void {
  if (!Array.isArray(positions)) {
    throw new GuestValidationError("Las posiciones deben ser un array");
  }

  if (positions.length < 1) {
    throw new GuestValidationError(
      "El invitado debe tener al menos 1 posición"
    );
  }

  if (positions.length > 2) {
    throw new GuestValidationError(
      "El invitado puede tener máximo 2 posiciones"
    );
  }

  // Verificar posiciones duplicadas
  const uniquePositions = new Set(positions);
  if (uniquePositions.size !== positions.length) {
    throw new GuestValidationError(
      "No se permiten posiciones duplicadas"
    );
  }

  // Verificar que todas las posiciones sean válidas
  for (const position of positions) {
    if (!ALLOWED_POSITIONS.includes(position)) {
      throw new GuestValidationError(
        `Posición inválida: ${position}. Posiciones permitidas: ${ALLOWED_POSITIONS.join(", ")}`
      );
    }
  }
}

/**
 * Valida un objeto Guest completo según la especificación
 */
export function validateGuest(guest: Partial<Guest>): void {
  if (!guest.name) {
    throw new GuestValidationError("El nombre del invitado es obligatorio");
  }

  if (!guest.positions) {
    throw new GuestValidationError("Las posiciones del invitado son obligatorias");
  }

  if (!guest.invitedBy) {
    throw new GuestValidationError("Se requiere el UID del jugador que invita");
  }

  validateGuestName(guest.name);
  validateGuestPositions(guest.positions);
}

/**
 * Crea un Guest validado según la especificación
 */
export function createGuest(
  name: string,
  positions: Position[],
  invitedBy: string
): Guest {
  const guest: Guest = {
    name: name.trim(),
    positions,
    invitedBy,
  };

  validateGuest(guest);

  return guest;
}

// ========================
// REGLAS DE NEGOCIO
// ========================

/**
 * Verifica si un jugador ya tiene un invitado en el partido
 * Regla: Un jugador puede agregar máximo 1 invitado por partido
 */
export function hasExistingGuest(
  guests: Guest[],
  playerUid: string
): boolean {
  return guests.some((guest) => guest.invitedBy === playerUid);
}

/**
 * Obtiene el invitado de un jugador en un partido
 */
export function getPlayerGuest(
  guests: Guest[],
  playerUid: string
): Guest | null {
  return guests.find((guest) => guest.invitedBy === playerUid) || null;
}

/**
 * Valida que se pueda agregar un invitado
 * Regla: Un jugador puede agregar máximo 1 invitado por partido
 */
export function canAddGuest(
  guests: Guest[],
  playerUid: string
): boolean {
  return !hasExistingGuest(guests, playerUid);
}
