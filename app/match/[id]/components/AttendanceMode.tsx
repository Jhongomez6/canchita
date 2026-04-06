"use client";

import Image from "next/image";
import { useState } from "react";
import type { Player, AttendanceStatus } from "@/lib/domain/player";
import { logAttendanceMarked } from "@/lib/analytics";
import { 
  ClipboardCheck, 
  CheckCircle2, 
  Clock, 
  Ban 
} from "lucide-react";

interface AttendanceModeProps {
  matchId: string;
  players: Player[];
  onMarkAttendance: (uid: string, status: AttendanceStatus) => Promise<void>;
  onMarkAllPresent: () => Promise<void>;
  onExit: () => void;
}

export default function AttendanceMode({
  matchId,
  players,
  onMarkAttendance,
  onMarkAllPresent,
  onExit,
}: AttendanceModeProps) {
  const [markingAll, setMarkingAll] = useState(false);
  const [flashUid, setFlashUid] = useState<string | null>(null);
  const [localAttendance, setLocalAttendance] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(
      players.map((p) => [p.uid || p.id || p.name, p.attendance || "present"])
    )
  );

  const confirmedPlayers = players.filter((p) => p.confirmed && !p.isWaitlist);

  async function handleTapPlayer(player: Player) {
    const id = player.uid || player.id || player.name;
    if (!id) return;

    // Cycle through statuses
    const current = localAttendance[id] ?? "present";
    let next: AttendanceStatus;
    if (current === "present") next = "late";
    else if (current === "late") next = "no_show";
    else next = "present";

    setFlashUid(id);
    setLocalAttendance((prev) => ({ ...prev, [id]: next }));

    // Persist only if registered player (uid exists and is not a guest ID)
    const isGuest = id.startsWith("guest-");
    if (player.uid && !isGuest) {
      await onMarkAttendance(player.uid, next);
      logAttendanceMarked(matchId, next);
    }
    
    setTimeout(() => setFlashUid(null), 300);
  }

  async function handleMarkAllPresent() {
    setMarkingAll(true);
    // Local update
    const updated: Record<string, AttendanceStatus> = {};
    players.forEach(p => {
      updated[p.uid || p.id || p.name] = "present";
    });
    setLocalAttendance(updated);

    // Persistence update (backend only handles registered players)
    await onMarkAllPresent();
    logAttendanceMarked(matchId, "all_present");
    setMarkingAll(false);
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <ClipboardCheck size={20} className="text-[#1f7a4f]" /> Pasar Lista
        </h3>
        <button
          onClick={onExit}
          className="text-sm font-bold text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Salir
        </button>
      </div>

      {/* Bulk action */}
      <button
        onClick={handleMarkAllPresent}
        disabled={markingAll}
        className="w-full py-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl font-bold text-emerald-700 flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors disabled:opacity-50"
      >
        {markingAll ? (
          <Clock size={20} className="animate-pulse" />
        ) : (
          <CheckCircle2 size={20} />
        )}
        {markingAll ? "Marcando..." : "Todos presentes"}
      </button>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-[10px] font-bold text-slate-500 justify-center items-center">
        <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> Presente</span>
        <span className="flex items-center gap-1"><Clock size={12} className="text-amber-500" /> Tarde</span>
        <span className="flex items-center gap-1"><Ban size={12} className="text-red-500" /> No Show</span>
        <span className="text-slate-400 ml-1">(tap para cambiar)</span>
      </div>

      {/* Player list */}
      <div className="space-y-1">
        {confirmedPlayers.map((p) => {
          const id = p.uid || p.id || p.name;
          const attendance = localAttendance[id] ?? "present";
          const isFlashing = flashUid === id;

          let StatusIcon = CheckCircle2;
          let statusBg = "bg-emerald-50 border-emerald-100";
          let iconColor = "text-emerald-500";
          
          if (attendance === "late") {
            StatusIcon = Clock;
            statusBg = "bg-amber-50 border-amber-100";
            iconColor = "text-amber-500";
          } else if (attendance === "no_show") {
            StatusIcon = Ban;
            statusBg = "bg-red-50 border-red-100";
            iconColor = "text-red-500";
          }

          return (
            <button
              key={p.uid || p.name}
              onClick={() => handleTapPlayer(p)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${statusBg} ${
                isFlashing ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              {/* Photo */}
              <div className="relative shrink-0">
                {p.photoURL ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                    <Image src={p.photoURL} alt={p.name} fill className="object-cover" sizes="48px" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-sm text-slate-600">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name */}
              <span className="font-bold text-slate-800 flex-1 text-left">{p.name}</span>

              {/* Status */}
              <StatusIcon size={24} className={iconColor} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
