"use client";

/**
 * useActiveVenues — sedes activas (dato global, mismo para todos los usuarios).
 * Caché compartida bajo una sola key, con timeout + refresh por visibility.
 *
 * `enabled` permite no fetchear cuando el usuario no tiene acceso a reservas
 * (en ese caso la página redirige y no necesita los datos).
 *
 * See: docs/IOS_PWA_HOME_STALE_LOADING_SDD.md
 */

import { getActiveVenues } from "@/lib/venues";
import type { Venue } from "@/lib/domain/venue";
import { createCachedQueryHook } from "./createCachedQueryHook";

export const useActiveVenues = createCachedQueryHook<{ enabled: boolean }, Venue[]>(
  async () => getActiveVenues(),
  ({ enabled }) => (enabled ? "active" : null),
  { source: "active_venues" }
);
