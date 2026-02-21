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
    if (!player.uid || player.uid.startsWith("guest_")) continue;

    // TODO: Handle previous result reversion correctly for attendance stats if needed
    // For now, simplificado solo para W/L/D basic reversion
    if (previousResult) {
      // Revertir stats previos (simplificado - asume que 'played' fue incrementado)
      // Nota: Si el usuario fue marcado como no-show después, esto podría desfasarse.
      // Sería mejor reconstruir stats totales, pero para MVP:
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

    const { attendance = "present" } = player;
    const isNoShow = attendance === "no_show";

    // Base stats update
    const statsUpdate: any = {};

    if (isNoShow) {
      statsUpdate.noShows = increment(1);
      // No incrementamos played/won/lost/draw
    } else {
      statsUpdate.played = increment(1);
      statsUpdate.won = increment(result === "win" ? 1 : 0);
      statsUpdate.lost = increment(result === "loss" ? 1 : 0);
      statsUpdate.draw = increment(result === "draw" ? 1 : 0);

      if (attendance === "late") {
        statsUpdate.lateArrivals = increment(1);
      }
    }

    // Aplicar las nuevas estadísticas
    await setDoc(
      doc(db, "users", player.uid),
      {
        stats: statsUpdate,
      },
      { merge: true }
    );
  }
}
