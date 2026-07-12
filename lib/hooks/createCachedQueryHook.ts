"use client";

/**
 * ========================
 * createCachedQueryHook
 * ========================
 *
 * Specification-Driven Development (SDD)
 * See: docs/IOS_PWA_HOME_STALE_LOADING_SDD.md
 *
 * Factory que crea un hook de lectura robusto contra los cuelgues de Firestore
 * en iOS/PWA y contra el parpadeo de skeleton al re-renderizar. Resuelve:
 *
 *   1. `getDocs` que no resuelve ni rechaza (iOS suspende el canal de Firestore)
 *      → `Promise.race` con timeout duro. Pasado el timeout se considera fallo.
 *   2. Skeleton que reaparece en cada navegación / re-emisión del perfil
 *      → caché en memoria a nivel módulo: si ya hay datos para la `key`, se
 *        muestran sin volver a `loading`.
 *   3. Datos viejos tras volver del background
 *      → refresh automático en `visibilitychange`/`pageshow` si el caché está stale.
 *   4. Respuestas tardías que pisan datos frescos
 *      → token de generación (`fetchIdRef`): solo el último fetch puede setear estado.
 *   5. Flash de estado vacío cuando la `key` pasa de `null` a un valor (ej. auth
 *      resuelve) → reconciliación de estado en render (patrón "adjusting state on
 *      prop change" de React): el estado se alinea con la `key` antes del commit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { TimeoutError } from "@/lib/domain/errors";
import { withTimeout } from "@/lib/utils/withTimeout";
import { logQueryError, logQueryTimeout } from "@/lib/analytics";

interface CachedQueryOptions {
  /** Identificador para analytics (ej. "user_matches", "active_venues"). */
  source: string;
  /** Timeout duro del fetch en ms. Default 10s. */
  timeoutMs?: number;
  /** Edad máxima del caché antes de refrescar al volver a `visible`. Default 30s. */
  staleMs?: number;
}

export interface CachedQueryResult<T> {
  data: T | null;
  /** true solo si NO hay caché y estamos fetcheando (primera carga real). */
  loading: boolean;
  /** true si hay caché y estamos refrescando en background. */
  refreshing: boolean;
  error: Error | null;
  /** Reintento manual (botón "Reintentar"). */
  retry: () => void;
}

interface State<T> {
  /** Key a la que pertenece este estado (para detectar cambios de key). */
  key: string | null;
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
}

export function createCachedQueryHook<Params, T>(
  fetcher: (params: Params) => Promise<T>,
  /** Deriva una key estable de los params. `null` = no hay nada que cargar (ej. sin sesión). */
  keyOf: (params: Params) => string | null,
  options: CachedQueryOptions
) {
  const { source, timeoutMs = 10_000, staleMs = 30_000 } = options;

  // Backoff del reintento único de la primera carga en frío (§17). Corto: la
  // primera query tras el login falla porque el canal/token de Firestore recién
  // se levanta; ~600 ms basta para que quede listo sin que el usuario perciba demora.
  const RETRY_BACKOFF_MS = 600;

  // Caché a nivel módulo: sobrevive a la navegación cliente (mismo runtime JS),
  // se pierde al recargar o cerrar la app. Una entrada por key.
  const cache = new Map<string, { data: T; fetchedAt: number }>();

  function initStateFor(key: string | null): State<T> {
    const cached = key ? cache.get(key) ?? null : null;
    return {
      key,
      data: cached?.data ?? null,
      loading: !!key && !cached,
      refreshing: false,
      error: null,
    };
  }

  return function useCachedQuery(params: Params): CachedQueryResult<T> {
    const key = keyOf(params);

    const [state, setState] = useState<State<T>>(() => initStateFor(key));

    // Si la key cambió, alineamos el estado en este mismo render. React descarta
    // este render y re-ejecuta con el estado nuevo antes de pintar → sin flash de
    // datos viejos ni de estado vacío. (Patrón oficial de React.)
    if (state.key !== key) {
      setState(initStateFor(key));
    }

    // Último set de params: permite fetchear con datos frescos sin recrear `run`
    // cuando cambia la identidad del objeto `params` pero no la `key`.
    const paramsRef = useRef(params);
    paramsRef.current = params;
    // Token de generación: solo el último fetch lanzado puede setear estado.
    const fetchIdRef = useRef(0);

    const run = useCallback(
      (fromVisibility: boolean) => {
        if (!key) return;
        const id = ++fetchIdRef.current;
        const hadCache = cache.has(key);
        setState((s) =>
          hadCache ? { ...s, refreshing: true } : { ...s, loading: true }
        );

        // Primera carga en frío (sin caché, no por visibility): tras el login el
        // canal/token de Firestore recién se levanta y la primera query puede fallar
        // de forma transitoria (permission-denied/unavailable/timeout). Reintentamos
        // una sola vez antes de degradar a error terminal (§17). Los refrescos con
        // caché degradan mostrando el dato viejo; los de visibility no reintentan.
        const attempt = (retriesLeft: number) => {
          withTimeout(fetcher(paramsRef.current), timeoutMs)
            .then((result) => {
              if (id !== fetchIdRef.current) return;
              cache.set(key, { data: result, fetchedAt: Date.now() });
              setState({ key, data: result, loading: false, refreshing: false, error: null });
            })
            .catch((err: unknown) => {
              if (id !== fetchIdRef.current) return;
              const e = err instanceof Error ? err : new Error(String(err));

              if (retriesLeft > 0) {
                setTimeout(() => {
                  // La key pudo cambiar o arrancar un fetch más nuevo durante el backoff.
                  if (id !== fetchIdRef.current) return;
                  attempt(retriesLeft - 1);
                }, RETRY_BACKOFF_MS);
                return;
              }

              // Registramos solo el fallo que efectivamente llega al usuario (tras
              // agotar el reintento): los eventos siguen midiendo fallos reales.
              if (e instanceof TimeoutError) {
                logQueryTimeout({ source, fromVisibility, hadCache });
              } else {
                logQueryError({ source, fromVisibility, hadCache, errorCode: e.name });
              }
              // Degradación elegante: si había caché, `data` se mantiene visible.
              setState((s) => ({ ...s, loading: false, refreshing: false, error: e }));
            });
        };

        attempt(!hadCache && !fromVisibility ? 1 : 0);
      },
      [key]
    );

    // Fetch al montar / cambiar de key.
    useEffect(() => {
      if (!key) return;
      const cached = cache.get(key);
      if (cached) {
        // Hay caché: ya se muestra (initStateFor). Refrescar en background si está viejo.
        if (Date.now() - cached.fetchedAt > staleMs) run(false);
      } else {
        run(false);
      }
    }, [key, run]);

    // Refresh al volver a `visible` (de background iOS o de otra ruta).
    useEffect(() => {
      if (!key) return;
      const onVisible = () => {
        if (document.visibilityState !== "visible") return;
        const cached = cache.get(key);
        if (Date.now() - (cached?.fetchedAt ?? 0) > staleMs) run(true);
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", onVisible);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("pageshow", onVisible);
      };
    }, [key, run]);

    const retry = useCallback(() => run(false), [run]);

    // Mientras el estado se re-alinea por cambio de key, devolvemos la vista derivada
    // de la key actual para que el primer commit ya sea coherente.
    const view = state.key === key ? state : initStateFor(key);

    return {
      data: view.data,
      loading: view.loading,
      refreshing: view.refreshing,
      error: view.error,
      retry,
    };
  };
}
