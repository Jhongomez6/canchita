/**
 * ========================
 * GUEST MANAGEMENT API
 * ========================
 * 
 * Specification-Driven Development (SDD)
 * 
 * Este módulo implementa las operaciones de backend para gestionar invitados,
 * respetando estrictamente las reglas de negocio definidas en la especificación.
 * 
 * REGLAS DE NEGOCIO:
 * 1. Un jugador puede agregar máximo 1 invitado por partido
 * 2. El invitado ocupa un cupo del partido
 * 3. El invitado no puede editar el partido ni invitar a otros
 * 4. Si el jugador ya tiene un invitado, debe eliminarlo antes de agregar otro
 */

import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import {
  Guest,
  Position,
  validateGuest,
  canAddGuest,
  getPlayerGuest,
  GuestValidationError,
} from "./domain/guest";

// ========================
// ERRORES DE NEGOCIO
// ========================

export class GuestBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestBusinessError";
  }
}

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
 * 
 * @throws GuestValidationError si los datos del invitado son inválidos
 * @throws GuestBusinessError si el jugador ya tiene un invitado
 * @throws Error si el partido está lleno
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
    const players = data.players || [];
    const maxPlayers = data.maxPlayers ?? Infinity;

    // REGLA: Un jugador puede agregar máximo 1 invitado por partido
    if (!canAddGuest(guests, playerUid)) {
      throw new GuestBusinessError(
        "Ya tienes un invitado en este partido. Elimínalo antes de agregar otro."
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
    const confirmedCount = players.filter((p: any) => p.confirmed).length;
    const totalOccupiedSlots = confirmedCount + guests.length;

    if (totalOccupiedSlots >= maxPlayers) {
      throw new Error("MATCH_FULL");
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
  playerUid: string
): Promise<void> {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error("El partido no existe");
    }

    const data = snap.data();
    const guests: Guest[] = data.guests || [];

    // Buscar el invitado del jugador
    const playerGuest = getPlayerGuest(guests, playerUid);

    if (!playerGuest) {
      throw new GuestBusinessError(
        "No tienes ningún invitado en este partido"
      );
    }

    // Eliminar el invitado
    const updatedGuests = guests.filter(
      (guest) => guest.invitedBy !== playerUid
    );

    transaction.update(ref, {
      guests: updatedGuests,
    });
  });
}

// ========================
// CONSULTAS
// ========================

/**
 * Obtiene el invitado de un jugador en un partido
 */
export async function getPlayerGuestInMatch(
  matchId: string,
  playerUid: string
): Promise<Guest | null> {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  const guests: Guest[] = data.guests || [];

  return getPlayerGuest(guests, playerUid);
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

// Fix import
import { getDoc } from "firebase/firestore";
