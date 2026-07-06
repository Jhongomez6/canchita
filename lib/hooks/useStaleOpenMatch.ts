"use client";

/**
 * useStaleOpenMatch — detecta si el usuario tiene un partido `open` vencido
 * (fecha de juego > STALE_OPEN_MATCH_DAYS días) creado por él mismo.
 *
 * Usado en `/new-match` para bloquear la creación de un partido nuevo hasta
 * cerrar el pendiente. Fail-open: si la verificación falla (offline/timeout)
 * no se reporta stale y se permite crear (el guard de `createMatch` reintenta).
 *
 * See: docs/BLOCK_CREATE_ON_STALE_OPEN_MATCH_SDD.md
 */

import { useEffect, useRef, useState } from "react";
import { getStaleOpenMatchForCreator } from "@/lib/matches";
import { daysSinceMatch } from "@/lib/domain/match";
import { logMatchCreateBlocked } from "@/lib/analytics";
import type { Match } from "@/lib/domain/match";

export function useStaleOpenMatch(uid: string | undefined): {
  staleMatch: Match | null;
  loading: boolean;
} {
  const [staleMatch, setStaleMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getStaleOpenMatchForCreator(uid)
      .then((match) => {
        if (cancelled) return;
        setStaleMatch(match);
        if (match && !loggedRef.current) {
          loggedRef.current = true;
          logMatchCreateBlocked(match.id, daysSinceMatch(match, new Date()));
        }
      })
      .catch((e) => {
        // Fail-open: no bloqueamos por un fallo de infraestructura.
        console.warn("[useStaleOpenMatch] verificación falló, se permite crear:", e);
        if (!cancelled) setStaleMatch(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { staleMatch, loading };
}
