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
  limit as firestoreLimit,
  startAfter,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  deleteDoc,
  type DocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { withTimeout } from "./utils/withTimeout";
import { getUserProfile } from "./users";
import { Timestamp } from "firebase/firestore";
import type { Player, Position } from "./domain/player";
import type { Match } from "./domain/match";
import { getConfirmedCount } from "./domain/match";
import type { MultiTeamTournament, MultiTeam } from "./domain/multiTeam";
import {
  generateFixtures,
  addPlayerToSmallestTeam,
  removePlayerFromTeams,
  getMultiTeamQuality,
  validateFixtureScore,
} from "./domain/multiTeam";
import { TEAM_COLOR_CONFIG, type TeamColor } from "./domain/team-colors";
import { MatchFullError, BusinessError, ValidationError } from "./domain/errors";
import { canManageLocation, canCreatePublicMatch } from "./domain/user";
import {
  logMatchCreated,
  logMatchJoined,
  logAttendanceConfirmed,
  logTeamsBalanced,
  logMatchClosed,
  logMvpVoted,
  logTeamsConfirmed,
  logMultiTeamsBalanced,
  logMultiTeamsConfirmed,
  logFixtureScoreSaved,
} from "./analytics";

// Re-export para backward compatibility
export type { Match };

const matchesRef = collection(db, "matches");

/** Tope de partidos recientes por usuario (Home/History del jugador). Los abiertos,
 *  recientes por naturaleza, siempre entran; el corte solo afecta historial viejo. */
const MY_MATCHES_LIMIT = 100;
/** Tope de partidos recientes a nivel plataforma (Home del super admin). Se suma a
 *  TODOS los abiertos, que se traen aparte para no perder los accionables. */
