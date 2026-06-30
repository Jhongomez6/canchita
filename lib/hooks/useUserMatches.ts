"use client";

/**
 * useUserMatches — partidos del usuario + sus locations, con caché robusta.
 * Compartido por Home (`app/page.tsx`) e History (`app/history/page.tsx`):
 * ambas fetchean exactamente lo mismo, así que comparten caché y, al navegar
 * entre ellas dentro de la ventana de stale, no hay refetch ni skeleton.
 *
 * See: docs/IOS_PWA_HOME_STALE_LOADING_SDD.md
 */

import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAllMatches, getMyMatches } from "@/lib/matches";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import { createCachedQueryHook } from "./createCachedQueryHook";

export interface UserMatchesParams {
  uid: string | null;
  isSuperAdmin: boolean;
}

export interface UserMatchesData {
  /** Partidos ordenados por fecha/hora DESC (más reciente primero). */
  matches: Match[];
  locationsMap: Record<string, Location>;
}

async function fetchLocationsMap(matches: Match[]): Promise<Record<string, Location>> {
  const ids = Array.from(new Set(matches.map((m) => m.locationId).filter(Boolean)));
  const map: Record<string, Location> = {};
  // Firestore 'in' admite hasta 30 ids por query.
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30);
    const snap = await getDocs(
      query(collection(db, "locations"), where(documentId(), "in", batch))
    );
    snap.docs.forEach((d) => {
      map[d.id] = { id: d.id, ...d.data() } as Location;
    });
  }
  return map;
}

export const useUserMatches = createCachedQueryHook<UserMatchesParams, UserMatchesData>(
  async ({ uid, isSuperAdmin }) => {
    if (!uid) return { matches: [], locationsMap: {} };
    const raw = isSuperAdmin ? await getAllMatches() : await getMyMatches(uid);
    const matches = [...raw].sort(
      (a, b) =>
        new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime()
    );
    const locationsMap = await fetchLocationsMap(matches);
    return { matches, locationsMap };
  },
  ({ uid, isSuperAdmin }) => (uid ? `${uid}:${isSuperAdmin ? "admin" : "player"}` : null),
  { source: "user_matches" }
);
