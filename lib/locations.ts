import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const locationsRef = collection(db, "locations");

export async function createLocation(data: {
  name: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  createdBy: string;
}) {
  // 🔒 Evitar duplicados por placeId
  const q = query(locationsRef, where("placeId", "==", data.placeId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    throw new Error("Esta cancha ya existe");
  }

  await addDoc(locationsRef, {
    ...data,
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function getActiveLocations() {
  const q = query(
    collection(db, "locations"),
    where("active", "==", true)
  );

  const snap = await getDocs(q);

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