const ALL_MATCHES_RECENT_LIMIT = 150;

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
  deposit?: number;
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
      photoURLThumb: profile.photoURLThumb || null,
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
  // Acotamos cada query a los N partidos más recientes por creación. Los partidos
  // abiertos son recientes por naturaleza (se cierran al jugarse), así que siempre
  // entran en la ventana; lo que queda fuera es historial viejo (paginación = follow-up).
  const playerQ = query(
    matchesRef,
    where("playerUids", "array-contains", uid),
    orderBy("createdAt", "desc"),
    firestoreLimit(MY_MATCHES_LIMIT)
  );

  // Query 2: partidos creados por el usuario (cubre caso donde admin no está en playerUids)
  const creatorQ = query(
    matchesRef,
    where("createdBy", "==", uid),
    orderBy("createdAt", "desc"),
    firestoreLimit(MY_MATCHES_LIMIT)
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
   OBTENER TODOS LOS PARTIDOS (SUPER ADMIN)
========================= */
export async function getAllMatches(): Promise<Match[]> {
  // Evitamos leer la colección entera (crece sin techo a nivel plataforma). Traemos:
  //  (1) TODOS los partidos abiertos → accionables y naturalmente acotados (se cierran);
  //      garantiza que el "próximo partido" del admin nunca se pierda por el límite.
  //  (2) los N más recientes por creación → historial reciente.
  // Merge + dedupe. Ninguna de las dos queries requiere índice compuesto nuevo.
  const openQ = query(matchesRef, where("status", "==", "open"));
  const recentQ = query(matchesRef, orderBy("createdAt", "desc"), firestoreLimit(ALL_MATCHES_RECENT_LIMIT));

  const [openSnap, recentSnap] = await Promise.all([getDocs(openQ), getDocs(recentQ)]);

  const matchMap = new Map<string, Match>();
  for (const snap of [openSnap, recentSnap]) {
    for (const d of snap.docs) {
      if (!matchMap.has(d.id)) {
        matchMap.set(d.id, { id: d.id, ...(d.data() as Omit<Match, "id">) });
      }
    }
  }
  return Array.from(matchMap.values());
}

/* =========================
   HISTORIAL PAGINADO (cursor) — /history
   Una sola query ordenada por createdAt desc (índices ya existentes), filtrando
   `closed` en cliente. Jugador → sus partidos (`playerUids` = "partidos jugados");
   super admin → todos. `reachedEnd` se calcula sobre los docs CRUDOS (antes del
   filtro) para saber si quedan más páginas.
========================= */
export interface ClosedMatchesPage {
  matches: Match[];
  lastDoc: DocumentSnapshot | null;
  reachedEnd: boolean;
}

export async function getClosedMatchesPage(
  uid: string,
  isSuperAdmin: boolean,
  pageSize = 20,
  cursor?: DocumentSnapshot,
): Promise<ClosedMatchesPage> {
  const constraints: QueryConstraint[] = [
    ...(isSuperAdmin ? [] : [where("playerUids", "array-contains", uid)]),
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    firestoreLimit(pageSize),
  ];

  const snap = await withTimeout(getDocs(query(matchesRef, ...constraints)));
  const matches = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Match, "id">) }))
    .filter((m) => m.status === "closed");
  const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return { matches, lastDoc, reachedEnd: snap.docs.length < pageSize };
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
      ...(profile?.photoURLThumb ? { photoURLThumb: profile.photoURLThumb } : {}),
    };

    const updateData: Record<string, unknown> = {
      players: [...players, newPlayer],
      playerUids: arrayUnion(user.uid),
    };

    if (data.teams?.A && data.teams?.B) {
      updateData.teams = assignToSmallestTeam(data.teams as { A: Player[]; B: Player[] }, newPlayer as unknown as Player);
    }

    // Modo multi: asignar el nuevo jugador al equipo con menos jugadores (fixtures no cambian)
    if (data.multiTeam?.teams) {
      const tournament = data.multiTeam as MultiTeamTournament;
      updateData.multiTeam = {
        ...tournament,
        teams: addPlayerToSmallestTeam(tournament.teams, newPlayer as unknown as Player),
      };
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
      ...(profile?.photoURLThumb ? { photoURLThumb: profile.photoURLThumb } : {}),
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
   MOVER CONFIRMADO A LISTA DE ESPERA
========================= */
export async function moveToWaitlist(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players: Player[] = data.players || [];

    const playerIndex = players.findIndex(
      (p) => p.name === playerName && p.confirmed && !p.isWaitlist
    );
    if (playerIndex === -1) return;

    // Calcular timestamp para quedar primero en la lista de espera
    const waitlistTimes = players
      .filter((p) => p.isWaitlist && p.waitlistJoinedAt)
      .map((p) => new Date(p.waitlistJoinedAt!).getTime());
    const earliestWaitlist = waitlistTimes.length > 0 ? Math.min(...waitlistTimes) : null;
    const waitlistJoinedAt = earliestWaitlist !== null
      ? new Date(earliestWaitlist - 1).toISOString()
      : new Date().toISOString();

    const updatedPlayers = [...players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      confirmed: false,
      isWaitlist: true,
      waitlistJoinedAt,
    };

    const updateData: Record<string, unknown> = { players: updatedPlayers };

    // Remover del equipo balanceado si existe
    if (data.teams?.A && data.teams?.B) {
      updateData.teams = {
        A: (data.teams.A as Player[]).filter((p) => p.name !== playerName),
        B: (data.teams.B as Player[]).filter((p) => p.name !== playerName),
      };
    }
    if (data.multiTeam?.teams) {
      const t = data.multiTeam as MultiTeamTournament;
      updateData.multiTeam = { ...t, teams: removePlayerFromTeams(t.teams, playerName) };
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
    if (data.multiTeam?.teams) {
      const t = data.multiTeam as MultiTeamTournament;
      approveUpdate.multiTeam = {
        ...t,
        teams: addPlayerToSmallestTeam(t.teams, updatedPlayers[playerIndex]),
      };
    }

    transaction.update(ref, approveUpdate);
  });
}

