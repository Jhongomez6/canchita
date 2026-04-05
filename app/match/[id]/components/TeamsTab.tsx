"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Player } from "@/lib/domain/player";
import { getTeamSummary } from "@/lib/domain/team";
import TeamColumn from "./TeamColumn";
import { logMatchReportCopied, logTeamsConfirmed } from "@/lib/analytics";
import { 
  Scale, 
  Loader2, 
  ChevronDown, 
  Check, 
  Copy, 
  Hand, 
  CheckCircle2
} from "lucide-react";

interface TeamsTabProps {
  matchId: string;
  balanced: { teamA: { players: Player[] }; teamB: { players: Player[] } } | null;
  confirmedCount: number;
  isOwner: boolean;
  isClosed: boolean;
  isSavingTeams: boolean;
  votingClosed: boolean;
  currentMVPs: string[];
  voteCounts: Record<string, number>;
  hasTeamsSaved: boolean;
  teamsConfirmed: boolean;
  // Actions
  onBalance: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onCopyReport: () => Promise<void>;
  onGetReportText: () => string;
  onConfirmTeams: () => Promise<void>;
  balancing: boolean;
}

export default function TeamsTab({
  matchId,
  balanced,
  confirmedCount,
  isOwner,
  isClosed,
  isSavingTeams,
  votingClosed,
  currentMVPs,
  voteCounts,
  hasTeamsSaved,
  teamsConfirmed,
  onBalance,
  onDragEnd,
  onCopyReport,
  onGetReportText,
  onConfirmTeams,
  balancing,
}: TeamsTabProps) {
  const [copyingReport, setCopyingReport] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [showPositionGrid, setShowPositionGrid] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );


  async function handleCopyReport() {
    setCopyingReport(true);
    setCopiedReport(false);
    try {
      await onCopyReport();
      logMatchReportCopied(matchId, isClosed ? "summary" : "teams", "clipboard");
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } finally {
      setCopyingReport(false);
    }
  }

  // No teams yet — show balance button
  if (!balanced) {
    return (
      <div role="tabpanel" id="panel-teams" className="animate-in fade-in duration-200">
        {isOwner && !isClosed && (
          <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-500/20 p-5">
            <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
              <Scale size={18} /> Balancear equipos
            </h3>
            <p className="text-sm text-emerald-700 mb-4 opacity-80">
              Se usarán los jugadores <strong>confirmados</strong> + <strong>invitados</strong>.
              <br />
              Total elegibles: <strong>{confirmedCount}</strong>
            </p>
            <button
              disabled={confirmedCount < 4}
              onClick={onBalance}
              className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 ${confirmedCount < 4
                  ? "bg-slate-300 cursor-not-allowed shadow-none"
                  : "bg-[#16a34a] hover:bg-[#15803d]"
                }`}
            >
              {balancing ? <Loader2 size={20} className="animate-spin" /> : <Scale size={20} />}
              {balancing ? "Balanceando..." : "Generar equipos"}
            </button>
            {confirmedCount < 4 && (
              <p className="text-xs text-red-500 mt-2 font-medium text-center">
                Necesitas al menos 4 jugadores confirmados
              </p>
            )}
          </div>
        )}

        {!isOwner && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center flex flex-col items-center">
            <Scale size={48} className="text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">
              Los equipos aún no han sido balanceados
            </p>
          </div>
        )}
      </div>
    );
  }

  const summaryA = getTeamSummary(balanced.teamA.players);
  const summaryB = getTeamSummary(balanced.teamB.players);
  const diffLevel = Math.abs(summaryA.totalLevel - summaryB.totalLevel);

  return (
    <div role="tabpanel" id="panel-teams" className="space-y-4 animate-in fade-in duration-200">
      {/* Balance summary header + share buttons */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
        <button
          onClick={() => setShowPositionGrid(!showPositionGrid)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Scale size={24} className="text-[#1f7a4f]" />
            <div className="text-left">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Diferencia de nivel
              </div>
              <div className="text-xl font-black text-slate-800">{diffLevel} pts</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && !isClosed && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onBalance();
                }}
                className="text-xs font-bold px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                Re-balancear
              </span>
            )}
            <ChevronDown size={18} className={`text-slate-400 transition-transform ${showPositionGrid ? "rotate-180" : ""}`} />
          </div>
        </button>

        {hasTeamsSaved && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              disabled={copyingReport}
              onClick={handleCopyReport}
              className={`py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-50 ${copiedReport
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
            >
              {copyingReport ? (
                <Loader2 size={14} className="animate-spin" />
              ) : copiedReport ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
              <span>{copiedReport ? "Copiado" : "Copiar"}</span>
            </button>
            <button
              onClick={() => {
                const text = onGetReportText();
                if (text) {
                  logMatchReportCopied(matchId, isClosed ? "summary" : "teams", "whatsapp");
                  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                }
              }}
              className="py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border bg-green-50 border-green-200 text-green-600 hover:bg-green-100 transition-colors"
            >
              <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={() => {
                const text = onGetReportText();
                if (text) {
                  logMatchReportCopied(matchId, isClosed ? "summary" : "teams", "telegram");
                  window.open(`https://t.me/share/url?url=%20&text=${encodeURIComponent(text.replace(/\*/g, ""))}`, "_blank");
                }
              }}
              className="py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border bg-sky-50 border-sky-200 text-sky-600 hover:bg-sky-100 transition-colors"
            >
              <img src="/icons/telegram.svg" alt="Telegram" className="w-4 h-4" />
              <span>Telegram</span>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible position grid */}
      {showPositionGrid && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 animate-in slide-in-from-top-1 fade-in duration-200">
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium text-slate-600">
            <div className="font-bold text-slate-400 mb-1">POS</div>
            <div className="bg-red-50 text-red-700 rounded py-1">A</div>
            <div></div>
            <div className="bg-blue-50 text-blue-700 rounded py-1">B</div>

            <div>GK</div>
            <div>{summaryA.positionsCount.GK}</div>
            <div className="text-slate-300">-</div>
            <div>{summaryB.positionsCount.GK}</div>

            <div>DEF</div>
            <div>{summaryA.positionsCount.DEF}</div>
            <div className="text-slate-300">-</div>
            <div>{summaryB.positionsCount.DEF}</div>

            <div>MID</div>
            <div>{summaryA.positionsCount.MID}</div>
            <div className="text-slate-300">-</div>
            <div>{summaryB.positionsCount.MID}</div>

            <div>FWD</div>
            <div>{summaryA.positionsCount.FWD}</div>
            <div className="text-slate-300">-</div>
            <div>{summaryB.positionsCount.FWD}</div>
          </div>
        </div>
      )}

      {/* Drag hint */}
      {isOwner && !isClosed && !isSavingTeams && (
        <p className="text-center text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
          <Hand size={12} /> Mantén presionado y arrastra un jugador para moverlo entre equipos
        </p>
      )}

      {/* Teams — side by side */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 gap-2">
          <TeamColumn
            team="A"
            players={balanced.teamA.players}
            totalLevel={summaryA.totalLevel}
            count={summaryA.count}
            isClosed={isClosed}
            votingClosed={votingClosed}
            currentMVPs={currentMVPs}
            voteCounts={voteCounts}
          />
          <TeamColumn
            team="B"
            players={balanced.teamB.players}
            totalLevel={summaryB.totalLevel}
            count={summaryB.count}
            isClosed={isClosed}
            votingClosed={votingClosed}
            currentMVPs={currentMVPs}
            voteCounts={voteCounts}
          />
        </div>
      </DndContext>

      {/* Auto-save indicator */}
      {isOwner && !isClosed && isSavingTeams && (
        <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <Loader2 size={12} className="animate-spin" />
          <span>Sincronizando... Puedes seguir moviendo jugadores libremente</span>
        </div>
      )}

      {/* Confirm teams (publish to players) — above score */}
      {isOwner && !isClosed && balanced && !isSavingTeams && !teamsConfirmed && (
        <button
          id="btn-confirm-teams"
          disabled={confirming}
          onClick={async () => {
            if (!confirm("Al confirmar, los jugadores podrán ver los equipos en la página del partido. ¿Deseas publicar los equipos?")) return;
            setConfirming(true);
            try {
              await onConfirmTeams();
              logTeamsConfirmed(matchId);
            } finally {
              setConfirming(false);
            }
          }}
          className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 ${confirming
              ? "bg-slate-400 cursor-not-allowed shadow-none"
              : "bg-emerald-600 hover:bg-emerald-700"
            }`}
        >
          {confirming ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
          {confirming ? "Publicando..." : "Confirmar y publicar equipos"}
        </button>
      )}

      {/* Teams published badge */}
      {teamsConfirmed && !isClosed && (
        <div className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold border border-emerald-200 text-center">
          <CheckCircle2 size={14} /> Equipos publicados — los jugadores ya pueden ver los equipos
        </div>
      )}


    </div>
  );
}
