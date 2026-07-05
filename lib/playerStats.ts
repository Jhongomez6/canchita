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

import { doc, getDoc, increment, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "./firebase";
import type { Player, AttendanceStatus } from "./domain/player";
import type { MatchResult } from "./domain/match";
import type { MultiTeamTournament, PlayerSessionResult } from "./domain/multiTeam";
import { getPlayerSessionResults } from "./domain/multiTeam";
import { nextWeeklyStreak } from "./domain/user";


export async function updatePlayerStats(
  players: Player[],
  result: MatchResult,
  matchId: string,
  matchDate: string,
  previousResult?: MatchResult,
  matchData?: {
    matchRef: DocumentReference;
    score: { A: number; B: number };
    previousScore: { A: number; B: number };
    finalReport: string;
  },
  pendingNoShows?: Player[]
) {
  // Pre-lectura para weeklyStreak: solo en cierre fresco, solo jugadores elegibles (uid, no guest, no no_show)
  const weeklyUpdates = new Map<string, { weeklyStreak: number; lastPlayedWeek: string }>();
  if (!previousResult) {
    const eligible = players.filter(
      (p) => p.uid && !p.uid.startsWith("guest_") && p.attendance !== "no_show"
    );
    const snaps = await Promise.all(
      eligible.map((p) => getDoc(doc(db, "users", p.uid!)))
    );
    eligible.forEach((p, i) => {
      const data = snaps[i].data();
      const next = nextWeeklyStreak(
        {
          weeklyStreak: (data?.weeklyStreak as number | undefined) ?? 0,
          lastPlayedWeek: data?.lastPlayedWeek as string | undefined,
        },
        matchDate
      );
      weeklyUpdates.set(p.uid!, next);
    });
  }

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

    // Racha de Compromiso (commitmentStreak): increment ONLY if perfectly punctual (no late, no no_show).
    // reset to 0 on ANY infraction (late OR no_show).
    // On re-close: reset streak if attendance is now no_show or late (prevents streak > played when
    // attendance changes from present → no_show, which decrements played but previously left streak unchanged).
    const topLevelUpdate: Record<string, unknown> = { stats: statsUpdate };
    if (!previousResult) {
      if (isNoShow || attendance === "late") {
        topLevelUpdate.commitmentStreak = 0;
      } else {
        // Only perfect punctuality (default "present") increments the streak
        topLevelUpdate.commitmentStreak = increment(1);
      }
      // Racha Semanal: pre-calculada arriba para jugadores elegibles (uid + no guest + no no_show)
      const weekly = weeklyUpdates.get(player.uid);
      if (weekly) {
        topLevelUpdate.weeklyStreak = weekly.weeklyStreak;
        topLevelUpdate.lastPlayedWeek = weekly.lastPlayedWeek;
      }
    } else if (isNoShow || attendance === "late") {
      topLevelUpdate.commitmentStreak = 0;
    }

    batch.set(userRef, topLevelUpdate, { merge: true });
  }

  // Pending no-shows: jugadores sin equipo marcados manualmente como no-show.
  // Se procesan en el mismo batch que statsProcessed: true para garantizar atomicidad.
  if (matchData && pendingNoShows) {
    for (const player of pendingNoShows) {
      if (!player.uid || player.uid.startsWith("guest_")) continue;
      if (player.attendance !== "no_show") continue;

      const userRef = doc(db, "users", player.uid);
      // Pending no-shows: increment noShows and reset commitmentStreak
      batch.set(
        userRef,
        { stats: { noShows: increment(1) }, commitmentStreak: 0 },
        { merge: true }
      );
    }
  }

  await batch.commit();
}

// ========================
// STATS — MODO MULTI-EQUIPO (round-robin)
// ========================

/**
 * Procesa las stats de un partido multi-equipo al cerrarlo.
 *
 * El resultado (win/draw/loss) de cada jugador se deriva del BALANCE NETO de los
 * fixtures de su equipo (`getPlayerSessionResults`) y se aplica UNA sola vez por
 * sesión — misma economía de stats que el modo clásico (played/won/draw/lost + 1).
 *
 * Idempotencia / re-cierre: si `statsProcessed` ya era true y hay `previousMultiTeam`,
 * primero revierte el resultado previo por jugador y luego aplica el nuevo, sin duplicar.
 * Deja `previousMultiTeam = torneo aplicado` para el próximo re-cierre.
 *
 * Usa `writeBatch` atómico: todas las stats + el flag `statsProcessed` del match
 * se commitean juntos.
 */