/* =========================
   CONFIRMAR / DESCONFIRMAR
========================= */
export async function confirmAttendance(
  matchId: string,
  playerName: string,
  uid?: string
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

    // Si el uid fue removido de playerUids (ej. al cancelar asistencia), restaurarlo
    if (uid) {
      confirmUpdate.playerUids = arrayUnion(uid);
    }

    if (data.teams?.A && data.teams?.B) {
      const confirmedPlayer = updatedPlayers.find((p) => p.name === playerName);
      if (confirmedPlayer) {
        confirmUpdate.teams = assignToSmallestTeam(
          data.teams as { A: Player[]; B: Player[] },
          confirmedPlayer
        );
      }
    }
    if (data.multiTeam?.teams) {
      const confirmedPlayer = updatedPlayers.find((p) => p.name === playerName);
      if (confirmedPlayer) {
        const t = data.multiTeam as MultiTeamTournament;
        confirmUpdate.multiTeam = { ...t, teams: addPlayerToSmallestTeam(t.teams, confirmedPlayer) };
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
    const playerUids: string[] = data.playerUids || [];

    const cancelledPlayer = players.find((p) => p.name === playerName);

    const updatedPlayers = players.map((p) =>
      p.name === playerName ? { ...p, confirmed: false } : p
    );

    const updateData: Record<string, unknown> = {
      players: updatedPlayers,
      playerUids: cancelledPlayer?.uid
        ? playerUids.filter((uid) => uid !== cancelledPlayer.uid)
        : playerUids,
    };

    // Remove player from balanced teams if they exist
    if (data.teams?.A && data.teams?.B) {
      const teamA = (data.teams.A as Player[]).filter((p) => p.name !== playerName);
      const teamB = (data.teams.B as Player[]).filter((p) => p.name !== playerName);
      updateData.teams = { A: teamA, B: teamB };
    }

    // Modo multi: quitar al jugador de su equipo (por nombre)
    if (data.multiTeam?.teams) {
      const tournament = data.multiTeam as MultiTeamTournament;
      updateData.multiTeam = {
        ...tournament,
        teams: removePlayerFromTeams(tournament.teams, playerName),
      };
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
  let photoURLThumb: string | undefined;
  if (player.uid) {
    const profile = await getUserProfile(player.uid);
    photoURL = profile?.photoURL;
    photoURLThumb = profile?.photoURLThumb;
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
      confirmed: player.confirmed ?? true,
      ...(photoURL ? { photoURL } : {}),
      ...(photoURLThumb ? { photoURLThumb } : {}),
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
    if (match.multiTeam?.teams) {
      const t = match.multiTeam as MultiTeamTournament;
      updateData.multiTeam = {
        ...t,
        teams: addPlayerToSmallestTeam(t.teams, newPlayer as unknown as Player),
      };
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
   MODO MULTI-EQUIPO (round-robin)
========================= */

/**
 * Guarda/regenera los N equipos del modo multi. Transaccional: valida que el
 * partido siga abierto. NO genera fixtures aún (eso lo hace confirm).
 * Las ramas join/leave mantienen `multiTeam` consistente si la convocatoria
 * cambia después de balancear.
 */
export async function saveMultiTeams(
  matchId: string,
  tournament: MultiTeamTournament,
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    if (data.status !== "open") throw new BusinessError("El partido no está abierto");
    transaction.update(ref, {
      matchMode: "multi",
      multiTeam: { ...tournament, confirmed: false },
      // Limpia el modo clásico para garantizar exclusividad
      teams: null,
      score: null,
      teamsConfirmed: false,
    });
  });
  const playersCount = tournament.teams.reduce((s, t) => s + t.players.length, 0);
  logMultiTeamsBalanced(matchId, tournament.numTeams, playersCount, getMultiTeamQuality(tournament.teams).cost);
}

/**
 * Actualiza SOLO el roster de los equipos multi (sin tocar fixtures ni confirmación).
 * Permite reajustar equipos por drag después de confirmar, preservando marcadores.
 */
export async function updateMultiTeamRoster(matchId: string, teams: MultiTeam[]) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    if (!data.multiTeam?.teams) throw new BusinessError("No hay equipos multi");
    if (data.status !== "open") throw new BusinessError("El partido no está abierto");
    transaction.update(ref, { "multiTeam.teams": teams });
  });
}

/**
 * Cambia el color (y por ende el nombre) de un equipo multi. El color = el peto real
 * que usarán en cancha. Valida que el color no esté tomado por otro equipo.
 */
export async function updateMultiTeamColor(matchId: string, teamId: string, color: TeamColor) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    const tournament = data.multiTeam as MultiTeamTournament | undefined;
    if (!tournament?.teams?.length) throw new BusinessError("No hay equipos multi");
    if (data.status !== "open") throw new BusinessError("El partido no está abierto");
    if (tournament.teams.some((t) => t.id !== teamId && t.color === color)) {
      throw new BusinessError("Ese color ya está en uso por otro equipo");
    }
    const teams = tournament.teams.map((t) =>
      t.id === teamId
        ? { ...t, color, name: `Equipo ${TEAM_COLOR_CONFIG[color].label}` }
        : t,
    );
    transaction.update(ref, { "multiTeam.teams": teams });
  });
}

/**
 * Publica los equipos multi y genera los fixtures round-robin si aún no existen.
 * Transaccional. Marca `teamsConfirmed` para el timeline compartido.
 */
export async function confirmMultiTeams(matchId: string) {
  const ref = doc(db, "matches", matchId);
  let numTeams = 0;
  let numFixtures = 0;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    const tournament = data.multiTeam as MultiTeamTournament | undefined;
    if (!tournament?.teams?.length) throw new BusinessError("No hay equipos multi para confirmar");
    if (data.status !== "open") throw new BusinessError("El partido no está abierto");

    const fixtures = tournament.fixtures?.length
      ? tournament.fixtures
      : generateFixtures(tournament.teams);

    numTeams = tournament.teams.length;
    numFixtures = fixtures.length;

    transaction.update(ref, {
      multiTeam: {
        ...tournament,
        fixtures,
        confirmed: true,
        confirmedAt: new Date().toISOString(),
      },
      teamsConfirmed: true,
      teamsConfirmedAt: new Date().toISOString(),
    });
  });
  logMultiTeamsConfirmed(matchId, numTeams, numFixtures);
}

