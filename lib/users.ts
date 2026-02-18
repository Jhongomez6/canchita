/**
 * ========================
 * USER MANAGEMENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para gestionar usuarios.
 * Usa tipos del dominio (`lib/domain/user.ts`).
 */

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import type { UserProfile } from "./domain/user";

/* =========================
   CREAR / ASEGURAR PERFIL
========================= */
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
      role: "player",
    });
  }
}

/* =========================
   OBTENER PERFIL
========================= */
export async function getUserProfile(
  uid: string
): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return { uid: snap.id, ...snap.data() } as UserProfile;
}

/* =========================
   ACTUALIZAR POSICIONES
========================= */
export async function updateUserPositions(
  uid: string,
  positions: string[]
) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { positions });
}

/* =========================
   OBTENER TODOS LOS USUARIOS
========================= */
export async function getAllUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  return snapshot.docs.map((d) => ({
    uid: d.id,
    ...d.data(),
  })) as UserProfile[];
}

/* =========================
   ACTUALIZAR NOMBRE
========================= */
export async function updateUserName(uid: string, name: string) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { name, nameLastChanged: new Date().toISOString() });
}

/* =========================
   ELIMINAR USUARIO
========================= */
export async function deleteUser(uid: string) {
  const ref = doc(db, "users", uid);
  await deleteDoc(ref);
}
