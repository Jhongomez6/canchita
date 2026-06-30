"use client";

/**
 * useWorldCupData — payload de la polla (config + partidos + predicciones + bracket)
 * con caché en memoria a nivel módulo, para que reabrir/volver a `/worldcup` no
 * refetchee las 4 queries cada vez.
 *
 * Particularidad vs `createCachedQueryHook`: las predicciones y el bracket se editan
 * de forma OPTIMISTA en la UI al guardar. Si la caché fuera inmutable, una revisita
 * dentro de la ventana de stale mostraría datos viejos (la predicción recién guardada
 * "desaparecería" hasta refrescar). Por eso este hook expone `setPrediction`/`setBracket`
 * que actualizan el estado local Y la caché.
 *
 * See: docs/POLLA_MUNDIALISTA_SDD.md y docs/IOS_PWA_HOME_STALE_LOADING_SDD.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { withTimeout } from "@/lib/utils/withTimeout";
import {
  getWorldCupConfig,
  getWorldCupMatches,
  getUserPredictions,
  getUserBracketPrediction,
} from "@/lib/worldcup";
import type {
  WCConfig,
  WCMatch,
  WCPrediction,
  WCBracketPrediction,
} from "@/lib/domain/worldcup";

export interface WorldCupData {
  config: WCConfig;
  matches: WCMatch[];
  predictions: Record<string, WCPrediction>;
  bracket: WCBracketPrediction | null;
}

interface CacheEntry extends WorldCupData {
  uid: string;
  fetchedAt: number;
}

/** Edad máxima antes de refrescar en background al volver a `visible`. */
const STALE_MS = 60_000;

// Caché a nivel módulo: sobrevive a la navegación cliente, se pierde al recargar.
let cache: CacheEntry | null = null;

function cacheFor(uid: string | null): WorldCupData | null {
  if (!uid || !cache || cache.uid !== uid) return null;
  return { config: cache.config, matches: cache.matches, predictions: cache.predictions, bracket: cache.bracket };
}

async function fetchAll(uid: string): Promise<WorldCupData> {
  // Las 4 lecturas en paralelo (un round-trip) con timeout duro.
  const [config, matches, preds, bracket] = await withTimeout(
    Promise.all([
      getWorldCupConfig(),
      getWorldCupMatches(),
      getUserPredictions(uid),
      getUserBracketPrediction(uid),
    ]),
  );
  const predictions: Record<string, WCPrediction> = {};
  for (const p of preds) predictions[p.matchId] = p;
  return { config, matches, predictions, bracket };
}

export interface UseWorldCupDataResult {
  data: WorldCupData | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  /** Actualiza una predicción en estado local + caché (post-guardado optimista). */
  setPrediction: (matchId: string, pred: WCPrediction) => void;
  /** Actualiza el bracket en estado local + caché (post-guardado optimista). */
  setBracket: (bracket: WCBracketPrediction) => void;
}

interface State {
  /** uid al que pertenece este estado (para detectar cambios). */
  uid: string | null;
  data: WorldCupData | null;
  loading: boolean;
  error: Error | null;
}

function initStateFor(uid: string | null): State {
  const cached = cacheFor(uid);
  return { uid, data: cached, loading: !!uid && !cached, error: null };
}

export function useWorldCupData(uid: string | null): UseWorldCupDataResult {
  const [state, setState] = useState<State>(() => initStateFor(uid));

  // Si cambió el uid, alineamos el estado en este mismo render (patrón oficial de
  // React: "adjusting state on prop change"). Evita un flash y mantiene la vista
  // coherente con el uid actual sin un effect que haga setState.
  if (state.uid !== uid) {
    setState(initStateFor(uid));
  }

  const reqId = useRef(0);

  // run() no hace setState síncrono: el `loading` inicial ya lo pone `initStateFor`
  // (sin caché) y los refrescos en background no deben mostrar skeleton. Así es seguro
  // llamarlo desde un effect. El `loading` del reintento manual lo setea `retry` (handler).
  const run = useCallback(() => {
    if (!uid) return;
    const id = ++reqId.current;
    fetchAll(uid)
      .then((d) => {
        if (id !== reqId.current) return;
        cache = { uid, ...d, fetchedAt: Date.now() };
        setState({ uid, data: d, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (id !== reqId.current) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setState((s) => ({ ...s, loading: false, error: e }));
      });
  }, [uid]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    run();
  }, [run]);

  // Fetch al montar / cambiar uid: solo si no hay caché o está stale.
  useEffect(() => {
    if (!uid) return;
    if (!cacheFor(uid) || !cache || Date.now() - cache.fetchedAt > STALE_MS) run();
  }, [uid, run]);

  // Refresh al volver a `visible` si está stale.
  useEffect(() => {
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (cache && cache.uid === uid && Date.now() - cache.fetchedAt > STALE_MS) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [uid, run]);

  const setPrediction = useCallback(
    (matchId: string, pred: WCPrediction) => {
      if (cache && cache.uid === uid) {
        cache.predictions = { ...cache.predictions, [matchId]: pred };
      }
      setState((s) =>
        s.data ? { ...s, data: { ...s.data, predictions: { ...s.data.predictions, [matchId]: pred } } } : s,
      );
    },
    [uid],
  );

  const setBracket = useCallback(
    (bracket: WCBracketPrediction) => {
      if (cache && cache.uid === uid) {
        cache.bracket = bracket;
      }
      setState((s) => (s.data ? { ...s, data: { ...s.data, bracket } } : s));
    },
    [uid],
  );

  // Vista coherente con el uid actual aunque el estado se esté re-alineando.
  const view = state.uid === uid ? state : initStateFor(uid);

  return {
    data: view.data,
    loading: view.loading,
    error: view.error,
    retry,
    setPrediction,
    setBracket,
  };
}
