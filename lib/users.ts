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
      roles: ["player"],
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

  const data = snap.data();
  // Backward compat: old docs have `role` (string) instead of `roles` (array)
  const roles = data.roles ?? (data.role ? [data.role] : ["player"]);
  return { uid: snap.id, ...data, roles } as UserProfile;
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
  return snapshot.docs.map((d) => {
    const data = d.data();
    const roles = data.roles ?? (data.role ? [data.role] : ["player"]);
    return { uid: d.id, ...data, roles } as UserProfile;
  });
}

/* =========================
   ACTUALIZAR NOMBRE
========================= */
export async function updateUserName(uid: string, name: string) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { name, nameLastChanged: new Date().toISOString() });
}

/* =========================
   GUARDAR ONBOARDING
========================= */
export async function saveOnboardingResult(
  uid: string,
  data: {
    rating: number;
    level: number;
    age: number;
    sex: string;
    dominantFoot: string;
    preferredCourt: string;
    positions: string[];
    techLevel: number;
    physLevel: number;
    hasSchool: boolean;
    hasTournaments: boolean;
    frequency: string;
  }
) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, {
    ...data,
    initialRatingCalculated: true,
    onboardingCompletedAt: new Date().toISOString(),
  });
}

/* =========================
   SOLICITAR RE-EVALUACIÓN
========================= */
export async function requestReEvaluation(uid: string) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { initialRatingCalculated: false });
}

/* =========================
   ACTUALIZAR ATRIBUTOS JUGADOR
========================= */
export async function updatePlayerAttributes(
  uid: string,
  data: { dominantFoot?: string; preferredCourt?: string }
) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, data);
}

/* =========================
   ACTUALIZAR ROLES
========================= */
export async function updateUserRoles(uid: string, roles: string[]) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { roles });
}

/* =========================
   ELIMINAR USUARIO
========================= */
export async function deleteUser(uid: string) {
  const ref = doc(db, "users", uid);
  await deleteDoc(ref);
}
