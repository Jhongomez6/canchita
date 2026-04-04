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
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { getUserProfile } from "./users";
import { Timestamp } from "firebase/firestore";
import type { Player, Position } from "./domain/player";
import type { Match } from "./domain/match";
import { getConfirmedCount } from "./domain/match";
import { MatchFullError, BusinessError } from "./domain/errors";
import { canManageLocation, canCreatePublicMatch } from "./domain/user";
import {
  logMatchCreated,
  logMatchJoined,
  logAttendanceConfirmed,
  logTeamsBalanced,
  logMatchClosed,
  logMvpVoted,
  logTeamsConfirmed,
} from "./analytics";

// Re-export para backward compatibility
export type { Match };

const matchesRef = collection(db, "matches");

/* =========================
   HELPER: ASIGNAR AL EQUIPO MÁS PEQUEÑO
========================= */
function assignToSmallestTeam(
  teams: { A: Player[]; B: Player[] },
  player: Player
): { A: Player[]; B: Player[] } {
  if (teams.A.length <= teams.B.length) {
    return { A: [...teams.A, player], B: teams.B };
  } else {
    return { A: teams.A, B: [...teams.B, player] };
  }
}

/* =========================
   CREAR PARTIDO
========================= */
export async function createMatch(match: {
  date: string;
  time: string;
  duration: number;
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
  isPrivate?: boolean;
  allowGuests?: boolean;
  instructions?: string;
}) {
  const profile = await getUserProfile(match.createdBy);
  if (!profile) throw new Error("No se encontró el perfil de usuario");

  // Validate location permissions
  if (!canManageLocation(profile, match.locationId)) {
    throw new Error("No tienes permisos para crear partidos en esta cancha.");
  }

  // Validate match visibility permissions
  if (!match.isPrivate && !canCreatePublicMatch(profile)) {
    throw new Error("No tienes permisos para crear partidos públicos.");
  }

  const startsAt = new Date(`${match.date}T${match.time}:00-05:00`);

  const docRef = await addDoc(matchesRef, {
    ...match,
    creatorAdminType: profile.adminType || "super_admin",
    creatorSnapshot: {
      name: profile.name,
      photoURL: profile.photoURL || null,
      phone: profile.phone || null,
    },
    isPrivate: match.isPrivate || false,
    allowGuests: match.allowGuests ?? true,
    players: [],
    remindersSent: {
      "24h": false,
      "12h": false,
      "6h": false,
    },
    playerUids: [match.createdBy],
    startsAt: Timestamp.fromDate(startsAt),
    createdAt: new Date(),
    status: "open",
  });
  logMatchCreated(docRef.id);
}

/* =========================
   OBTENER PARTIDOS DEL USUARIO
   (ADMIN + PLAYER)
========================= */
export async function getMyMatches(uid: string): Promise<Match[]> {
  // Query 1: partidos donde el usuario es jugador
  const playerQ = query(
    matchesRef,
    where("playerUids", "array-contains", uid),
    orderBy("createdAt", "desc")
  );

  // Query 2: partidos creados por el usuario (cubre caso donde admin no está en playerUids)
  const creatorQ = query(
    matchesRef,
    where("createdBy", "==", uid),
    orderBy("createdAt", "desc")
  );

  const [playerSnap, creatorSnap] = await Promise.all([
    getDocs(playerQ),
    getDocs(creatorQ),
  ]);

  // Merge y deduplicar
  const matchMap = new Map<string, Match>();
  for (const snap of [playerSnap, creatorSnap]) {
    for (const d of snap.docs) {
      if (!matchMap.has(d.id)) {
        matchMap.set(d.id, { id: d.id, ...(d.data() as Omit<Match, "id">) });
      }
    }
  }

  return Array.from(matchMap.values());
}

/* =========================
   OBTENER PARTIDOS ABIERTOS (EXPLORE)
========================= */
export async function getOpenMatches(): Promise<Match[]> {
  // Solo traemos los status 'open' y los ordenamos por fecha/hora en el cliente
  // ya que Firebase requiere índices complejos para múltiples campos orderBy
  const q = query(
    matchesRef,
    where("status", "==", "open")
  );

  const snapshot = await getDocs(q);
  const now = new Date();

  // Filtrar los que ya pasaron y los privados
  const matches = snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Match, "id">),
  })).filter(m => {
    if (m.isPrivate) return false;

    const matchDate = new Date(`${m.date}T${m.time}:00-05:00`);
    // Retornar solo partidos futuros (o de hoy que aún no pasan)
    return matchDate > now;
  });

  // Ordenar por fecha y hora más cercana
  return matches.sort((a, b) => {
    const timeA = new Date(`${a.date}T${a.time}:00-05:00`).getTime();
    const timeB = new Date(`${b.date}T${b.time}:00-05:00`).getTime();
    return timeA - timeB;
  });
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
        
    const primaryPosition: Position | undefined = profile?.primaryPosition;

    const level = profile?.level ?? 2;

    const newPlayer = {
      uid: user.uid,
      name: user.name,
      confirmed: true,
      level,
      positions,
      ...(primaryPosition ? { primaryPosition } : {}),
      sex: profile?.sex,
      ...(profile?.phone ? { phone: profile.phone } : {}),
      ...(profile?.photoURL ? { photoURL: profile.photoURL } : {}),
    };

    const updateData: Record<string, unknown> = {
      players: [...players, newPlayer],
      playerUids: arrayUnion(user.uid),
    };

    if (data.teams?.A && data.teams?.B) {
      updateData.teams = assignToSmallestTeam(data.teams as { A: Player[]; B: Player[] }, newPlayer as unknown as Player);
    }

    transaction.update(ref, updateData);
  });
  logMatchJoined(matchId);
}

