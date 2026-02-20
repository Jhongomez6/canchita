/**
 * ========================
 * MATCH MANAGEMENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para gestionar partidos.
 * Usa tipos y reglas del dominio (`lib/domain/match.ts`).
 */

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { getUserProfile } from "./users";
import { Timestamp } from "firebase/firestore";
import type { Player, Position } from "./domain/player";
import type { Match, CreateMatchInput } from "./domain/match";
import { getConfirmedCount } from "./domain/match";
import { MatchFullError, DuplicatePlayerError } from "./domain/errors";

// Re-export para backward compatibility
export type { Match };

const matchesRef = collection(db, "matches");

/* =========================
   CREAR PARTIDO
========================= */
export async function createMatch(match: {
  date: string;
  time: string;
  locationId: string;
  startsAt: Timestamp;
  createdBy: string;
  maxPlayers: number;
  locationSnapshot: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
}) {
  const startsAt = new Date(`${match.date}T${match.time}:00-05:00`);

  await addDoc(matchesRef, {
    ...match,
    players: [],
    reminders: {
      "24h": true,
      "12h": true,
      "6h": true,
    },
    playerUids: [match.createdBy],
    startsAt: Timestamp.fromDate(startsAt),
    createdAt: new Date(),
    status: "open",
  });
}

/* =========================
   OBTENER PARTIDOS DEL USUARIO
   (ADMIN + PLAYER)
========================= */
export async function getMyMatches(uid: string): Promise<Match[]> {
  const q = query(
    matchesRef,
    where("playerUids", "array-contains", uid),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Match, "id">),
  }));
}

/* =========================
   AGREGARSE AL PARTIDO (JOIN)
========================= */
export async function joinMatch(
  matchId: string,
  user: {
    uid: string;
    name: string;
  }
) {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players: Player[] = data.players || [];
    const maxPlayers = data.maxPlayers ?? Infinity;

    // 🔒 Evitar duplicados por UID
    const alreadyExists = players.some(
      (p) => p.uid === user.uid
    );
    if (alreadyExists) return;

    // 🔢 Contar confirmados reales
    const confirmedCount = getConfirmedCount(players);

    // ❌ Partido lleno
    if (confirmedCount >= maxPlayers) {
      throw new MatchFullError();
    }

    // 🔥 Perfil del usuario
    const profile = await getUserProfile(user.uid);

    const positions: Position[] =
      profile?.positions && profile.positions.length > 0
        ? profile.positions
        : ["MID"];

    const level = profile?.level ?? 2;

    transaction.update(ref, {
      players: [
        ...players,
        {
          uid: user.uid,
          name: user.name,
          confirmed: true,
          level,
          positions,
        },
      ],
      playerUids: arrayUnion(user.uid),
    });
  });
}

/* =========================
   CONFIRMAR / DESCONFIRMAR
========================= */
export async function confirmAttendance(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players: Player[] = data.players || [];
    const maxPlayers = data.maxPlayers ?? Infinity;

    // Ya confirmado → no hacer nada
    const alreadyConfirmed = players.find(
      (p) => p.name === playerName && p.confirmed
    );
    if (alreadyConfirmed) return;

    const confirmedCount = getConfirmedCount(players);

    // ❌ Partido lleno
    if (confirmedCount >= maxPlayers) {
      throw new MatchFullError();
    }

    const updatedPlayers = players.map((p) =>
      p.name === playerName ? { ...p, confirmed: true } : p
    );

    transaction.update(ref, {
      players: updatedPlayers,
    });
  });
}

export async function unconfirmAttendance(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const players: Player[] = data.players || [];

  const updatedPlayers = players.map((p) =>
    p.name === playerName ? { ...p, confirmed: false } : p
  );

  await updateDoc(ref, { players: updatedPlayers });
}

/* =========================
   ACTUALIZAR NIVEL / POSICIONES
========================= */
export async function updatePlayerData(
  matchId: string,
  playerName: string,
  data: {
    level?: number;
    positions?: string[];
  }
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const match = snap.data();
  const players: Player[] = match.players || [];

  const updatedPlayers = players.map((p) =>
    p.name === playerName ? { ...p, ...data } : p
  );

  await updateDoc(ref, { players: updatedPlayers });
}

/* =========================
   AGREGAR JUGADOR (ADMIN)
========================= */
export async function addPlayerToMatch(
  matchId: string,
  player: {
    uid?: string;
    name: string;
    level: number;
    positions: string[];
  }
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const match = snap.data();
  const players: Player[] = match.players || [];

  const exists = players.some(
    (p) =>
      (player.uid && p.uid === player.uid) ||
      p.name === player.name
  );
  if (exists) return;

  const newPlayer = {
    ...player,
    confirmed: false,
  };

  const updateData: Record<string, unknown> = {
    players: [...players, newPlayer],
  };

  if (player.uid) {
    updateData.playerUids = arrayUnion(player.uid);
  }

  await updateDoc(ref, updateData);
}

/* =========================
   ELIMINAR JUGADOR
========================= */
export async function deletePlayerFromMatch(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const match = snap.data();
  const players: Player[] = match.players || [];

  const removedPlayer = players.find(
    (p) => p.name === playerName
  );

  const updatedPlayers = players.filter(
    (p) => p.name !== playerName
  );

  const updateData: Record<string, unknown> = {
    players: updatedPlayers,
  };

  if (removedPlayer?.uid) {
    updateData.playerUids = arrayRemove(removedPlayer.uid);
  }

  await updateDoc(ref, updateData);
}

/* =========================
   MARCAR ASISTENCIA
========================= */
export async function markPlayerAttendance(
  matchId: string,
  uid: string,
  attendance: "present" | "late" | "no_show"
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const players: Player[] = data.players || [];

  const updatedPlayers = players.map((p) =>
    p.uid === uid ? { ...p, attendance } : p
  );

  await updateDoc(ref, {
    players: updatedPlayers,
  });
}

/* =========================
   GUARDAR EQUIPOS
========================= */
export async function saveTeams(
  matchId: string,
  teams: { A: Player[]; B: Player[] }
) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { teams });
}

/* =========================
   CERRAR / REABRIR PARTIDO
========================= */
export async function closeMatch(matchId: string) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { status: "closed" });
}

export async function reopenMatch(matchId: string) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, {
    status: "open",
  });
}
