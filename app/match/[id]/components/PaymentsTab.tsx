"use client";

import Image from "next/image";
import type { Match } from "@/lib/domain/match";
import type { Player } from "@/lib/domain/player";
import type { Guest } from "@/lib/domain/guest";

interface PaymentsTabProps {
  match: Match;
  onTogglePayment: (key: string, hasPaid: boolean) => Promise<void>;
}

interface PayableEntry {
  key: string;
  name: string;
  photoURL?: string;
  attendanceLabel?: string;
  isGuest: boolean;
}

function guestKey(guest: Guest): string {
  return `guest_${guest.invitedBy}_${guest.name}`;
}

function getPayablePlayers(match: Match): PayableEntry[] {
  const all = match.players ?? [];

  const withAttendance = all.filter(
    (p) =>
      p.uid &&
      (p.attendance === "present" ||
        p.attendance === "late" ||
        p.attendance === "no_show")
  );

  const source =
    withAttendance.length > 0
      ? withAttendance
      : all.filter((p) => p.uid && p.confirmed === true);

  return source.map((p: Player) => ({
    key: p.uid!,
    name: p.name,
    photoURL: p.photoURL,
    attendanceLabel:
      p.attendance === "present"
        ? "✅ Presente"
        : p.attendance === "late"
        ? "⏰ Tarde"
        : p.attendance === "no_show"
        ? "🚫 No show"
        : undefined,
    isGuest: false,
  }));
}

function getPayableGuests(match: Match): PayableEntry[] {
  return (match.guests ?? [])
    .filter((g) => !g.isWaitlist)
    .map((g: Guest) => ({
      key: guestKey(g),
      name: `${g.name} (inv)`,
      isGuest: true,
    }));
}

export default function PaymentsTab({ match, onTogglePayment }: PaymentsTabProps) {
  const players = getPayablePlayers(match);
  const guests = getPayableGuests(match);
  const entries = [...players, ...guests];
  const payments = match.payments ?? {};

  const paidCount = entries.filter((e) => payments[e.key] === true).length;
  const pendingCount = entries.length - paidCount;

  async function handleToggle(entry: PayableEntry) {
    const current = payments[entry.key] ?? false;
    await onTogglePayment(entry.key, !current);
  }

  return (
    <div role="tabpanel" id="panel-payments" className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <h2 className="text-base font-bold text-slate-800 mb-3">
          💰 Cobros
        </h2>
        <div className="flex gap-3">
          <span className="flex-1 text-center py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
            {paidCount} {paidCount === 1 ? "pagó" : "pagaron"}
          </span>
          <span className="flex-1 text-center py-2 rounded-xl bg-amber-50 border border-amber-100 text-xs font-bold text-amber-700">
            {pendingCount} {pendingCount === 1 ? "pendiente" : "pendientes"}
          </span>
        </div>
      </div>

      {/* Player list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100">
        {entries.length === 0 && (
          <p className="p-5 text-sm text-slate-400 text-center">
            No hay jugadores para cobrar.
          </p>
        )}

        {entries.map((entry) => {
          const hasPaid = payments[entry.key] ?? false;

          return (
            <div key={entry.key} className="flex items-center gap-3 p-3">
              {/* Avatar */}
              <div className="shrink-0">
                {entry.photoURL ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                    <Image
                      src={entry.photoURL}
                      alt={entry.name}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-slate-600">
                    {entry.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name + badge */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 truncate">{entry.name}</p>
                {(entry.attendanceLabel || entry.isGuest) && (
                  <span className="text-[10px] font-semibold text-slate-400">
                    {entry.isGuest ? "👥 Invitado" : entry.attendanceLabel}
                  </span>
                )}
              </div>

              {/* Toggle button */}
              <button
                onClick={() => handleToggle(entry)}
                className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg transition-colors ${
                  hasPaid
                    ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                    : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                }`}
              >
                {hasPaid ? "Pagó ✓" : "Pendiente"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
