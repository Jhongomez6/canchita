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
} from "firebase/firestore";
import { db } from "./firebase";
import { getUserProfile } from "./users";

const matchesRef = collection(db, "matches");

/* =========================
   CREAR PARTIDO
========================= */
export async function createMatch(match: {
  date: string;
  time: string;
  location: string;
  createdBy: string;
  maxPlayers: number;
}) {
  const startsAt = new Date(`${match.date}T${match.time}:00`);
  await addDoc(matchesRef, {
    ...match,
    players: [],
    reminders: {
      "24h": true,
      "12h": true,
      "6h": true,
    },
    playerUids: [match.createdBy], // 👈 CLAVE
    startsAt,
    createdAt: new Date(),
    status: "open",
  });
}

/* =========================
   OBTENER PARTIDOS DEL USUARIO
   (ADMIN + PLAYER)
========================= */
export async function getMyMatches(uid: string) {
  const q = query(
    matchesRef,
    where("playerUids", "array-contains", uid),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
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
    const players = data.players || [];
    const maxPlayers = data.maxPlayers ?? Infinity;

    // 🔒 Evitar duplicados por UID
    const alreadyExists = players.some(
      (p: any) => p.uid === user.uid
    );
    if (alreadyExists) return;

    // 🔢 Contar confirmados reales
    const confirmedCount = players.filter(
      (p: any) => p.confirmed
    ).length;

    // ❌ Partido lleno
    if (confirmedCount >= maxPlayers) {
      throw new Error("MATCH_FULL");
    }

    // 🔥 Perfil del usuario
    const profile = await getUserProfile(user.uid);

    const positions =
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
      // 👇 seguimos guardando esto (no se pierde nada)
      playerUids: arrayUnion(user.uid),
    });
  });
}


/* =========================
   CONFIRMAR / DESCONFIRMAR
========================= */
import { runTransaction } from "firebase/firestore";

export async function confirmAttendance(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const players = data.players || [];
    const maxPlayers = data.maxPlayers ?? Infinity;

    // Ya confirmado → no hacer nada
    const alreadyConfirmed = players.find(
      (p: any) => p.name === playerName && p.confirmed
    );
    if (alreadyConfirmed) return;

    const confirmedCount = players.filter((p: any) => p.confirmed).length;

    // ❌ Partido lleno
    if (confirmedCount >= maxPlayers) {
      throw new Error("MATCH_FULL");
    }

    const updatedPlayers = players.map((p: any) =>
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
  const players = data.players || [];

  const updatedPlayers = players.map((p: any) =>
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

  const updatedPlayers = match.players.map((p: any) =>
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

  const exists = match.players?.some(
    (p: any) =>
      (player.uid && p.uid === player.uid) ||
      p.name === player.name
  );
  if (exists) return;

  const newPlayer = {
    ...player,
    confirmed: false,
  };

  const updateData: any = {
    players: [...(match.players || []), newPlayer],
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

  const removedPlayer = match.players.find(
    (p: any) => p.name === playerName
  );

  const updatedPlayers = match.players.filter(
    (p: any) => p.name !== playerName
  );

  const updateData: any = {
    players: updatedPlayers,
  };

  if (removedPlayer?.uid) {
    updateData.playerUids = arrayRemove(removedPlayer.uid);
  }

  await updateDoc(ref, updateData);
}

/* =========================
   GUARDAR EQUIPOS
========================= */
export async function saveTeams(
  matchId: string,
  teams: { A: any[]; B: any[] }
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
    teams: null,
  });
}
