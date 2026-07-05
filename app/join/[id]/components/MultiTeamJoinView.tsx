"use client";

import { useState } from "react";
import { Trophy, Star, Crown } from "lucide-react";
import type { Player } from "@/lib/domain/player";
import {
  computeStandings,
  allFixturesPlayed,
  getChampion,
  getTeamNetResult,
  multiTeamName,
  type MultiTeam,
  type Fixture,
} from "@/lib/domain/multiTeam";
import { TEAM_COLOR_CONFIG, type TeamColor } from "@/lib/domain/team-colors";
import MultiTeamGrid from "@/app/match/[id]/components/MultiTeamGrid";
import StandingsTable from "@/app/match/[id]/components/StandingsTable";
import FixtureList from "@/app/match/[id]/components/FixtureList";

interface MultiTeamJoinViewProps {
  phase: "confirmed" | "closed";
  teams: MultiTeam[];
  fixtures: Fixture[];
  userUid: string;
  /** Mostrar niveles y puntaje total (solo para el creador del partido). */
  showLevels: boolean;
  /** Abrir la profile card de un jugador al tocarlo. */
  onPlayerTap: (uid?: string) => void;
  mvp: {
    currentMVPs: string[];
    voteCounts: Record<string, number>;
    votingClosed: boolean;
    myVote: string | null;
    canVote: boolean; // elegibilidad general (cerrado, no votó, confirmado/owner)
  };
  onVote: (targetId: string) => Promise<void>;
}

const RESULT_META: Record<"win" | "draw" | "loss", { msg: string; color: string; bg: string }> = {
  win: { msg: "¡Ganaste! 🎉", color: "text-emerald-700", bg: "bg-emerald-100" },
  draw: { msg: "Empate 🤝", color: "text-amber-700", bg: "bg-amber-100" },
  loss: { msg: "Partido difícil 😔", color: "text-red-700", bg: "bg-red-100" },
};

export default function MultiTeamJoinView({
  phase,
  teams,
  fixtures,
  userUid,
  showLevels,
  onPlayerTap,
  mvp,
  onVote,
}: MultiTeamJoinViewProps) {
  const isClosed = phase === "closed";
  const standings = computeStandings(teams, fixtures);
  const allPlayed = allFixturesPlayed(fixtures);
  const championId = getChampion(standings, allPlayed);
  const champion = championId ? teams.find((t) => t.id === championId) : null;

  const myTeam = teams.find((t) => t.players.some((p) => p.uid === userUid));
  const myResult = isClosed && myTeam ? getTeamNetResult(myTeam.id, fixtures) : null;
  const myStanding = myTeam ? standings.find((s) => s.teamId === myTeam.id) : null;

  const tabs: { id: Section; label: string }[] = [
    { id: "teams", label: "Equipos" },
    ...(fixtures.length > 0 ? ([{ id: "table", label: "Tabla" }] as { id: Section; label: string }[]) : []),
    ...(isClosed ? ([{ id: "mvp", label: "MVP" }] as { id: Section; label: string }[]) : []),
  ];

  const [section, setSection] = useState<Section>("teams");
  const activeSection: Section = tabs.some((t) => t.id === section) ? section : "teams";

  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6 space-y-4">
      <h3 className="font-black text-slate-800 flex items-center gap-2">
        <Trophy size={18} className="text-amber-500" />
        {isClosed ? "Resultado del torneo" : "Equipos definidos"}
      </h3>

      {/* Resultado personal */}
      {isClosed && myResult && myStanding && (
        <div className={`rounded-xl px-4 py-3 ${RESULT_META[myResult].bg}`}>
          <p className={`font-black ${RESULT_META[myResult].color}`}>{RESULT_META[myResult].msg}</p>
          <p className="text-xs font-medium text-slate-600 mt-0.5">
            Tu equipo: {myStanding.won}G {myStanding.drawn}E {myStanding.lost}P
          </p>
        </div>
      )}

      {/* Campeón */}
      {champion && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-bold border border-amber-200">
          <Trophy size={16} className="text-amber-500" /> Campeón: {multiTeamName(champion.color)}
        </div>
      )}

      {/* Control segmentado: una sección a la vez */}
      {tabs.length > 1 && (
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeSection === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Equipos */}
      {activeSection === "teams" && (
        <MultiTeamGrid
          teams={teams}
          editable={false}
          showLevels={showLevels}
          onPlayerTap={onPlayerTap}
          currentMVPs={mvp.currentMVPs}
          voteCounts={mvp.voteCounts}
          votingClosed={mvp.votingClosed}
        />
      )}

      {/* Tabla + enfrentamientos */}
      {activeSection === "table" && fixtures.length > 0 && (
        <>
          <StandingsTable teams={teams} standings={standings} final={allPlayed} />
          <FixtureList teams={teams} fixtures={fixtures} readOnly onSaveScore={async () => {}} />
        </>
      )}

      {/* Votación MVP */}
      {activeSection === "mvp" && isClosed && (
        <MvpVoteList teams={teams} userUid={userUid} mvp={mvp} onVote={onVote} />
      )}
    </div>
  );
}

type Section = "teams" | "table" | "mvp";

function MvpVoteList({
  teams,
  userUid,
  mvp,
  onVote,
}: {
  teams: MultiTeam[];
  userUid: string;
  mvp: MultiTeamJoinViewProps["mvp"];
  onVote: (targetId: string) => Promise<void>;
}) {
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const players = teams.flatMap((t) =>
    t.players.map((p) => ({ player: p, team: t }))
  );

  // Ordena: más votados primero
  const sorted = [...players].sort(
    (a, b) =>
      (mvp.voteCounts[b.player.uid || b.player.name] || 0) -
      (mvp.voteCounts[a.player.uid || a.player.name] || 0)
  );

  return (
    <div className="border-t border-slate-100 pt-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5" /> {mvp.votingClosed ? "MVP del partido" : "Vota por el MVP"}
      </h4>
      <div className="space-y-1.5">
        {sorted.map(({ player, team }, i) => {
          const targetId = player.uid || player.name;
          const votes = mvp.voteCounts[targetId] || 0;
          const isMvp = mvp.votingClosed && mvp.currentMVPs.includes(targetId);
          const cfg = TEAM_COLOR_CONFIG[(team.color ?? "slate") as TeamColor];
          const canVoteForThis =
            mvp.canVote && !!player.uid && player.uid !== userUid;

          return (
            <div
              key={`${targetId}_${i}`}
              className={`flex items-center justify-between p-1.5 rounded-lg ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border border-amber-100" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="font-bold text-sm text-slate-700 truncate flex items-center gap-1">
                  {player.name}
                  {isMvp && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                </span>
              </div>

              {mvp.myVote === targetId ? (
                <div className="flex items-center gap-1 shrink-0">
                  {votes > 0 && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{votes} v.</span>}
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Star className="w-2.5 h-2.5" /> Tu voto</span>
                </div>
              ) : pendingVote === targetId && canVoteForThis ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={submitting}
                    onClick={async () => {
                      setPendingVote(null);
                      setSubmitting(true);
                      try {
                        await onVote(targetId);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="text-[10px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full active:scale-95 transition-transform"
                  >
                    Sí
                  </button>
                  <button onClick={() => setPendingVote(null)} className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">No</button>
                </div>
              ) : canVoteForThis ? (
                <button onClick={() => setPendingVote(targetId)} className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full hover:bg-amber-200 active:scale-95 transition-transform shrink-0">⭐ Votar</button>
              ) : votes > 0 ? (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">{votes} v.</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
