"use client";

import { motion } from "framer-motion";
import type { WCLeaderboardEntry } from "@/lib/domain/worldcup";

const medal = (pos: number) => (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null);

/**
 * Tabla de posiciones de la polla. Resalta la fila del usuario actual.
 */
export default function WorldCupLeaderboard({
    entries,
    currentUserId,
}: {
    entries: WCLeaderboardEntry[];
    currentUserId: string;
}) {
    if (entries.length === 0) {
        return (
            <p className="text-center text-gray-400 bg-gray-50 rounded-xl p-8 mt-4">
                Sé el primero en predecir.
            </p>
        );
    }

    return (
        <ul className="space-y-1.5 mt-4">
            {entries.map((e, i) => {
                const pos = i + 1;
                const isMe = e.userId === currentUserId;
                return (
                    <motion.li
                        key={e.userId}
                        layout
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                            isMe ? "bg-[#1f7a4f]/10 ring-1 ring-[#1f7a4f]/30" : "bg-white border border-gray-100"
                        }`}
                    >
                        <span className="w-7 text-center font-bold text-gray-500 tabular-nums">
                            {medal(pos) ?? pos}
                        </span>
                        {e.photoURLThumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.photoURLThumb} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                            <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                                {e.displayName.charAt(0).toUpperCase()}
                            </span>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                                {e.displayName} {isMe && <span className="text-xs text-[#1f7a4f]">(tú)</span>}
                            </p>
                            <p className="text-[11px] text-gray-400">
                                {e.exactHits} exactos · {e.resultHits} resultados · {e.predictions} jugadas
                                {e.bracketPoints ? ` · 🏆 +${e.bracketPoints}` : ""}
                            </p>
                        </div>
                        <span className="text-lg font-bold tabular-nums text-[#1f7a4f]">{e.points}</span>
                    </motion.li>
                );
            })}
        </ul>
    );
}
