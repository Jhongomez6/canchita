import { collection, addDoc, getDocs,getDoc, query, where, orderBy, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";

const matchesRef = collection(db, "matches");

export async function createMatch(match: {
  date: string;
  time: string;
  location: string;
  createdBy: string;
}) {
  await addDoc(matchesRef, {
    ...match,
    players: [],
    createdAt: new Date(),
  });
}

export async function getMyMatches(uid: string) {
  const q = query(
    matchesRef,
    where("createdBy", "==", uid),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// Agregar jugador
export async function addPlayerToMatch(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);

  await updateDoc(ref, {
    players: arrayUnion({
      name: playerName,
      confirmed: false,
    }),
  });
}

// Eliminar jugador
export async function removePlayerFromMatch(
  matchId: string,
  player: { name: string; confirmed: boolean }
) {
  const ref = doc(db, "matches", matchId);

  await updateDoc(ref, {
    players: arrayRemove(player),
  });
}

// Confirmar asistencia (marca confirmed = true)
export async function confirmAttendance(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const data = snap.data();
  const players = data.players || [];

  const updatedPlayers = players.map((p: any) =>
    p.name === playerName ? { ...p, confirmed: true } : p
  );

  await updateDoc(ref, {
    players: updatedPlayers,
  });
}

// Agregarse al partido (evita duplicados)
export async function joinMatch(
  matchId: string,
  playerName: string
) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const data = snap.data();
  const players = data.players || [];

  const exists = players.some((p: any) => p.name === playerName);
  if (exists) return;

  await updateDoc(ref, {
    players: [
      ...players,
      { name: playerName, confirmed: true },
    ],
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

  await updateDoc(ref, {
    players: updatedPlayers,
  });
}