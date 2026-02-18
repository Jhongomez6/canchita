/**
 * ========================
 * LOCATION MANAGEMENT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para gestionar ubicaciones/canchas.
 * Usa tipos del dominio (`lib/domain/location.ts`).
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Location, CreateLocationInput } from "./domain/location";
import { DuplicateLocationError } from "./domain/errors";

const locationsRef = collection(db, "locations");

/* =========================
   CREAR CANCHA
========================= */
export async function createLocation(data: CreateLocationInput) {
  // 🔒 Evitar duplicados por placeId
  const q = query(locationsRef, where("placeId", "==", data.placeId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    throw new DuplicateLocationError();
  }

  await addDoc(locationsRef, {
    ...data,
    active: true,
    createdAt: serverTimestamp(),
  });
}

/* =========================
   OBTENER CANCHAS ACTIVAS
========================= */
export async function getActiveLocations(): Promise<Location[]> {
  const q = query(
    collection(db, "locations"),
    where("active", "==", true)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Location[];
}
