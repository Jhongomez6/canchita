"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Player } from "@/lib/domain/player";
import { sortTeamForDisplay } from "@/lib/domain/team";
import { TEAM_COLOR_CONFIG, DEFAULT_TEAM_COLORS, type TeamColor } from "@/lib/domain/team-colors";
import PlayerItem from "./PlayerItem";
import TeamColorPicker from "./TeamColorPicker";
import { Shield, Zap, Users } from "lucide-react";

interface TeamColumnProps {
  team: "A" | "B";
  players: Player[];
  totalLevel: number;
  count: number;
  isClosed: boolean;
  votingClosed: boolean;
  currentMVPs: string[];
  voteCounts: Record<string, number>;
  colorKey?: TeamColor;
  otherColorKey?: TeamColor;
  isOwner?: boolean;
  onColorChange?: (color: TeamColor) => void;
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
  colorKey,
  otherColorKey,
  isOwner,
  onColorChange,
}: TeamColumnProps) {
  const resolvedColor: TeamColor = colorKey ?? (team === "A" ? DEFAULT_TEAM_COLORS.A : DEFAULT_TEAM_COLORS.B);
  const resolvedOther: TeamColor = otherColorKey ?? (team === "A" ? DEFAULT_TEAM_COLORS.B : DEFAULT_TEAM_COLORS.A);
  const cfg = TEAM_COLOR_CONFIG[resolvedColor];

  const sortedPlayers = sortTeamForDisplay(players);

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
    <div className={`${cfg.bg} rounded-xl p-3 border ${cfg.border} min-w-0 transition-colors duration-200`}>
      <h4 className={`font-bold ${cfg.text} mb-1 text-sm flex items-center gap-1.5`}>
        <Shield size={14} fill={cfg.shieldFill} className={cfg.shieldText} />
        Equipo {team}
      </h4>
      <div className={`text-[10px] ${cfg.subtext} mb-2 opacity-80 font-medium flex items-center gap-3`}>
        <span className="flex items-center gap-1">
          <Zap size={10} /> <strong>{totalLevel}</strong> pts
        </span>
        <span className="flex items-center gap-1">
          <Users size={10} /> {count}
        </span>
      </div>

      {isOwner && onColorChange && (
        <TeamColorPicker
          value={resolvedColor}
          disabledColor={resolvedOther}
          onChange={onColorChange}
        />
      )}

      <div className={`space-y-1.5 ${isOwner && onColorChange ? "mt-2" : ""}`}>
        <SortableContext items={uniqueIds} strategy={verticalListSortingStrategy}>
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
                photoURLThumb={p.photoURLThumb}
                level={p.level ?? 2}
                primaryPosition={p.primaryPosition}
                positions={p.positions || []}
                isMvp={isMvp}
                votes={votes}
                disabled={isClosed}
              />
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}