/**
 * Registra el marcador de un fixture. Transaccional: lee fresco el array de
 * fixtures y reemplaza SOLO el fixture con id coincidente → dos admins editando
 * fixtures distintos no se pisan.
 */
export async function saveFixtureScore(
  matchId: string,
  fixtureId: string,
  scoreHome: number,
  scoreAway: number,
) {
  validateFixtureScore(scoreHome);
  validateFixtureScore(scoreAway);

  const ref = doc(db, "matches", matchId);
  let wasFirstEdit = false;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    const tournament = data.multiTeam as MultiTeamTournament | undefined;
    if (!tournament?.fixtures?.length) throw new BusinessError("El partido no tiene fixtures");

    const target = tournament.fixtures.find((f) => f.id === fixtureId);
    if (!target) throw new ValidationError("Fixture inexistente");
    wasFirstEdit = target.scoreHome == null || target.scoreAway == null;

    const fixtures = tournament.fixtures.map((f) =>
      f.id === fixtureId
        ? { ...f, scoreHome, scoreAway, playedAt: new Date().toISOString() }
        : f,
    );

    transaction.update(ref, { "multiTeam.fixtures": fixtures });
  });
  logFixtureScoreSaved(matchId, fixtureId, wasFirstEdit);
}

/**
 * Reordena un fixture una posición hacia arriba o abajo. Transaccional: lee fresco
 * (preserva marcadores editados en paralelo) y solo intercambia dos posiciones.
 */
export async function reorderFixtures(
  matchId: string,
  fixtureId: string,
  direction: "up" | "down",
) {
  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new BusinessError("El partido no existe");
    const data = snap.data();
    const tournament = data.multiTeam as MultiTeamTournament | undefined;
    if (!tournament?.fixtures?.length) throw new BusinessError("El partido no tiene fixtures");

    const fixtures = [...tournament.fixtures];
    const idx = fixtures.findIndex((f) => f.id === fixtureId);
    if (idx === -1) throw new ValidationError("Fixture inexistente");

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= fixtures.length) return; // borde: no-op
    [fixtures[idx], fixtures[swapIdx]] = [fixtures[swapIdx], fixtures[idx]];

    transaction.update(ref, { "multiTeam.fixtures": fixtures });
  });
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
  logMvpVoted(matchId, targetId);
}

/* =========================
   COBROS — REGISTRAR PAGO
========================= */
/**
 * Guarda todo el mapa de pagos en una sola operación
 */
export async function savePaymentsInBatch(
  matchId: string,
  payments: Record<string, boolean>
): Promise<void> {
  const ref = doc(db, "matches", matchId);
  const updateData: Record<string, boolean> = {};

  // Convertir Record a dot-notation updates
  Object.entries(payments).forEach(([key, value]) => {
    updateData[`payments.${key}`] = value;
  });

  await updateDoc(ref, updateData);
}

export async function updateTeamColors(
  matchId: string,
  colors: { A: string; B: string }
): Promise<void> {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { teamColors: colors });
}

export async function updateMatchDatetime(
  matchId: string,
  date: string,
  time: string
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BusinessError("Fecha inválida. Formato esperado: YYYY-MM-DD");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new BusinessError("Hora inválida. Formato esperado: HH:MM");
  }
  const startsAt = new Date(`${date}T${time}:00-05:00`);
  if (isNaN(startsAt.getTime())) {
    throw new BusinessError("Fecha/hora no parseable");
  }
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, {
    date,
    time,
    startsAt: Timestamp.fromDate(startsAt),
  });
}

/**
 * Borra un partido.
 * - Si tiene depósito o jugadores confirmados: usa la Cloud Function
 *   (reembolsa depósitos + envía notificaciones in-app).
 * - Si no hay nada que notificar ni reembolsar: borra directo (más rápido y barato).
 */
export async function deleteMatch(
  matchId: string,
  opts?: { hasDeposit?: boolean; confirmedCount?: number }
): Promise<{ refundedCount: number }> {
  const needsFunction = (opts?.hasDeposit ?? false) || (opts?.confirmedCount ?? 0) > 0;
  if (needsFunction) {
    const { deleteMatchWithRefunds } = await import("./wallet");
    return deleteMatchWithRefunds(matchId);
  }
  const ref = doc(db, "matches", matchId);
  await deleteDoc(ref);
  return { refundedCount: 0 };
}
