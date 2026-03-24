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
} from "firebase/firestore";
import type { UserProfile, AdminType } from "./domain/user";
import { APP_LEGAL_CONSTANTS } from "./constants";

/* =========================
   CREAR / ASEGURAR PERFIL
========================= */
function upgradeGooglePhotoURL(url?: string | null): string | null | undefined {
  if (!url) return url;
  // Google profile photos default to =s96-c (96px). Replace with larger size.
  return url.replace(/=s\d+-c$/, "=s400-c");
}

export async function ensureUserProfile(
  uid: string,
  name: string,
  email?: string | null,
  photoURL?: string | null
): Promise<{ isNewUser: boolean }> {
  photoURL = upgradeGooglePhotoURL(photoURL);
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const data: Record<string, unknown> = {
      name,
      originalGoogleName: name,
      positions: [],
      roles: ["player"],
      createdAt: new Date().toISOString(),
      authAcceptedVersion: APP_LEGAL_CONSTANTS.CURRENT_TERMS_VERSION, // Current version of Terms & Privacy
    };
    if (email) data.email = email;
    if (photoURL) data.photoURL = photoURL;
    await setDoc(ref, data);
    return { isNewUser: true };
  } else {
    // Si ya existe pero le faltan datos que ahora tenemos, los actualizamos
    const currentData = snap.data();
    const updates: Record<string, unknown> = {};
    if (email && !currentData.email) updates.email = email;
    if (photoURL && !currentData.photoURL) updates.photoURL = photoURL;
    if (!currentData.originalGoogleName) updates.originalGoogleName = name;

    if (Object.keys(updates).length > 0) {
      await updateDoc(ref, updates);
    }
    return { isNewUser: false };
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
  positions: string[],
  primaryPosition?: string
) {
  const ref = doc(db, "users", uid);
  const data: Record<string, unknown> = { positions };
  if (primaryPosition) {
    data.primaryPosition = primaryPosition;
  }
  await updateDoc(ref, data);
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
export async function updateUserName(uid: string, name: string, originalGoogleName?: string | null) {
  const ref = doc(db, "users", uid);
  const data: Record<string, string> = { name, nameLastChanged: new Date().toISOString() };
  if (originalGoogleName) {
    data.originalGoogleName = originalGoogleName;
  }
  await updateDoc(ref, data);
}

/* =========================
   ACTUALIZAR FOTO DE PERFIL
========================= */
export async function updateUserPhoto(uid: string, photoURL: string) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { photoURL });
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
    primaryPosition?: string;
    techLevel: number;
    physLevel: number;
    hasSchool: boolean;
    hasTournaments: boolean;
    frequency: string;
    phone: string;
  }
) {
  const ref = doc(db, "users", uid);
  
  const payload: Record<string, unknown> = {
    ...data,
    initialRatingCalculated: true,
    onboardingCompletedAt: new Date().toISOString(),
  };

  await setDoc(ref, payload, { merge: true });
}

/* =========================
   ACTUALIZAR TELÉFONO (AISLADO)
========================= */
export async function updateUserPhone(uid: string, phone: string) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { phone });
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
   ASIGNAR TIPO DE ADMIN
   Solo Super Admin puede llamar esta función (verificado en UI + Firestore Rules)
========================= */
export async function updateAdminType(uid: string, adminType: AdminType) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { adminType });
}

/* =========================
   ASIGNAR LOCATIONS A ADMIN
   Solo Super Admin puede llamar esta función (verificado en UI + Firestore Rules)
========================= */
export async function assignLocationsToAdmin(uid: string, locationIds: string[]) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { assignedLocationIds: locationIds });
}

/* =========================
   ELIMINAR USUARIO (anonimización — Habeas Data)
   Conserva una traza no identificable: uid, stats, nivel, fechas.
   Elimina todos los datos personales: nombre, email, foto, teléfono, tokens.
========================= */
export async function deleteUser(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as UserProfile;

  await setDoc(ref, {
    uid,
    deleted: true,
    deletedAt: new Date().toISOString(),
    createdAt: data.createdAt ?? null,
    // Stats anónimas conservadas para integridad histórica
    stats: data.stats ?? null,
    level: data.level ?? null,
    rating: data.rating ?? null,
    positions: data.positions ?? [],
    // Todo lo demás (nombre, email, foto, teléfono, tokens, etc.) se omite → borrado
  });
}