/* =========================
   LISTA DE ESPERA (WAITLIST)
========================= */
export async function joinWaitlist(
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

    // 🔒 Evitar duplicados reales (ya está en waitlist o confirmado)
    const existingPlayer = players.find((p) => p.uid === user.uid);
    if (existingPlayer?.isWaitlist || existingPlayer?.confirmed) return;

    const profile = await getUserProfile(user.uid);
    const positions: Position[] =
      profile?.positions && profile.positions.length > 0
        ? profile.positions
        : ["MID"];

    const primaryPosition: Position | undefined = profile?.primaryPosition;

    const level = profile?.level ?? 2;

    const waitlistEntry = {
      uid: user.uid,
      name: user.name,
      confirmed: false,
      isWaitlist: true,
      waitlistJoinedAt: new Date().toISOString(),
      level,
      positions,
      ...(primaryPosition ? { primaryPosition } : {}),
      sex: profile?.sex,
      ...(profile?.phone ? { phone: profile.phone } : {}),
      ...(profile?.photoURL ? { photoURL: profile.photoURL } : {}),
    };

    // Si el jugador ya existe pero canceló (confirmed: false, no waitlist), actualizar su registro
    const updatedPlayers = existingPlayer
      ? players.map((p) => (p.uid === user.uid ? { ...p, ...waitlistEntry } : p))
      : [...players, waitlistEntry];

    transaction.update(ref, {
      players: updatedPlayers,
      playerUids: arrayUnion(user.uid),
    });
  });
}

export async function leaveWaitlist(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players: Player[] = data.players || [];

    // Encontrar el jugador
    const removedPlayer = players.find(
      (p) => p.name === playerName && p.isWaitlist
    );

    if (!removedPlayer) return;

    const updatedPlayers = players.filter(
      (p) => !(p.name === playerName && p.isWaitlist)
    );

    const updateData: Record<string, unknown> = {
      players: updatedPlayers,
    };

    if (removedPlayer?.uid) {
      updateData.playerUids = arrayRemove(removedPlayer.uid);
    }

    transaction.update(ref, updateData);
  });
}

/* =========================
   APROBAR DE L. DE ESPERA
========================= */
export async function approveFromWaitlist(
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

    const playerIndex = players.findIndex(
      (p) => p.name === playerName && p.isWaitlist
    );
    if (playerIndex === -1) return;

    const confirmedCount = getConfirmedCount(players);

    // ❌ Partido lleno
    if (confirmedCount >= maxPlayers) {
      throw new MatchFullError();
    }

    const updatedPlayers = [...players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      confirmed: true,
      isWaitlist: false,
    };

    const approveUpdate: Record<string, unknown> = { players: updatedPlayers };
    if (data.teams?.A && data.teams?.B) {
      approveUpdate.teams = assignToSmallestTeam(
        data.teams as { A: Player[]; B: Player[] },
        updatedPlayers[playerIndex]
      );
    }

    transaction.update(ref, approveUpdate);
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

    const confirmUpdate: Record<string, unknown> = { players: updatedPlayers };
    if (data.teams?.A && data.teams?.B) {
      const confirmedPlayer = updatedPlayers.find((p) => p.name === playerName);
      if (confirmedPlayer) {
        confirmUpdate.teams = assignToSmallestTeam(
          data.teams as { A: Player[]; B: Player[] },
          confirmedPlayer
        );
      }
    }

    transaction.update(ref, confirmUpdate);
  });
  logAttendanceConfirmed(matchId);
}

export async function unconfirmAttendance(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players: Player[] = data.players || [];

    const updatedPlayers = players.map((p) =>
      p.name === playerName ? { ...p, confirmed: false } : p
    );

    const updateData: Record<string, unknown> = { players: updatedPlayers };

    // Remove player from balanced teams if they exist
    if (data.teams?.A && data.teams?.B) {
      const teamA = (data.teams.A as Player[]).filter((p) => p.name !== playerName);
      const teamB = (data.teams.B as Player[]).filter((p) => p.name !== playerName);
      updateData.teams = { A: teamA, B: teamB };
    }

    transaction.update(ref, updateData);
  });
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
    primaryPosition?: string;
  }
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const match = snap.data();
    const players: Player[] = match.players || [];

    const updatedPlayers = players.map((p) =>
      p.name === playerName ? { ...p, ...data } : p
    );

    transaction.update(ref, { players: updatedPlayers });
  });
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
    primaryPosition?: string;
    confirmed?: boolean;
  }
) {
  // Fetch profile BEFORE transaction (doesn't compete with match doc)
  let photoURL: string | undefined;
  if (player.uid) {
    const profile = await getUserProfile(player.uid);
    photoURL = profile?.photoURL;
  }

  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
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
      confirmed: player.confirmed ?? false,
      ...(photoURL ? { photoURL } : {}),
    };

    const updateData: Record<string, unknown> = {
      players: [...players, newPlayer],
    };

    if (player.uid) {
      updateData.playerUids = arrayUnion(player.uid);
    }

    if (match.teams?.A && match.teams?.B) {
      updateData.teams = assignToSmallestTeam(
        match.teams as { A: Player[]; B: Player[] },
        newPlayer as unknown as Player
      );
    }

    transaction.update(ref, updateData);
  });
}

