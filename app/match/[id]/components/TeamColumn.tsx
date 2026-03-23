"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Player } from "@/lib/domain/player";
import { sortTeamForDisplay } from "@/lib/domain/team";
import PlayerItem from "./PlayerItem";

interface TeamColumnProps {
  team: "A" | "B";
  players: Player[];
  totalLevel: number;
  count: number;
  isClosed: boolean;
  votingClosed: boolean;
  currentMVPs: string[];
  voteCounts: Record<string, number>;
}

export default function TeamColumn({
  team,
  players,
  totalLevel,
  count,
  isClosed,
  votingClosed,
  currentMVPs,
  voteCounts,
}: TeamColumnProps) {
  const isA = team === "A";
  const bgColor = isA ? "bg-red-50" : "bg-blue-50";
  const borderColor = isA ? "border-red-100" : "border-blue-100";
  const textColor = isA ? "text-red-800" : "text-blue-800";
  const subtextColor = isA ? "text-red-600" : "text-blue-600";
  const icon = isA ? "🔴" : "🔵";

  const sortedPlayers = sortTeamForDisplay(players);

  // Build unique IDs — deduplicate when two players share the same base id
  const idMap = new Map<Player, string>();
  const seen = new Set<string>();
  for (const p of players) {
    const base = p.id || p.uid || p.name;
    let uniqueId = base;
    let suffix = 2;
    while (seen.has(uniqueId)) {
      uniqueId = `${base}_${suffix++}`;
    }
    seen.add(uniqueId);
    idMap.set(p, uniqueId);
  }
  const uniqueIds = players.map((p) => idMap.get(p)!);

  return (
    <div className={`${bgColor} rounded-xl p-3 border ${borderColor} min-w-0`}>
      <h4 className={`font-bold ${textColor} mb-1 text-sm`}>
        {icon} Equipo {team}
      </h4>
      <div className={`text-[10px] ${subtextColor} mb-3 opacity-80 font-medium`}>
        ⚡ <strong>{totalLevel}</strong> pts · 👥 {count}
      </div>

      <SortableContext
        items={uniqueIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1.5">
          {sortedPlayers.map((p: Player) => {
            const targetId = idMap.get(p) || p.id || p.uid || p.name;
            const isMvp = votingClosed && currentMVPs.includes(targetId);
            const votes = isClosed ? voteCounts[targetId] || 0 : 0;

            return (
              <PlayerItem
                key={targetId}
                id={targetId}
                name={p.name}
                photoURL={p.photoURL}
                details={`⚡${p.level} · ${[
                  p.primaryPosition ? `👑${p.primaryPosition}` : null,
                  ...(p.positions || []).filter((pos) => pos !== p.primaryPosition),
                ]
                  .filter(Boolean)
                  .join("/")}`}
                isMvp={isMvp}
                votes={votes}
              />
            );
          })}
        </div>
      </SortableContext>
    </div>
  );
}
