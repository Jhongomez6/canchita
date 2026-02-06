import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export async function ensureUserProfile(
  uid: string,
  name: string
) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      name,
      positions: [],
      role: "player", // 👈 por defecto
    });
  }
}

export async function getUserProfile(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function updateUserPositions(
  uid: string,
  positions: string[]
) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { positions });
}
