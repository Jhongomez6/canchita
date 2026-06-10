"use client";

import type { WCLeaderboardEntry } from "@/lib/domain/worldcup";

/**
 * Banner sticky con la posición del usuario en el leaderboard.
 * Si el usuario aún no puntuó, invita a predecir.
 */
export default function MyPositionBanner({
    position,
    entry,
}: {
    position: number | null;
    entry: WCLeaderboardEntry | null;
}) {
    if (!entry || position == null) {
        return (
            <div className="sticky top-0 z-10 bg-[#1f7a4f] text-white rounded-xl px-4 py-3 text-sm font-semibold text-center shadow-sm">
                Aún no tienes puntos — ¡empieza a predecir!
            </div>
        );
    }

    return (
        <div className="sticky top-0 z-10 bg-[#1f7a4f] text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
            <span className="text-sm font-semibold">
                Estás en el puesto <span className="text-base font-bold">#{position}</span>
            </span>
            <span className="text-sm">
                <span className="font-bold tabular-nums">{entry.points}</span> pts ·{" "}
                <span className="tabular-nums">{entry.exactHits}</span> exactos
            </span>
        </div>
    );
}
