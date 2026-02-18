/**
 * ========================
 * PLAYER STATS API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para actualizar estadísticas de jugadores.
 * Usa tipos del dominio (`lib/domain/player.ts`, `lib/domain/user.ts`).
 */

import { doc, setDoc, increment } from "firebase/firestore";
import { db } from "./firebase";
import type { Player } from "./domain/player";
import type { MatchResult } from "./domain/match";

/**
 * Actualiza las estadísticas de un grupo de jugadores.
 *
 * Si hay un resultado previo, primero revierte esas estadísticas
 * y luego aplica las nuevas.
 */
export async function updatePlayerStats(
  players: Player[],
  result: MatchResult,
  matchId: string,
  previousResult?: MatchResult
) {
  for (const player of players) {
    if (!player.uid) continue;

    // Si hay un resultado previo, primero revertir esas estadísticas
    if (previousResult) {
      await setDoc(
        doc(db, "users", player.uid),
        {
          stats: {
            played: increment(-1),
            won: increment(previousResult === "win" ? -1 : 0),
            lost: increment(previousResult === "loss" ? -1 : 0),
            draw: increment(previousResult === "draw" ? -1 : 0),
          },
        },
        { merge: true }
      );
    }

    // Aplicar las nuevas estadísticas
    await setDoc(
      doc(db, "users", player.uid),
      {
        stats: {
          played: increment(1),
          won: increment(result === "win" ? 1 : 0),
          lost: increment(result === "loss" ? 1 : 0),
          draw: increment(result === "draw" ? 1 : 0),
        },
      },
      { merge: true }
    );
  }
}
