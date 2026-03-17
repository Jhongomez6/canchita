"use client";

import Image from "next/image";
import { useState } from "react";
import type { Player, AttendanceStatus } from "@/lib/domain/player";

interface AttendanceModeProps {
  players: Player[];
  onMarkAttendance: (uid: string, status: AttendanceStatus) => Promise<void>;
  onMarkAllPresent: () => Promise<void>;
  onExit: () => void;
}

export default function AttendanceMode({
  players,
  onMarkAttendance,
  onMarkAllPresent,
  onExit,
}: AttendanceModeProps) {
  const [markingAll, setMarkingAll] = useState(false);
  const [flashUid, setFlashUid] = useState<string | null>(null);

  const confirmedPlayers = players.filter((p) => p.confirmed && !p.isWaitlist);

  async function handleTapPlayer(player: Player) {
    if (!player.uid) return;

    // Cycle through statuses
    const current = player.attendance ?? "present";
    let next: AttendanceStatus;
    if (current === "present") next = "late";
    else if (current === "late") next = "no_show";
    else next = "present";

    setFlashUid(player.uid);
    await onMarkAttendance(player.uid, next);
    setTimeout(() => setFlashUid(null), 300);
  }

  async function handleMarkAllPresent() {
    setMarkingAll(true);
    await onMarkAllPresent();
    setMarkingAll(false);
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          📋 Pasar Lista
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
        className="w-full py-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl font-bold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
      >
        {markingAll ? "⏳ Marcando..." : "✅ Todos presentes"}
      </button>

      {/* Legend */}
      <div className="flex gap-3 mb-3 text-[10px] font-bold text-slate-500 justify-center">
        <span>✅ Presente</span>
        <span>⏰ Tarde</span>
        <span>🚫 No Show</span>
        <span className="text-slate-400">(tap para cambiar)</span>
      </div>

      {/* Player list */}
      <div className="space-y-1">
        {confirmedPlayers.map((p) => {
          const attendance = p.attendance ?? "present";
          const isFlashing = flashUid === p.uid;

          let statusIcon = "✅";
          let statusBg = "bg-emerald-50 border-emerald-100";
          if (attendance === "late") {
            statusIcon = "⏰";
            statusBg = "bg-amber-50 border-amber-100";
          } else if (attendance === "no_show") {
            statusIcon = "🚫";
            statusBg = "bg-red-50 border-red-100";
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
                    <Image src={p.photoURL} alt={p.name} fill className="object-cover" sizes="40px" />
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
              <span className="text-xl">{statusIcon}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
