"use client";

import Link from "next/link";
import type { Match, MatchPhase } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import { formatDateSpanish, formatTime12h, formatEndTime } from "@/lib/date";
import MatchProgressBar from "./MatchProgressBar";
import type { TabId } from "./MatchAdminTabs";

interface DashboardTabProps {
  match: Match;
  location: Location | null;
  phase: MatchPhase;
  confirmedCount: number;
  isClosed: boolean;
  onNavigateTab: (tab: TabId) => void;
}

export default function DashboardTab({
  match,
  location,
  phase,
  confirmedCount,
  isClosed,
  onNavigateTab,
}: DashboardTabProps) {
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);
  const hasTeams = Boolean(match.teams);
  const hasScore = Boolean(match.score);

  // Team status label
  let teamsLabel = "Sin equipos";
  let teamsColor = "text-slate-400";
  let teamsBg = "bg-slate-50 border-slate-200";
  if (hasTeams) {
    teamsLabel = "Equipos listos";
    teamsColor = "text-emerald-600";
    teamsBg = "bg-emerald-50 border-emerald-200";
  }

  // Score display
  let scoreLabel = "Sin resultado";
  let scoreColor = "text-slate-400";
  let scoreBg = "bg-slate-50 border-slate-200";
  if (hasScore && match.score) {
    scoreLabel = `${match.score.A} - ${match.score.B}`;
    scoreColor = "text-slate-800";
    scoreBg = "bg-white border-slate-200";
  }

  // Players color
  let playersBg = "bg-emerald-50 border-emerald-200";
  let playersColor = "text-emerald-600";
  if (isFull) {
    playersBg = "bg-red-50 border-red-200";
    playersColor = "text-red-600";
  } else if (confirmedCount >= (match.maxPlayers ?? 14) * 0.8) {
    playersBg = "bg-amber-50 border-amber-200";
    playersColor = "text-amber-600";
  }

  return (
    <div role="tabpanel" id="panel-dashboard" className="space-y-4 animate-in fade-in duration-200">
      {/* Match Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              ⚽ Partido
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                  isClosed
                    ? "bg-slate-100 text-slate-500"
                    : "bg-emerald-100 text-emerald-600"
                }`}
              >
                {isClosed ? "Completado" : "Abierto"}
              </span>
              {match.isPrivate && (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                  🔒 Privado
                </span>
              )}
              <Link
                href={`/join/${match.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors ml-1"
              >
                <span>👁️</span> Ver como jugador
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-lg">📍</span>
            {location?.name ? (
              <span className="text-slate-600 font-medium">{location.name}</span>
            ) : (
              <div className="h-5 bg-slate-200 rounded animate-pulse w-48"></div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg">📅</span>
            <span className="text-slate-600 font-medium">{formatDateSpanish(match.date)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg">⏰</span>
            <span className="text-slate-600 font-medium">
              {formatTime12h(match.time)}
              {match.duration ? <span className="text-slate-400 font-normal"> · hasta las {formatEndTime(match.time, match.duration)}</span> : ""}
            </span>
          </div>

          {isClosed && match.closedAt && (
            <div className="flex items-center gap-3 bg-red-50 p-2 rounded-lg border border-red-100 mt-1">
              <span className="text-lg">🔒</span>
              <span className="text-red-700 font-bold text-sm">
                Cerrado a las{" "}
                {new Date(match.closedAt).toLocaleTimeString("es-CO", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <MatchProgressBar phase={phase} />
      </div>

      {/* Stat Mini-Cards */}
      {isClosed ? (
        <div className="grid grid-cols-2 gap-3">
          {/* Players card */}
          <button
            onClick={() => onNavigateTab("players")}
            className={`${playersBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="text-2xl mb-1">👥</div>
            <div className={`text-lg font-black ${playersColor}`}>
              {confirmedCount}/{match.maxPlayers}
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Jugadores
            </div>
          </button>

          {/* Teams card */}
          <button
            onClick={() => onNavigateTab("teams")}
            className={`${teamsBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="text-2xl mb-1">⚖️</div>
            <div className={`text-sm font-black ${teamsColor}`}>{teamsLabel}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Equipos
            </div>
          </button>

          {/* Score card */}
          <button
            onClick={() => onNavigateTab("score")}
            className={`${scoreBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="text-2xl mb-1">🏆</div>
            <div className={`text-lg font-black ${scoreColor}`}>{scoreLabel}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Marcador
            </div>
          </button>

          {/* Payments card */}
          <button
            onClick={() => onNavigateTab("payments")}
            className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]"
          >
            <div className="text-2xl mb-1">💰</div>
            <div className="text-sm font-black text-emerald-600">Cobros</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Pagos
            </div>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {/* Players card */}
          <button
            onClick={() => onNavigateTab("players")}
            className={`${playersBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="text-2xl mb-1">👥</div>
            <div className={`text-lg font-black ${playersColor}`}>
              {confirmedCount}/{match.maxPlayers}
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Jugadores
            </div>
          </button>

          {/* Teams card */}
          <button
            onClick={() => onNavigateTab("teams")}
            className={`${teamsBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="text-2xl mb-1">⚖️</div>
            <div className={`text-sm font-black ${teamsColor}`}>{teamsLabel}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Equipos
            </div>
          </button>

          {/* Score card */}
          <button
            onClick={() => onNavigateTab("score")}
            className={`${scoreBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="text-2xl mb-1">🏆</div>
            <div className={`text-lg font-black ${scoreColor}`}>{scoreLabel}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Marcador
            </div>
          </button>
        </div>
      )}

      {/* Full match warning */}
      {isFull && !isClosed && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100 text-center">
          🚫 El partido está completo
        </div>
      )}
    </div>
  );
}
