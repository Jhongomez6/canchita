"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { TEAM_COLOR_CONFIG, type TeamColor } from "@/lib/domain/team-colors";
import { multiTeamName, type MultiTeam, type TeamStanding } from "@/lib/domain/multiTeam";

interface StandingsTableProps {
  teams: MultiTeam[];
  standings: TeamStanding[];
  /** true cuando todos los fixtures tienen marcador (define campeón vs. líder provisional). */
  final: boolean;
}

/**
 * Tabla de posiciones del round-robin. Las filas se reordenan con animación de
 * layout al cargar marcadores. El líder muestra corona (provisional o campeón).
 */
export default function StandingsTable({ teams, standings, final }: StandingsTableProps) {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Tabla de posiciones
        </h4>
        {!final && (
          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            Provisional
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[340px]">
          <thead>
            <tr className="text-[11px] font-bold text-slate-400 uppercase">
              <th className="text-left py-2 pl-3 pr-2">Equipo</th>
              <th className="px-1.5 text-center" title="Partidos jugados">PJ</th>
              <th className="px-1.5 text-center" title="Ganados">G</th>
              <th className="px-1.5 text-center" title="Empatados">E</th>
              <th className="px-1.5 text-center" title="Perdidos">P</th>
              <th className="px-1.5 text-center" title="Diferencia de gol">DIF</th>
              <th className="px-1.5 text-center pr-3 text-slate-600">PTS</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const team = teamById.get(s.teamId);
              const cfg = TEAM_COLOR_CONFIG[(team?.color ?? "slate") as TeamColor];
              const isLeader = s.position === 1 && s.played > 0;
              return (
                <motion.tr
                  key={s.teamId}
                  layout
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`border-t border-slate-50 ${isLeader ? cfg.highlight : ""}`}
                >
                  <td className="py-2 pl-3 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className="font-bold text-slate-700 truncate">
                        {team ? multiTeamName(team.color) : s.teamId}
                      </span>
                      {isLeader && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.2, 1] }}
                          transition={{ duration: 0.4 }}
                        >
                          <Crown size={14} className="text-amber-500 shrink-0" aria-label={final ? "Campeón" : "Líder"} />
                        </motion.span>
                      )}
                    </div>
                  </td>
                  <td className="px-1.5 text-center text-slate-500 tabular-nums">{s.played}</td>
                  <td className="px-1.5 text-center text-slate-500 tabular-nums">{s.won}</td>
                  <td className="px-1.5 text-center text-slate-500 tabular-nums">{s.drawn}</td>
                  <td className="px-1.5 text-center text-slate-500 tabular-nums">{s.lost}</td>
                  <td className="px-1.5 text-center text-slate-500 tabular-nums">
                    {s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}
                  </td>
                  <td className="px-1.5 text-center pr-3 font-black text-slate-800 tabular-nums">
                    {s.points}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
