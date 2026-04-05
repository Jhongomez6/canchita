"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Trophy, 
  MapPin, 
  Calendar, 
  Clock, 
  Eye, 
  Lock, 
  Users, 
  Scale, 
  DollarSign, 
  Ban,
  Activity,
  Copy,
  Check,
  ShieldCheck
} from "lucide-react";
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
  onCopyLink: () => Promise<void>;
  onCopyCode: () => Promise<void>;
  onCopyInvitation: () => Promise<void>;
  onCopyReport: () => Promise<void>;
  getInvitationText: () => string;
  getInvitationTextTelegram: () => string;
  getReportText: () => string;
}

export default function DashboardTab({
  match,
  location,
  phase,
  confirmedCount,
  isClosed,
  onNavigateTab,
  onCopyLink,
  onCopyCode,
  onCopyInvitation,
  onCopyReport,
  getInvitationText,
  getInvitationTextTelegram,
  getReportText,
}: DashboardTabProps) {
  const [copyingLink, setCopyingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCodeState, setCopiedCodeState] = useState(false);
  const [copyingText, setCopyingText] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
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
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 truncate">
              <Activity className="text-[#1f7a4f] shrink-0" size={24} /> Partido
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                  isClosed
                    ? "bg-slate-100 text-slate-500"
                    : "bg-emerald-100 text-emerald-600"
                }`}
              >
                {isClosed ? "Completado" : "Abierto"}
              </span>
              {match.isPrivate && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-slate-100 text-slate-500 border border-slate-200">
                  <Lock size={12} /> Privado
                </span>
              )}
            </div>
          </div>
          
          <Link
            href={`/join/${match.id}`}
            className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm active:scale-[0.98]"
          >
            <Eye size={14} className="text-slate-500" /> Vista jugador
          </Link>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-slate-400" />
            {location?.name ? (
              <span className="text-slate-600 font-medium">{location.name}</span>
            ) : (
              <div className="h-5 bg-slate-200 rounded animate-pulse w-48"></div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-slate-400" />
            <span className="text-slate-600 font-medium">{formatDateSpanish(match.date)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Clock size={18} className="text-slate-400" />
            <span className="text-slate-600 font-medium">
              {formatTime12h(match.time)}
              {match.duration ? <span className="text-slate-400 font-normal"> · hasta las {formatEndTime(match.time, match.duration)}</span> : ""}
            </span>
          </div>

          {isClosed && match.closedAt && (
            <div className="flex items-center gap-3 bg-red-50 p-2 rounded-lg border border-red-100 mt-1">
              <Lock size={18} className="text-red-500" />
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

        {/* Quick Share Bar */}
        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100">
          
          {/* Row 1: Link y Código */}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setCopyingLink(true);
                setCopiedLink(false);
                try {
                  await onCopyLink();
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                } finally {
                  setCopyingLink(false);
                }
              }}
              disabled={copyingLink}
              className="flex-1 flex gap-1.5 items-center justify-center p-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 text-xs font-bold active:scale-[0.98]"
            >
              {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} className="text-slate-500" />}
              {copiedLink ? "Link copiado" : "Copiar Link"}
            </button>
            <button
              onClick={async () => {
                await onCopyCode();
                setCopiedCodeState(true);
                setTimeout(() => setCopiedCodeState(false), 2000);
              }}
              disabled={copiedCodeState}
              className="flex-1 flex gap-1.5 items-center justify-center p-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 text-xs font-bold active:scale-[0.98]"
            >
              {copiedCodeState ? <Check size={14} className="text-emerald-600" /> : <ShieldCheck size={14} className="text-slate-500" />}
              {copiedCodeState ? "Copiado" : "Copiar Código"}
            </button>
          </div>

          {/* Row 2: Texto, WhatsApp, Telegram */}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setCopyingText(true);
                setCopiedText(false);
                try {
                  if (isClosed) {
                    await onCopyReport();
                  } else {
                    await onCopyInvitation();
                  }
                  setCopiedText(true);
                  setTimeout(() => setCopiedText(false), 2000);
                } finally {
                  setCopyingText(false);
                }
              }}
              disabled={copyingText}
              className="flex-[2] flex gap-1.5 items-center justify-center p-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 text-xs font-bold active:scale-[0.98]"
            >
              {copyingText ? (
                <Check size={14} className="text-transparent" />
              ) : copiedText ? (
                <Check size={14} className="text-emerald-600" />
              ) : (
                <Copy size={14} className="text-slate-500" />
              )}
              {copiedText ? "Copiado" : isClosed ? "Copiar Reporte" : "Copiar Invitación"}
            </button>
            
            <button
              onClick={() => {
                const text = isClosed ? getReportText() : getInvitationText();
                if (text) window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
              }}
              className="flex-[1] flex items-center justify-center p-2.5 bg-[#25D366]/10 text-[#075E54] hover:bg-[#25D366]/20 rounded-xl transition-colors border border-[#25D366]/30 active:scale-[0.98]"
              title="Compartir por WhatsApp"
            >
              <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-[16px] h-[16px]" />
            </button>

            <button
              onClick={() => {
                const text = isClosed ? getReportText() : getInvitationTextTelegram();
                if (text) window.open(`https://t.me/share/url?url=%20&text=${encodeURIComponent(text.replace(/\*/g, ""))}`, "_blank");
              }}
              className="flex-[1] flex items-center justify-center p-2.5 bg-[#0088cc]/10 text-[#0088cc] hover:bg-[#0088cc]/20 rounded-xl transition-colors border border-[#0088cc]/30 active:scale-[0.98]"
              title="Compartir por Telegram"
            >
              <img src="/icons/telegram.svg" alt="Telegram" className="w-[16px] h-[16px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <MatchProgressBar phase={phase} />
      </div>

      {/* Stat Mini-Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Players card */}
        <button
          onClick={() => onNavigateTab("players")}
          className={`${playersBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97] flex flex-col items-center justify-center`}
        >
          <Users size={24} className={playersColor + " mb-1"} />
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
          className={`${teamsBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97] flex flex-col items-center justify-center`}
        >
          <Scale size={24} className={teamsColor + " mb-1"} />
          <div className={`text-sm font-black ${teamsColor}`}>{teamsLabel}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Equipos
          </div>
        </button>

        {/* Score card */}
        <button
          onClick={() => onNavigateTab("score")}
          className={`${scoreBg} border rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97] flex flex-col items-center justify-center`}
        >
          <Trophy size={24} className={scoreColor + " mb-1"} />
          <div className={`text-lg font-black ${scoreColor}`}>{scoreLabel}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Marcador
          </div>
        </button>

        {/* Payments card */}
        <button
          onClick={() => onNavigateTab("payments")}
          className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center transition-all hover:shadow-md active:scale-[0.97] flex flex-col items-center justify-center"
        >
          <DollarSign size={24} className="text-emerald-600 mb-1" />
          <div className="text-sm font-black text-emerald-600">Cobros</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Pagos
          </div>
        </button>
      </div>

      {/* Full match warning */}
      {isFull && !isClosed && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100 text-center flex items-center justify-center gap-2">
          <Ban size={16} /> El partido está completo
        </div>
      )}
    </div>
  );
}
