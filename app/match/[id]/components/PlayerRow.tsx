"use client";

import type { Player, Position, AttendanceStatus } from "@/lib/domain/player";
import PlayerAvatar from "@/components/PlayerAvatar";
import { POSITION_ICONS } from "@/lib/domain/player";
import { logAttendanceMarked } from "@/lib/analytics";
import { 
  ChevronDown, 
  Clock, 
  Ban, 
  Phone, 
  CheckCircle2 
} from "lucide-react";

interface PlayerRowProps {
  matchId: string;
  player: Player;
  isOwner: boolean;
  isClosed: boolean;
  isFull: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onDelete: () => void;
  onUpdateLevel: (level: number) => void;
  onUpdatePositions: (positions: Position[]) => void;
  onMarkAttendance: (status: AttendanceStatus) => void;
}

export default function PlayerRow({
  matchId,
  player: p,
  isOwner,
  isClosed,
  isFull,
  isExpanded,
  onToggleExpand,
  onConfirm,
  onUnconfirm,
  onDelete,
  onUpdateLevel,
  onUpdatePositions,
  onMarkAttendance,
}: PlayerRowProps) {
  return (
    <div className="py-3">
      {/* Collapsed row — always visible */}
      <div
        className="flex items-center justify-between gap-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            {(p.photoURLThumb ?? p.photoURL) ? (
              <PlayerAvatar
                src={p.photoURLThumb ?? p.photoURL!}
                alt={p.name}
                className="w-10 h-10 rounded-full overflow-hidden relative border border-slate-200 shadow-sm"
              />
            ) : (
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                  p.confirmed
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] shadow-md border border-slate-100 font-bold z-10">
              {POSITION_ICONS[p.primaryPosition || (p.positions?.[0] as Position) || "MID"]}
            </div>
          </div>

          <div className="min-w-0">
            <div className="font-bold text-slate-800 truncate">{p.name}</div>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                  p.confirmed
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                {p.confirmed ? "Confirmado" : "Pendiente"}
              </span>
              {p.attendance && p.attendance !== "present" && (
                <span className="text-[10px] font-bold text-slate-500">
                  {p.attendance === "late" ? (
                    <Clock size={10} className="inline mr-0.5" />
                  ) : (
                    <Ban size={10} className="inline mr-0.5" />
                  )}
                </span>
              )}
              <span className="text-[10px] text-slate-400">Lvl {p.level ?? 2}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Context action — confirm/unconfirm */}
          {!isClosed && (
            <button
              disabled={!p.confirmed && isFull}
              onClick={(e) => {
                e.stopPropagation();
                if (p.confirmed) { onUnconfirm(); } else { onConfirm(); }
              }}
              className={`text-xs font-bold px-3 py-2 rounded-lg transition-colors ${
                p.confirmed
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              }`}
            >
              {p.confirmed ? "Cancelar" : "Confirmar"}
            </button>
          )}

          {/* Expand indicator */}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="mt-3 ml-[52px] space-y-3 animate-in slide-in-from-top-1 fade-in duration-200">
          {/* Phone */}
          {isOwner && p.phone && (
            <a
              href={`tel:+57${p.phone}`}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
            >
              <Phone size={12} /> +57 {p.phone}
            </a>
          )}

          {/* Level selector */}
          {isOwner && !isClosed && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Nivel:</span>
              <select
                value={p.level ?? 2}
                onChange={(e) => onUpdateLevel(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="text-base bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#1f7a4f]"
              >
                <option value={1}>Bajo (1)</option>
                <option value={2}>Medio (2)</option>
                <option value={3}>Alto (3)</option>
              </select>
            </div>
          )}

          {/* Position checkboxes */}
          {isOwner && !isClosed && (
            <div className="flex gap-2">
              {(["GK", "DEF", "MID", "FWD"] as Position[]).map((pos) => (
                <label
                  key={pos}
                  className={`flex-1 text-center cursor-pointer text-[10px] font-bold px-2 py-1.5 rounded border transition-all ${
                    p.positions?.includes(pos)
                      ? "bg-blue-50 border-blue-200 text-blue-600"
                      : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={p.positions?.includes(pos) ?? false}
                    onChange={(e) => {
                      const current = p.positions ?? [];
                      const updated = e.target.checked
                        ? [...current, pos]
                        : current.filter((x: Position) => x !== pos);
                      if (updated.length > 2) return;
                      onUpdatePositions(updated);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {pos}
                </label>
              ))}
            </div>
          )}

          {/* Attendance controls */}
          {isOwner && (
            <div className="flex gap-1">
              <span className="text-xs font-bold text-slate-500 mr-2 self-center">Asistencia:</span>
              {[
                { status: "present" as const, icon: CheckCircle2, label: "Presente" },
                { status: "late" as const, icon: Clock, label: "Tarde" },
                { status: "no_show" as const, icon: Ban, label: "No Show" },
              ].map((opt) => (
                <button
                  key={opt.status}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (p.uid) {
                      onMarkAttendance(opt.status);
                      logAttendanceMarked(matchId, opt.status);
                    }
                  }}
                  className={`p-2 rounded-lg text-sm border transition-all flex items-center justify-center ${
                    (p.attendance ?? "present") === opt.status
                      ? "bg-slate-800 border-slate-800 text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                  }`}
                  title={`Marcar como ${opt.label}`}
                >
                  <opt.icon size={16} />
                </button>
              ))}
            </div>
          )}

          {/* Delete */}
          {isOwner && !isClosed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-xs font-bold px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              Eliminar jugador
            </button>
          )}
        </div>
      )}
    </div>
  );
}
