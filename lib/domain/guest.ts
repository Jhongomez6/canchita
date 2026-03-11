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

import { GuestValidationError } from "./errors";

// Re-export Position desde player.ts (fuente única de verdad)
export type { Position } from "./player";
import { ALLOWED_POSITIONS } from "./player";
export { ALLOWED_POSITIONS };

import type { Position } from "./player";

// ========================
// TIPOS
// ========================

export interface Guest {
  name: string;
  positions: Position[];
  primaryPosition?: Position;
  invitedBy: string; // UID del jugador que invitó
  isWaitlist?: boolean;
  waitlistJoinedAt?: string;
  confirmed?: boolean;
}

// Re-export error para backward compatibility
export { GuestValidationError };

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
 * - Deben ser entre 1 y 3
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

  if (positions.length > 3) {
    throw new GuestValidationError(
      "El invitado puede tener máximo 3 posiciones"
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
  invitedBy: string,
  primaryPosition?: Position
): Guest {
  const guest: Guest = {
    name: name.trim(),
    positions,
    ...(primaryPosition ? { primaryPosition } : {}),
    invitedBy,
  };

  validateGuest(guest);

  return guest;
}

// ========================
// REGLAS DE NEGOCIO
// ========================

/**
 * Verifica si un jugador ya alcanzó su límite de invitados
 * Regla: Un jugador puede agregar máximo 2 invitados por partido
 */
export function hasReachedGuestLimit(
  guests: Guest[],
  playerUid: string
): boolean {
  const userGuests = guests.filter((guest) => guest.invitedBy === playerUid);
  return userGuests.length >= 2;
}

/**
 * Obtiene todos los invitados de un jugador en un partido
 */
export function getPlayerGuests(
  guests: Guest[],
  playerUid: string
): Guest[] {
  return guests.filter((guest) => guest.invitedBy === playerUid);
}

/**
 * Valida que se pueda agregar un invitado
 * Regla: Un jugador puede agregar máximo 2 invitados por partido
 */
export function canAddGuest(
  guests: Guest[],
  playerUid: string
): boolean {
  return !hasReachedGuestLimit(guests, playerUid);
}

// ========================
// CONVERSIÓN GUEST → PLAYER
// ========================

import type { Player, PlayerLevel } from "./player";

/**
 * Convierte un Guest en un Player para incluirlo en el balanceo de equipos.
 *
 * REGLA: Los invitados participan en el balanceo con nivel configurable
 * (por defecto 2 = Medio). Se marca con "(inv)" para distinguirlos.
 */
export function guestToPlayer(guest: Guest, level: PlayerLevel = 2): Player {
  return {
    id: `guest-${guest.invitedBy}-${guest.name.replace(/\s+/g, '-')}`,
    name: `${guest.name} (inv)`,
    level,
    positions: guest.positions,
    ...(guest.primaryPosition ? { primaryPosition: guest.primaryPosition } : {}),
    confirmed: guest.confirmed !== false, // Defaults to true if not specified
    isWaitlist: guest.isWaitlist,
    waitlistJoinedAt: guest.waitlistJoinedAt,
  };
}