export async function updateMultiTeamStats(match: {
  id: string;
  date: string;
  multiTeam: MultiTeamTournament;
  players?: Player[];
  statsProcessed?: boolean;
  previousMultiTeam?: MultiTeamTournament;
}) {
  const tournament = match.multiTeam;
  const matchDate = match.date;

  const resultByUid = getPlayerSessionResults(tournament);
  const isReclose = match.statsProcessed === true && !!match.previousMultiTeam;
  const previousByUid = isReclose ? getPlayerSessionResults(match.previousMultiTeam!) : null;

  // Attendance por uid (desde players[])
  const attendanceByUid = new Map<string, AttendanceStatus>();
  for (const p of match.players ?? []) {
    if (p.uid && !p.uid.startsWith("guest_")) {
      attendanceByUid.set(p.uid, p.attendance ?? "present");
    }
  }

  // Uids únicos presentes en algún equipo (excluye guests)
  const uids = new Set<string>();
  for (const t of tournament.teams) {
    for (const p of t.players) {
      if (p.uid && !p.uid.startsWith("guest_")) uids.add(p.uid);
    }
  }

  // weeklyStreak pre-read: solo en cierre fresco, jugadores no-no_show
  const weeklyUpdates = new Map<string, { weeklyStreak: number; lastPlayedWeek: string }>();
  if (!isReclose) {
    const eligible = [...uids].filter(
      (uid) => (attendanceByUid.get(uid) ?? "present") !== "no_show"
    );
    const snaps = await Promise.all(eligible.map((uid) => getDoc(doc(db, "users", uid))));
    eligible.forEach((uid, i) => {
      const data = snaps[i].data();
      weeklyUpdates.set(
        uid,
        nextWeeklyStreak(
          {
            weeklyStreak: (data?.weeklyStreak as number | undefined) ?? 0,
            lastPlayedWeek: data?.lastPlayedWeek as string | undefined,
          },
          matchDate
        )
      );
    });
  }

  const batch = writeBatch(db);
  const matchRef = doc(db, "matches", match.id);
  batch.update(matchRef, {
    statsProcessed: true,
    previousMultiTeam: tournament,
  });

  for (const uid of uids) {
    const attendance = attendanceByUid.get(uid) ?? "present";
    const isNoShow = attendance === "no_show";
    const result = resultByUid.get(uid) ?? "draw";
    const previousResult = previousByUid?.get(uid);

    const statsUpdate = buildStatsDelta(result, attendance, previousResult);
    const topLevelUpdate: Record<string, unknown> = { stats: statsUpdate };

    if (!isReclose) {
      if (isNoShow || attendance === "late") {
        topLevelUpdate.commitmentStreak = 0;
      } else {
        topLevelUpdate.commitmentStreak = increment(1);
      }
      const weekly = weeklyUpdates.get(uid);
      if (weekly) {
        topLevelUpdate.weeklyStreak = weekly.weeklyStreak;
        topLevelUpdate.lastPlayedWeek = weekly.lastPlayedWeek;
      }
    } else if (isNoShow || attendance === "late") {
      topLevelUpdate.commitmentStreak = 0;
    }

    batch.set(doc(db, "users", uid), topLevelUpdate, { merge: true });
  }

  await batch.commit();
}

/**
 * Construye el delta de `stats` (played/won/lost/draw/noShows/lateArrivals) para un
 * jugador, combinando reversión del resultado previo (re-cierre) y el nuevo resultado
 * en un solo objeto de increments. Misma semántica que el modo clásico.
 */
function buildStatsDelta(
  result: PlayerSessionResult,
  attendance: AttendanceStatus,
  previousResult?: PlayerSessionResult,
): Record<string, unknown> {
  const isNoShow = attendance === "no_show";
  const statsUpdate: Record<string, unknown> = {};

  if (previousResult) {
    // Revertir resultado previo + aplicar el nuevo (neto)
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
      statsUpdate.played = increment(-1); // -1 revert, no re-add
    } else {
      statsUpdate.played = increment(0); // -1 revert + 1 nuevo = 0
      if (attendance === "late") statsUpdate.lateArrivals = increment(1);
    }
  } else {
    // Cierre fresco
    if (isNoShow) {
      statsUpdate.noShows = increment(1);
    } else {
      statsUpdate.played = increment(1);
      statsUpdate.won = increment(result === "win" ? 1 : 0);
      statsUpdate.lost = increment(result === "loss" ? 1 : 0);
      statsUpdate.draw = increment(result === "draw" ? 1 : 0);
      if (attendance === "late") statsUpdate.lateArrivals = increment(1);
    }
  }

  return statsUpdate;
}
