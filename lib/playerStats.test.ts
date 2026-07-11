import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Player } from "./domain/player";
import type { MatchResult } from "./domain/match";

// --- Firestore mock: captura batch.set / batch.update y modela increment() ---
type Captured = { path: string; data: Record<string, unknown> };
const setCalls: Captured[] = [];
const updateCalls: Captured[] = [];

vi.mock("./firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: vi.fn(async () => ({ data: () => ({}) })),
  // Modelamos increment(n) como un sentinel legible en los asserts.
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => ({
    set: (ref: { path: string }, data: Record<string, unknown>) =>
      setCalls.push({ path: ref.path, data }),
    update: (ref: { path: string }, data: Record<string, unknown>) =>
      updateCalls.push({ path: ref.path, data }),
    commit: vi.fn(async () => {}),
  }),
}));

import { updatePlayerStats } from "./playerStats";

// Helpers para leer los deltas capturados por uid.
function statsFor(uid: string): Record<string, number> {
  const call = setCalls.find((c) => c.path === `users/${uid}`);
  if (!call) return {};
  const stats = (call.data.stats ?? {}) as Record<string, { __increment: number }>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) out[k] = v.__increment;
  return out;
}

function player(uid: string): Player {
  return { uid, name: uid, level: 2, positions: [], confirmed: true } as Player;
}

const prevResultByTeam = (
  a: Player[],
  b: Player[],
  scoreA: number,
  scoreB: number
): Map<string, MatchResult> => {
  const rA: MatchResult = scoreA > scoreB ? "win" : scoreA < scoreB ? "loss" : "draw";
  const rB: MatchResult = scoreB > scoreA ? "win" : scoreB < scoreA ? "loss" : "draw";
  const m = new Map<string, MatchResult>();
  for (const p of a) if (p.uid) m.set(p.uid, rA);
  for (const p of b) if (p.uid) m.set(p.uid, rB);
  return m;
};

beforeEach(() => {
  setCalls.length = 0;
  updateCalls.length = 0;
});

describe("updatePlayerStats — re-cierre con cambio de equipo", () => {
  it("cierre fresco: gana A (X), pierde B (Y)", async () => {
    const X = player("x");
    const Y = player("y");
    await updatePlayerStats([X], "win", "m1", "2026-07-11", undefined);
    await updatePlayerStats([Y], "loss", "m1", "2026-07-11", undefined);

    expect(statsFor("x")).toEqual({ played: 1, won: 1, lost: 0, draw: 0 });
    expect(statsFor("y")).toEqual({ played: 1, won: 0, lost: 1, draw: 0 });
  });

  it("re-cierre: X pasa del equipo ganador al perdedor y viceversa → stats se ajustan por jugador", async () => {
    const X = player("x");
    const Y = player("y");

    // Cierre previo aplicado: A=[X] ganó 3-1, B=[Y] perdió.
    // previousTeams refleja esa composición real.
    const previousResultByUid = prevResultByTeam([X], [Y], 3, 1); // x->win, y->loss

    // Re-cierre con mismo marcador 3-1 pero equipos intercambiados:
    // ahora A=[Y] (gana), B=[X] (pierde).
    await updatePlayerStats([Y], "win", "m1", "2026-07-11", previousResultByUid);
    await updatePlayerStats([X], "loss", "m1", "2026-07-11", previousResultByUid);

    // X venía de ganar (won+1); ahora perdió. Delta neto en el re-cierre:
    //   won -1 (revierte victoria previa), lost +1 (nueva derrota), played 0.
    expect(statsFor("x")).toEqual({ played: 0, won: -1, lost: 1, draw: 0 });
    // Y venía de perder (lost+1); ahora ganó. Delta neto:
    //   lost -1 (revierte derrota previa), won +1 (nueva victoria), played 0.
    expect(statsFor("y")).toEqual({ played: 0, won: 1, lost: -1, draw: 0 });
  });

  it("re-cierre control: jugador que NO cambia de equipo y mismo marcador → delta neto 0", async () => {
    const X = player("x");
    const previousResultByUid = prevResultByTeam([X], [], 3, 1); // x->win

    await updatePlayerStats([X], "win", "m1", "2026-07-11", previousResultByUid);

    expect(statsFor("x")).toEqual({ played: 0, won: 0, lost: 0, draw: 0 });
  });

  it("re-cierre no vuelve a tocar commitmentStreak de jugadores puntuales", async () => {
    const X = player("x");
    const previousResultByUid = prevResultByTeam([X], [], 3, 1);
    await updatePlayerStats([X], "win", "m1", "2026-07-11", previousResultByUid);

    const call = setCalls.find((c) => c.path === "users/x");
    expect(call?.data).not.toHaveProperty("commitmentStreak");
  });

  it("cierre fresco sí incrementa commitmentStreak del jugador puntual", async () => {
    const X = player("x");
    await updatePlayerStats([X], "win", "m1", "2026-07-11", undefined);

    const call = setCalls.find((c) => c.path === "users/x");
    expect(call?.data.commitmentStreak).toEqual({ __increment: 1 });
  });
});
