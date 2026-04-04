"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { Match } from "@/lib/domain/match";
import type { Player } from "@/lib/domain/player";
import type { Guest } from "@/lib/domain/guest";

interface PaymentsTabProps {
  match: Match;
  onSavePayments: (payments: Record<string, boolean>) => Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
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

  // Mostrar jugadores que tengan attendance registrado O que estén confirmed
  return all
    .filter((p) => p.uid && (
      (p.attendance === "present" ||
        p.attendance === "late" ||
        p.attendance === "no_show") ||
      p.confirmed === true
    ))
    .map((p: Player) => ({
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

export default function PaymentsTab({ match, onSavePayments, onDirtyChange }: PaymentsTabProps) {
  const [draftPayments, setDraftPayments] = useState<Record<string, boolean>>(
    match.payments ?? {}
  );
  const [isSaving, setIsSaving] = useState(false);

  const players = getPayablePlayers(match);
  const guests = getPayableGuests(match);
  const entries = [...players, ...guests];

  const paidCount = entries.filter((e) => draftPayments[e.key] === true).length;
  const pendingCount = entries.length - paidCount;

  // Detectar si hay cambios sin guardar
  const hasChanges = JSON.stringify(draftPayments) !== JSON.stringify(match.payments ?? {});

  // Notificar al padre cuando el estado dirty cambia
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  function handleToggle(entry: PayableEntry) {
    setDraftPayments((prev) => ({
      ...prev,
      [entry.key]: !prev[entry.key],
    }));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSavePayments(draftPayments);
    } finally {
      setIsSaving(false);
    }
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
          const hasPaid = draftPayments[entry.key] ?? false;

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
                disabled={isSaving}
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

      {/* Save button */}
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full font-bold py-3 rounded-xl transition-colors ${
            isSaving
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {isSaving ? "Guardando..." : "Guardar Cobros"}
        </button>
      )}
    </div>
  );
}
