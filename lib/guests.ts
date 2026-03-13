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
    primaryPosition?: Position;
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

    // REGLA: El invitado ocupa un cupo del partido SOLO si no va a la lista de espera
    const confirmedCount = getConfirmedCount(players);
    const confirmedGuests = guests.filter(g => g.confirmed !== false && !g.isWaitlist);
    const totalOccupiedSlots = confirmedCount + confirmedGuests.length;

    // Si está lleno, en lugar de error, lo mandamos a lista de espera
    const isFull = totalOccupiedSlots >= maxPlayers;

    // Modificar datos del invitado (dominio)
    const guest: Guest = {
      name: guestData.name.trim(),
      positions: guestData.positions,
      ...(guestData.primaryPosition ? { primaryPosition: guestData.primaryPosition } : {}),
      invitedBy: playerUid,
      isWaitlist: isFull,
      ...(isFull ? { waitlistJoinedAt: new Date().toISOString() } : {}),
      confirmed: !isFull,
    };
    validateGuest(guest); // Validate standard fields

    // Agregar invitado
    transaction.update(ref, {
      guests: [...guests, guest],
    });
  });
}

// ========================
// PROMOVER INVITADO DE LISTA DE ESPERA
// ========================

/**
 * Promueve un invitado desde la lista de espera a titular si hay cupo disponible.
 */
export async function promoteGuestToMatch(
  matchId: string,
  guestName: string,
  inviterUid: string
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

    // Verificar si el partido ya está lleno
    const confirmedCount = getConfirmedCount(players);
    const confirmedGuests = guests.filter(g => g.confirmed !== false && !g.isWaitlist);
    const totalOccupiedSlots = confirmedCount + confirmedGuests.length;

    if (totalOccupiedSlots >= maxPlayers) {
      throw new MatchFullError(); // "El partido ya está lleno."
    }

    // Buscar al invitado
    const guestIndex = guests.findIndex(
      (g) => g.name === guestName && g.invitedBy === inviterUid
    );

    if (guestIndex === -1) {
      throw new GuestBusinessError("El invitado no se encuentra en el partido o no fue invitado por ti.");
    }

    // Actualizar sus propiedades a confirmado
    guests[guestIndex] = {
      ...guests[guestIndex],
      isWaitlist: false,
      confirmed: true,
    };

    transaction.update(ref, {
      guests: guests,
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
