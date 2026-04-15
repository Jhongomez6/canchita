"use client";

import { useState } from "react";
import Link from "next/link";
import type { Match, MatchDuration } from "@/lib/domain/match";
import { formatDuration } from "@/lib/date";
import { 
  Settings,
  Ticket,
  Clock,
  Users, 
  Eye, 
  ClipboardList, 
  Bell, 
  RefreshCw, 
  AlertCircle, 
  Lock, 
  Unlock, 
  Trash2,
  Loader2
} from "lucide-react";

interface SettingsTabProps {
  match: Match;
  isOwner: boolean;
  isClosed: boolean;
  hasScore: boolean;
  maxPlayersDraft: number | null;
  // Actions
  onUpdateMaxPlayers: (value: number) => Promise<void>;
  onUpdateDuration: (value: MatchDuration) => Promise<void>;
  onSendReminder: () => Promise<void>;
  onCloseMatch: () => Promise<void>;
  onReopenMatch: () => Promise<void>;
  onDeleteMatch: () => Promise<void>;
  onToggleAllowGuests: (value: boolean) => Promise<void>;
  onUpdateInstructions?: (value: string) => Promise<void>;
}

export default function SettingsTab({
  match,
  isOwner,
  isClosed,
  hasScore,
  maxPlayersDraft,
  onUpdateMaxPlayers,
  onUpdateDuration,
  onSendReminder,
  onCloseMatch,
  onReopenMatch,
  onDeleteMatch,
  onToggleAllowGuests,
  onUpdateInstructions,
}: SettingsTabProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGuestsConfirm, setShowGuestsConfirm] = useState(false);
  const [togglingGuests, setTogglingGuests] = useState(false);
  const [localMaxPlayers, setLocalMaxPlayers] = useState(maxPlayersDraft);
  const [localInstructions, setLocalInstructions] = useState(match.instructions || "");
  const [savingInstructions, setSavingInstructions] = useState(false);

  const currentMax = localMaxPlayers ?? match.maxPlayers ?? 14;
  const guestCount = match.guests?.length ?? 0;

  async function handleSendReminder() {
    setSendingReminder(true);
    try {
      await onSendReminder();
    } finally {
      setSendingReminder(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDeleteMatch();
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div role="tabpanel" id="panel-settings" className="space-y-4 animate-in fade-in duration-200">


      {/* Match Config */}
      {isOwner && !isClosed && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Settings size={18} className="text-[#1f7a4f]" /> Configuración
          </h3>

          <div className="space-y-4">
            {/* Max players */}
            {!isClosed && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ticket size={18} className="text-slate-400" />
                  <span className="text-slate-600 font-medium text-sm">Cupo máximo</span>
                </div>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm h-8">
                  <button
                    onClick={async () => {
                      const newVal = currentMax - 2;
                      if (newVal < 2) return;
                      setLocalMaxPlayers(newVal);
                      await onUpdateMaxPlayers(newVal);
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold border-r border-slate-200 transition-colors h-full"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={2}
                    step={2}
                    value={currentMax}
                    onChange={(e) => setLocalMaxPlayers(Number(e.target.value))}
                    onBlur={async () => {
                      if (!localMaxPlayers) return;
                      const evenVal =
                        localMaxPlayers % 2 !== 0 ? localMaxPlayers + 1 : localMaxPlayers;
                      if (evenVal === match.maxPlayers) {
                        setLocalMaxPlayers(evenVal);
                        return;
                      }
                      setLocalMaxPlayers(evenVal);
                      await onUpdateMaxPlayers(evenVal);
                    }}
                    className="w-12 text-center font-bold text-base py-1 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={async () => {
                      const newVal = currentMax + 2;
                      setLocalMaxPlayers(newVal);
                      await onUpdateMaxPlayers(newVal);
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold border-l border-slate-200 transition-colors h-full"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Duration */}
            {!isClosed && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-slate-400" />
                  <span className="text-slate-600 font-medium text-sm">Duración</span>
                </div>
                <select
                  value={match.duration ?? ""}
                  onChange={async (e) => {
                    const val = Number(e.target.value) as MatchDuration;
                    await onUpdateDuration(val);
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-base font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]"
                >
                  {!match.duration && <option value="">Sin definir</option>}
                  {([30, 60, 90, 120, 150, 180] as MatchDuration[]).map((d) => (
                    <option key={d} value={d}>{formatDuration(d)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Allow guests toggle */}
            {!isClosed && (
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-slate-400" />
                  <div>
                    <span className="text-slate-600 font-medium text-sm">Permitir invitados</span>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      {match.allowGuests !== false
                        ? "Los jugadores pueden llevar hasta 2 invitados sin cuenta."
                        : "Solo usuarios con cuenta pueden asistir."}
                    </p>
                  </div>
                </div>
                <div className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={match.allowGuests !== false}
                    onChange={(e) => {
                      if (!e.target.checked && guestCount > 0) {
                        setShowGuestsConfirm(true);
                      } else {
                        onToggleAllowGuests(e.target.checked);
                      }
                    }}
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f7a4f]"></div>
                </div>
              </label>
            )}

            {/* View as player */}
              <Link
                href={`/join/${match.id}`}
                className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Eye size={16} /> Vista jugador
              </Link>
          </div>
        </div>
      )}

      {/* Match Instructions */}
      {isOwner && onUpdateInstructions && !isClosed && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
            <div className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg">
              <ClipboardList size={18} />
            </div>
            Instrucciones para jugadores
            <span className="text-xs font-normal text-slate-400">(opcional)</span>
          </h3>
          <p className="text-[10px] text-slate-400 mb-3">
            Visible para todos en la página del partido. Pago, puntualidad u otras condiciones.
          </p>
          <div className="relative mb-3">
            <textarea
              value={localInstructions}
              maxLength={500}
              rows={3}
              placeholder="Ej: Pago $5000 en efectivo al llegar. Lleguen 10 minutos antes."
              className="w-full px-3 py-2.5 text-base text-slate-700 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent"
              onChange={(e) => setLocalInstructions(e.target.value)}
            />
            <span className={`absolute bottom-2 right-3 text-[10px] ${localInstructions.length >= 500 ? "text-red-500" : "text-slate-400"}`}>
              {localInstructions.length}/500
            </span>
          </div>
          <button
            onClick={async () => {
              if (localInstructions === match.instructions) return;
              setSavingInstructions(true);
              try {
                await onUpdateInstructions(localInstructions.trim());
              } finally {
                setSavingInstructions(false);
              }
            }}
            disabled={savingInstructions || localInstructions === (match.instructions || "")}
            className={`w-full py-3 rounded-xl font-bold text-sm shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              savingInstructions || localInstructions === (match.instructions || "")
                ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
            }`}
          >
            {savingInstructions && <Loader2 size={16} className="animate-spin" />}
            {savingInstructions ? "Guardando..." : "Guardar instrucciones"}
          </button>
        </div>
      )}

      {/* Notifications */}
      {isOwner && !isClosed && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Bell size={18} className="text-[#1f7a4f]" /> Notificaciones
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Envía una notificación push a todos los jugadores confirmados y pendientes que tengan activadas las notificaciones en su dispositivo.
          </p>
          <button
            onClick={handleSendReminder}
            disabled={sendingReminder}
            className="w-full py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {sendingReminder ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Bell size={18} />
            )}
            {sendingReminder
              ? "Despachando notificaciones..."
              : "Enviar Recordatorio (Push)"}
          </button>
        </div>
      )}

      {/* Match Lifecycle */}
      {isOwner && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <RefreshCw size={18} className="text-[#1f7a4f]" /> Estado del partido
          </h3>

          {!isClosed && (
            <>
              {match.teams && !hasScore && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>Debes registrar el marcador antes de cerrar el partido. Ve a la pestaña <strong>Marcador</strong> e ingresa el resultado.</span>
                </div>
              )}
                  <button
                    id="btn-close-match"
                    disabled={!match.teams || !hasScore || isClosing}
                    onClick={async () => {
                  if (!match.teams || !hasScore || isClosing) return;
                  if (!confirm("¿Cerrar partido y procesar estadísticas?")) return;
                  setIsClosing(true);
                  try {
                    await onCloseMatch();
                  } finally {
                    setIsClosing(false);
                  }
                }}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-[0.98] ${!match.teams || !hasScore || isClosing
                    ? "bg-slate-400 cursor-not-allowed opacity-50 shadow-none"
                    : "bg-red-600 hover:bg-red-700"
                  }`}
              >
                {isClosing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Lock size={18} />
                )}
                {isClosing ? "Cerrando partido..." : "Cerrar partido final"}
              </button>
            </>
          )}

          {isClosed && (
            <button
              disabled={isReopening}
              onClick={async () => {
                if (isReopening) return;
                if (!confirm("¿Reabrir el partido?")) return;
                setIsReopening(true);
                try {
                  await onReopenMatch();
                } finally {
                  setIsReopening(false);
                }
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-[0.98] ${isReopening
                  ? "bg-slate-400 cursor-not-allowed opacity-50 shadow-none"
                  : "bg-[#1f7a4f] hover:bg-[#16603c]"
                }`}
            >
              {isReopening ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Unlock size={18} />
              )}
              {isReopening ? "Reabriendo..." : "Reabrir partido"}
            </button>
          )}

          {!match.teams && !isClosed && (
            <p className="text-xs text-slate-400 mt-2 text-center">
              Necesitas balancear equipos antes de cerrar
            </p>
          )}
        </div>
      )}

      {/* Danger Zone */}
      {isOwner && (
        <div className="border border-red-200 rounded-2xl p-4 bg-red-50">
          <p className="text-sm font-bold text-red-700 mb-1">Zona de peligro</p>
          <p className="text-xs text-red-500 mb-3">
            Esta acción es permanente e irreversible.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-white border border-red-300 text-red-600 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={16} /> Borrar partido
          </button>
        </div>
      )}

      {/* Disable guests confirmation modal */}
      {showGuestsConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-slate-800 mb-2">¿Desactivar invitados?</h2>
            <p className="text-sm text-slate-500 mb-6">
              {guestCount === 1
                ? "Hay 1 invitado en el partido. Será eliminado al desactivar esta opción."
                : `Hay ${guestCount} invitados en el partido. Serán eliminados al desactivar esta opción.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowGuestsConfirm(false)}
                disabled={togglingGuests}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setTogglingGuests(true);
                  try {
                    await onToggleAllowGuests(false);
                    setShowGuestsConfirm(false);
                  } finally {
                    setTogglingGuests(false);
                  }
                }}
                disabled={togglingGuests}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {togglingGuests ? "Eliminando..." : "Sí, desactivar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-slate-800 mb-2">¿Borrar partido?</h2>
            <p className="text-sm text-slate-500 mb-2">
              Esta acción es permanente. El partido y todos sus datos serán eliminados.
            </p>
            {(match.deposit ?? 0) > 0 && (
              <p className="text-sm text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-4">
                Los depósitos de los jugadores confirmados serán reembolsados automáticamente a sus billeteras.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Borrando..." : "Sí, borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
