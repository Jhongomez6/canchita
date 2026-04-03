/**
 * ========================
 * PLAYER STATS API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para actualizar estadísticas de jugadores.
 * Usa tipos del dominio (`lib/domain/player.ts`, `lib/domain/user.ts`).
 *
 * Usa `writeBatch` para garantizar atomicidad (all-or-nothing):
 * todas las stats de jugadores + el flag `statsProcessed` del match
 * se commitean en un solo batch atómico.
 */

import { doc, increment, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "./firebase";
import type { Player } from "./domain/player";
import type { MatchResult } from "./domain/match";


export async function updatePlayerStats(
  players: Player[],
  result: MatchResult,
  matchId: string,
  previousResult?: MatchResult,
  matchData?: {
    matchRef: DocumentReference;
    score: { A: number; B: number };
    previousScore: { A: number; B: number };
    finalReport: string;
  },
  pendingNoShows?: Player[]
) {
  const batch = writeBatch(db);

  // Include match document update in the same atomic batch
  if (matchData) {
    batch.update(matchData.matchRef, {
      score: matchData.score,
      previousScore: matchData.previousScore,
      finalReport: matchData.finalReport,
      statsProcessed: true,
    });
  }

  for (const player of players) {
    if (!player.uid || player.uid.startsWith("guest_")) continue;

    const userRef = doc(db, "users", player.uid);
    const { attendance = "present" } = player;
    const isNoShow = attendance === "no_show";

    // Compute net delta combining reversion + new stats in a single set
    const statsUpdate: Record<string, unknown> = {};

    if (previousResult) {
      // Revert previous stats
      statsUpdate.played = increment(isNoShow ? -1 : 0); // -1 for revert, +1 for new if not no_show = net 0
      statsUpdate.won = increment(
        (previousResult === "win" ? -1 : 0) + (!isNoShow && result === "win" ? 1 : 0)
      );
      statsUpdate.lost = increment(
        (previousResult === "loss" ? -1 : 0) + (!isNoShow && result === "loss" ? 1 : 0)
      );
      statsUpdate.draw = increment(
        (previousResult === "draw" ? -1 : 0) + (!isNoShow && result === "draw" ? 1 : 0)
      );

      if (isNoShow) {
        statsUpdate.noShows = increment(1);
        // Net played: -1 (revert) + 0 (no_show doesn't add) = -1
        statsUpdate.played = increment(-1);
      } else {
        // Net played: -1 (revert) + 1 (new) = 0
        statsUpdate.played = increment(0);
        if (attendance === "late") {
          statsUpdate.lateArrivals = increment(1);
        }
      }

    } else {
      // No reversion needed — fresh stats
      if (isNoShow) {
        statsUpdate.noShows = increment(1);
      } else {
        statsUpdate.played = increment(1);
        statsUpdate.won = increment(result === "win" ? 1 : 0);
        statsUpdate.lost = increment(result === "loss" ? 1 : 0);
        statsUpdate.draw = increment(result === "draw" ? 1 : 0);

        if (attendance === "late") {
          statsUpdate.lateArrivals = increment(1);
        }
      }

    }

    batch.set(userRef, { stats: statsUpdate }, { merge: true });
  }

  // Pending no-shows: jugadores sin equipo marcados manualmente como no-show.
  // Se procesan en el mismo batch que statsProcessed: true para garantizar atomicidad.
  if (matchData && pendingNoShows) {
    for (const player of pendingNoShows) {
      if (!player.uid || player.uid.startsWith("guest_")) continue;
      if (player.attendance !== "no_show") continue;

      const userRef = doc(db, "users", player.uid);
      batch.set(
        userRef,
        { stats: { noShows: increment(1) } },
        { merge: true }
      );
    }
  }

  await batch.commit();
}
