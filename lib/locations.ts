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
  documentId,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { withTimeout } from "./utils/withTimeout";
import type { Location, CreateLocationInput } from "./domain/location";
import type { UserProfile } from "./domain/user";
import { DuplicateLocationError } from "./domain/errors";
import { isSuperAdmin } from "./domain/user";

const locationsRef = collection(db, "locations");

/* =========================
   OBTENER CANCHAS POR IDS (EN LOTE)
   Trae varias locations en queries de a 30 ids (límite de `in` en Firestore),
   en vez de un getDoc por id (N+1). Devuelve un mapa id → Location.
========================= */
export async function getLocationsByIds(ids: string[]): Promise<Record<string, Location>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map: Record<string, Location> = {};
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const snap = await withTimeout(
      getDocs(query(locationsRef, where(documentId(), "in", batch)))
    );
    snap.docs.forEach((d) => {
      map[d.id] = { id: d.id, ...d.data() } as Location;
    });
  }
  return map;
}

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

/* =========================
   OBTENER CANCHAS DEL ADMIN (SCOPED)
   Super Admin → todas las activas
   Location/Team Admin → solo sus assignedLocationIds
========================= */
export async function getAdminLocations(profile: UserProfile): Promise<Location[]> {
  const allActive = await getActiveLocations();

  // Super Admin ve todas
  if (isSuperAdmin(profile)) return allActive;

  // Location/Team Admin ve solo las asignadas
  const assignedIds = profile.assignedLocationIds ?? [];
  if (assignedIds.length === 0) return [];

  return allActive.filter((loc) => assignedIds.includes(loc.id));
}

