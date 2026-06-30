"use client";

/**
 * useUserMatches — partidos del usuario + sus locations, con caché robusta.
 * Compartido por Home (`app/page.tsx`) e History (`app/history/page.tsx`):
 * ambas fetchean exactamente lo mismo, así que comparten caché y, al navegar
 * entre ellas dentro de la ventana de stale, no hay refetch ni skeleton.
 *
 * See: docs/IOS_PWA_HOME_STALE_LOADING_SDD.md
 */

import { getAllMatches, getMyMatches } from "@/lib/matches";
import { getLocationsByIds } from "@/lib/locations";
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

export const useUserMatches = createCachedQueryHook<UserMatchesParams, UserMatchesData>(
  async ({ uid, isSuperAdmin }) => {
    if (!uid) return { matches: [], locationsMap: {} };
    const raw = isSuperAdmin ? await getAllMatches() : await getMyMatches(uid);
    const matches = [...raw].sort(
      (a, b) =>
        new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime()
    );
    const locationsMap = await getLocationsByIds(matches.map((m) => m.locationId));
    return { matches, locationsMap };
  },
  ({ uid, isSuperAdmin }) => (uid ? `${uid}:${isSuperAdmin ? "admin" : "player"}` : null),
  { source: "user_matches" }
);
