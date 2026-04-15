"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, X, DollarSign, CheckCircle2, Clock, Ban, Users, Check, Loader2, Wallet } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import type { Match } from "@/lib/domain/match";
import type { Player } from "@/lib/domain/player";
import type { Guest } from "@/lib/domain/guest";

interface PaymentsTabProps {
  match: Match;
  onTogglePayment: (playerId: string, isPaid: boolean) => Promise<void>;
}

interface PayableEntry {
  key: string;
  name: string;
  photoURL?: string;
  photoURLThumb?: string;
  attendanceLabel?: string;
  isGuest: boolean;
  depositPaid?: boolean;
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
      photoURLThumb: p.photoURLThumb,
      attendanceLabel:
        p.attendance === "present"
          ? "present"
          : p.attendance === "late"
          ? "late"
          : p.attendance === "no_show"
          ? "no_show"
          : undefined,
      isGuest: false,
      depositPaid: (p as { depositPaid?: boolean }).depositPaid,
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
  const [draftPayments, setDraftPayments] = useState<Record<string, boolean>>(
    match.payments ?? {}
  );
  const [savingEntries, setSavingEntries] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  
  // Timers ref for debouncing rapid clicks
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    // Cleanup timers on unmount to prevent memory leaks or updating unmounted components
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const players = getPayablePlayers(match);
  const guests = getPayableGuests(match);
  const allEntries = [...players, ...guests];
  const entries = allEntries
    .filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const aPaid = draftPayments[a.key] ?? false;
      const bPaid = draftPayments[b.key] ?? false;
      if (aPaid !== bPaid) return aPaid ? 1 : -1;
      return a.name.localeCompare(b.name, "es");
    });

  const paidCount = entries.filter((e) => draftPayments[e.key] === true).length;
  const pendingCount = entries.length - paidCount;

  async function handleToggle(entry: PayableEntry) {
    const currentPaidState = draftPayments[entry.key] ?? false;
    const newPaidState = !currentPaidState;

    // Optimistic UI update
    setDraftPayments((prev) => ({
      ...prev,
      [entry.key]: newPaidState,
    }));
    
    // Mostramos el estado visual de carga
    setSavingEntries((prev) => ({ ...prev, [entry.key]: true }));

    // Si había un guardado programado pendiente, lo descartamos
    if (debounceTimers.current[entry.key]) {
      clearTimeout(debounceTimers.current[entry.key]);
    }

    // Esperar 800ms de inactividad antes de golpear el backend
    debounceTimers.current[entry.key] = setTimeout(async () => {
      try {
        await onTogglePayment(entry.key, newPaidState);
      } catch {
        // Revert on error
        setDraftPayments((prev) => ({
          ...prev,
          [entry.key]: currentPaidState,
        }));
      } finally {
        setSavingEntries((prev) => ({ ...prev, [entry.key]: false }));
      }
    }, 800);
  }

  return (
    <div role="tabpanel" id="panel-payments" className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <h2 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
          <DollarSign size={18} className="text-[#1f7a4f]" /> Cobros
        </h2>
        <div className="flex gap-3 mb-4">
          <span className="flex-1 text-center py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
            {paidCount} {paidCount === 1 ? "pagó" : "pagaron"}
          </span>
          <span className="flex-1 text-center py-2 rounded-xl bg-amber-50 border border-amber-100 text-xs font-bold text-amber-700">
            {pendingCount} {pendingCount === 1 ? "pendiente" : "pendientes"}
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar por nombre..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1f7a4f] outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          )}
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
          const isSavingItem = savingEntries[entry.key] ?? false;

          return (
            <div key={entry.key} className="flex items-center gap-3 p-3">
              {/* Avatar */}
              <div className="shrink-0">
                {(entry.photoURLThumb ?? entry.photoURL) ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                    <Image
                      src={entry.photoURLThumb ?? entry.photoURL!}
                      alt={entry.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized
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
                <div className="flex items-center gap-2 flex-wrap">
                  {(entry.attendanceLabel || entry.isGuest) && (
                    <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                      {entry.isGuest ? (
                        <><Users size={10} /> Invitado</>
                      ) : (
                        <>
                          {entry.attendanceLabel === "present" && <><CheckCircle2 size={10} className="text-emerald-500" /> Presente</>}
                          {entry.attendanceLabel === "late" && <><Clock size={10} className="text-amber-500" /> Tarde</>}
                          {entry.attendanceLabel === "no_show" && <><Ban size={10} className="text-red-500" /> No show</>}
                        </>
                      )}
                    </span>
                  )}
                  {(match.deposit ?? 0) > 0 && !entry.isGuest && (
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${entry.depositPaid ? "text-emerald-600" : "text-red-500"}`}>
                      <Wallet size={9} />
                      {entry.depositPaid ? `Dep. ${formatCOP(match.deposit!)}` : "Sin depósito"}
                    </span>
                  )}
                </div>
              </div>

              {/* Toggle button */}
              <button
                onClick={() => handleToggle(entry)}
                className={`relative shrink-0 text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 min-w-[90px] ${
                  hasPaid
                    ? "bg-[#1f7a4f] text-white shadow-sm ring-1 ring-[#1f7a4f]/20 hover:bg-[#186440]"
                    : "bg-slate-100 text-slate-600 border border-slate-200 hover:border-[#1f7a4f]/30 hover:bg-emerald-50 hover:text-[#1f7a4f]"
                } ${isSavingItem ? "opacity-90" : ""}`}
              >
                {isSavingItem ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : hasPaid ? (
                  <Check size={14} />
                ) : null}
                {hasPaid ? "Pagado" : "Cobrar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
