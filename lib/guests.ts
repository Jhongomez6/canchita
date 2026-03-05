/**
 * ========================
 * GUEST MANAGEMENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para gestionar invitados.
 * Usa tipos y reglas del dominio (`lib/domain/guest.ts`).
 *
 * REGLAS DE NEGOCIO:
 * 1. Un jugador puede agregar máximo 1 invitado por partido
 * 2. El invitado ocupa un cupo del partido
 * 3. El invitado no puede editar el partido ni invitar a otros
 * 4. Si el jugador ya tiene un invitado, debe eliminarlo antes de agregar otro
 */

import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import {
  Guest,
  Position,
  validateGuest,
  canAddGuest,
  getPlayerGuests,
} from "./domain/guest";
import { GuestBusinessError, MatchFullError } from "./domain/errors";
import type { Player } from "./domain/player";
import { getConfirmedCount } from "./domain/match";

// Re-export para backward compatibility
export { GuestBusinessError };

// ========================
// AGREGAR INVITADO
// ========================

/**
 * Agrega un invitado a un partido
 *
 * REGLAS APLICADAS:
 * - Validación completa del invitado (dominio)
 * - Máximo 1 invitado por jugador
 * - El invitado ocupa un cupo del partido
 * - Verifica que el partido no esté lleno
 */
export async function addGuestToMatch(
  matchId: string,
  playerUid: string,
  guestData: {
    name: string;
    positions: Position[];
  }
): Promise<void> {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error("El partido no existe");
    }

    const data = snap.data();
    const guests: Guest[] = data.guests || [];
    const players: Player[] = data.players || [];
    const maxPlayers = data.maxPlayers ?? Infinity;

    if (data.allowGuests === false) {
      throw new GuestBusinessError(
        "Este partido no permite invitados."
      );
    }

    // REGLA: Un jugador puede agregar máximo 2 invitados por partido
    if (!canAddGuest(guests, playerUid)) {
      throw new GuestBusinessError(
        "Ya has alcanzado el límite de 2 invitados en este partido."
      );
    }

    // Validar datos del invitado (dominio)
    const guest: Guest = {
      name: guestData.name.trim(),
      positions: guestData.positions,
      invitedBy: playerUid,
    };
    validateGuest(guest);

    // REGLA: El invitado ocupa un cupo del partido
    const confirmedCount = getConfirmedCount(players);
    const totalOccupiedSlots = confirmedCount + guests.length;

    if (totalOccupiedSlots >= maxPlayers) {
      throw new MatchFullError();
    }

    // Agregar invitado
    transaction.update(ref, {
      guests: [...guests, guest],
    });
  });
}

// ========================
// ELIMINAR INVITADO
// ========================

/**
 * Elimina el invitado de un jugador en un partido
 *
 * REGLAS APLICADAS:
 * - Solo el jugador que invitó puede eliminar a su invitado
 * - Libera el cupo del partido
 */
export async function removeGuestFromMatch(
  matchId: string,
  playerUid: string,
  guestName: string
): Promise<void> {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error("El partido no existe");
    }

    const data = snap.data();
    const guests: Guest[] = data.guests || [];

    // Buscar los invitados del jugador
    const playerGuests = getPlayerGuests(guests, playerUid);

    if (playerGuests.length === 0) {
      throw new GuestBusinessError(
        "No tienes ningún invitado en este partido"
      );
    }

    // Verificar si existe el invitado específico a eliminar
    const targetGuest = playerGuests.find(g => g.name === guestName);
    if (!targetGuest) {
      throw new GuestBusinessError(
        "El invitado especificado no existe o no te pertenece"
      );
    }

    // Eliminar solo el invitado específico
    const guestIndex = guests.findIndex(
      (guest) => guest.invitedBy === playerUid && guest.name === guestName
    );

    if (guestIndex > -1) {
      guests.splice(guestIndex, 1);
    }

    transaction.update(ref, {
      guests: guests,
    });
  });
}

// ========================
// CONSULTAS
// ========================

/**
 * Obtiene los invitados de un jugador en un partido
 */
export async function getPlayerGuestsInMatch(
  matchId: string,
  playerUid: string
): Promise<Guest[]> {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return [];
  }

  const data = snap.data();
  const guests: Guest[] = data.guests || [];

  return getPlayerGuests(guests, playerUid);
}

/**
 * Verifica si un jugador puede agregar un invitado
 */
export async function canPlayerAddGuest(
  matchId: string,
  playerUid: string
): Promise<boolean> {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return false;
  }

  const data = snap.data();
  const guests: Guest[] = data.guests || [];

  return canAddGuest(guests, playerUid);
}