/* =========================
   ELIMINAR JUGADOR
========================= */
export async function deletePlayerFromMatch(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
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

    transaction.update(ref, updateData);
  });
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
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players: Player[] = data.players || [];

    const updatedPlayers = players.map((p) =>
      p.uid === uid ? { ...p, attendance } : p
    );

    transaction.update(ref, {
      players: updatedPlayers,
    });
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
  await updateDoc(ref, { teams, teamsConfirmed: false });
  logTeamsBalanced(matchId);
}

/* =========================
   CONFIRMAR EQUIPOS (PUBLICAR)
========================= */
export async function confirmTeams(matchId: string) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    if (!data.teams) throw new BusinessError("No hay equipos balanceados para confirmar");
    if (data.status !== "open") throw new BusinessError("El partido no está abierto");
    transaction.update(ref, {
      teamsConfirmed: true,
      teamsConfirmedAt: new Date().toISOString(),
    });
  });
  logTeamsConfirmed(matchId);
}

/* =========================
   CERRAR / REABRIR PARTIDO
========================= */
export async function closeMatch(matchId: string) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, {
    status: "closed",
    closedAt: new Date().toISOString()
  });
  logMatchClosed(matchId);
}

export async function reopenMatch(matchId: string) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, {
    status: "open",
    closedAt: null // Remove the closedAt timestamp marker
  });
}

/* =========================
   VOTAR POR MVP
========================= */
export async function voteForMVP(
  matchId: string,
  voterUid: string,
  targetId: string
) {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();

    // 1. Validar que el partido esté cerrado
    if (data.status !== "closed" || !data.closedAt) {
      throw new Error("No se puede votar si el partido no está cerrado.");
    }

    // 1.1 Validar que no haya votado previamente
    if (data.mvpVotes && data.mvpVotes[voterUid]) {
      throw new Error("Ya has registrado tu voto. ¡Las decisiones son definitivas!");
    }

    // 2. Validar ventana de 5 horas
    const closedTime = new Date(data.closedAt).getTime();
    const now = new Date().getTime();
    const hoursDifference = (now - closedTime) / (1000 * 60 * 60);

    if (hoursDifference > 3) {
      throw new Error("El periodo de votación (3 horas post-partido) ha terminado.");
    }

    // 2.5 Validar cierre matemático (alguien ya ganó por mayoría inalcanzable)
    const eligibleUIDs = new Set(
      data.players?.filter((p: Player) => p.confirmed && p.uid && !p.uid.startsWith("guest_")).map((p: Player) => p.uid) || []
    );
    if (data.createdBy) eligibleUIDs.add(data.createdBy);

    const totalEligibleVoters = eligibleUIDs.size;
    const votesCast = data.mvpVotes ? Object.keys(data.mvpVotes).filter(uid => eligibleUIDs.has(uid)).length : 0;
    const remainingVotes = totalEligibleVoters - votesCast;

    const voteCounts: Record<string, number> = {};
    if (data.mvpVotes) {
      Object.values(data.mvpVotes).forEach((votedId) => {
        voteCounts[votedId as string] = (voteCounts[votedId as string] || 0) + 1;
      });
    }

    const sortedMVPLeaderboard = Object.entries(voteCounts)
      .sort(([, a], [, b]) => b - a);

    const topMvpScore = sortedMVPLeaderboard.length > 0 ? sortedMVPLeaderboard[0][1] : 0;
    const secondHighestScore = sortedMVPLeaderboard.length > 1 ? sortedMVPLeaderboard[1][1] : 0;

    const mathematicallyClosed = topMvpScore > 0 && topMvpScore > secondHighestScore + remainingVotes;
    const allEligibleVoted = totalEligibleVoters > 0 && remainingVotes <= 0;

    if (mathematicallyClosed || allEligibleVoted) {
      throw new Error("La votación ya ha concluido (el MVP ha sido decidido matemáticamente o todos han votado).");
    }

    // 3. Empujar el voto seguro via Dot Notation
    const updatePath = `mvpVotes.${voterUid}`;
    transaction.update(ref, {
      [updatePath]: targetId
    });
  });
  logMvpVoted(matchId);
}

export async function deleteMatch(matchId: string): Promise<void> {
  const ref = doc(db, "matches", matchId);
  await deleteDoc(ref);
}
