import { TimeoutError } from "@/lib/domain/errors";

/**
 * Envuelve una promesa con un timeout duro. Si no resuelve en `ms`, rechaza con
 * `TimeoutError`. Pensado para lecturas de Firestore (`getDocs`/`getDoc`) que en
 * iOS/PWA pueden quedar colgadas para siempre cuando el SO suspende el canal de red:
 * sin esto, un skeleton gateado por ese fetch nunca se resuelve.
 *
 * Limpia el timer cuando la promesa gana la carrera para no dejar timers vivos.
 *
 * @example
 *   const snap = await withTimeout(getDocs(q));
 */
export function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
