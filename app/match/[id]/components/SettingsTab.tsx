"use client";

import { useState } from "react";
import Link from "next/link";
import type { Match, MatchDuration } from "@/lib/domain/match";
import { formatDuration } from "@/lib/date";

interface SettingsTabProps {
  match: Match;
  isOwner: boolean;
  isClosed: boolean;
  hasUnsavedBalance: boolean;
  maxPlayersDraft: number | null;
  // Actions
  onUpdateMaxPlayers: (value: number) => Promise<void>;
  onUpdateDuration: (value: MatchDuration) => Promise<void>;
  onSendReminder: () => Promise<void>;
  onCopyLink: () => Promise<void>;
  onCopyCode: () => Promise<void>;
  onCopyInvitation: () => Promise<void>;
  getInvitationText: () => string;
  getInvitationTextTelegram: () => string;
  onCopyReport: () => Promise<void>;
  getReportText: () => string;
  onCloseMatch: () => Promise<void>;
  onReopenMatch: () => Promise<void>;
  onDeleteMatch: () => Promise<void>;
  onToggleAllowGuests: (value: boolean) => Promise<void>;
}

export default function SettingsTab({
  match,
  isOwner,
  isClosed,
  hasUnsavedBalance,
  maxPlayersDraft,
  onUpdateMaxPlayers,
  onUpdateDuration,
  onSendReminder,
  onCopyLink,
  onCopyCode,
  onCopyInvitation,
  getInvitationText,
  getInvitationTextTelegram,
  onCopyReport,
  getReportText,
  onCloseMatch,
  onReopenMatch,
  onDeleteMatch,
  onToggleAllowGuests,
}: SettingsTabProps) {
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInvitation, setCopiedInvitation] = useState(false);
  const [copyingInvitation, setCopyingInvitation] = useState(false);
  const [copyingReport, setCopyingReport] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGuestsConfirm, setShowGuestsConfirm] = useState(false);
  const [togglingGuests, setTogglingGuests] = useState(false);
  const [localMaxPlayers, setLocalMaxPlayers] = useState(maxPlayersDraft);

  const currentMax = localMaxPlayers ?? match.maxPlayers ?? 14;
  const guestCount = match.guests?.length ?? 0;

  async function handleCopyLink() {
    await onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleCopyCode() {
    await onCopyCode();
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }

  async function handleCopyInvitation() {
    setCopyingInvitation(true);
    setCopiedInvitation(false);
    try {
      await onCopyInvitation();
      setCopiedInvitation(true);
      setTimeout(() => setCopiedInvitation(false), 2000);
    } finally {
      setCopyingInvitation(false);
    }
  }

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
      {/* Sharing Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          📤 Compartir
        </h3>

        <div className="flex flex-col gap-3">
          {/* Match link */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/join/${match.id}`}
                readOnly
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono"
              />
              <span className="absolute left-3 top-3 text-slate-400">🔗</span>
            </div>
            <button
              onClick={handleCopyLink}
              className={`px-4 py-2 rounded-xl font-bold text-white transition-all ${
                copied ? "bg-[#16a34a]" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>

          {/* Match code */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={match.id}
                readOnly
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono font-bold tracking-wider"
              />
              <span className="absolute left-3 top-3 text-slate-400">🔐</span>
            </div>
            <button
              onClick={handleCopyCode}
              className={`px-4 py-2 rounded-xl font-bold text-white transition-all ${
                copiedCode ? "bg-[#16a34a]" : "bg-slate-700 hover:bg-slate-800"
              }`}
            >
              {copiedCode ? "Copiado" : "Copiar"}
            </button>
          </div>

          {/* Invitation sharing / Report sharing */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-lg">📲</span>
              <p className="text-sm font-bold text-slate-700">
                {isClosed ? "Compartir reporte final" : "Invitar jugadores"}
              </p>
            </div>
            <div className="flex gap-2">
              {isClosed ? (
                <>
                  <button
                    disabled={copyingReport}
                    onClick={async () => {
                      setCopyingReport(true);
                      setCopiedReport(false);
                      try {
                        await onCopyReport();
                        setCopiedReport(true);
                        setTimeout(() => setCopiedReport(false), 2000);
                      } finally {
                        setCopyingReport(false);
                      }
                    }}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 disabled:opacity-50 ${
                      copiedReport
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 shadow-sm"
                    }`}
                  >
                    <span className="text-lg">{copyingReport ? "⏳" : copiedReport ? "✅" : "📋"}</span>
                    {copiedReport ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    onClick={() => {
                      const text = getReportText();
                      if (text) window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 shadow-sm"
                  >
                    <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-5 h-5" />
                    WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      const text = getReportText();
                      if (text) window.open(`https://t.me/share/url?url=%20&text=${encodeURIComponent(text.replace(/\*/g, ""))}`, "_blank");
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 shadow-sm"
                  >
                    <img src="/icons/telegram.svg" alt="Telegram" className="w-5 h-5" />
                    Telegram
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCopyInvitation}
                    disabled={copyingInvitation}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 ${
                      copiedInvitation
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 shadow-sm"
                    }`}
                  >
                    <span className="text-lg">{copiedInvitation ? "✅" : "📋"}</span>
                    {copiedInvitation ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    onClick={() => {
                      const text = getInvitationText();
                      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 shadow-sm"
                  >
                    <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-5 h-5" />
                    WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      const text = getInvitationTextTelegram();
                      window.open(`https://t.me/share/url?url=%20&text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 shadow-sm"
                  >
                    <img src="/icons/telegram.svg" alt="Telegram" className="w-5 h-5" />
                    Telegram
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Match Config */}
      {isOwner && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            🎛️ Configuración
          </h3>

          <div className="space-y-4">
            {/* Max players */}
            {!isClosed && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎟️</span>
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
                    className="w-12 text-center font-bold text-sm py-1 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  <span className="text-lg">⏱️</span>
                  <span className="text-slate-600 font-medium text-sm">Duración</span>
                </div>
                <select
                  value={match.duration ?? ""}
                  onChange={async (e) => {
                    const val = Number(e.target.value) as MatchDuration;
                    await onUpdateDuration(val);
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]"
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
                  <span className="text-lg">👥</span>
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
              👁️ Ver como jugador
            </Link>
          </div>
        </div>
      )}

      {/* Notifications */}
      {isOwner && !isClosed && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            🔔 Notificaciones
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Envía una notificación push a todos los jugadores confirmados y pendientes que tengan activadas las notificaciones en su dispositivo.
          </p>
          <button
            onClick={handleSendReminder}
            disabled={sendingReminder}
            className="w-full py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            <span className="text-xl">{sendingReminder ? "⏳" : "🔔"}</span>
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
            🔄 Estado del partido
          </h3>

          {!isClosed && (
            <button
              disabled={!match.teams || isClosing}
              onClick={async () => {
                if (!match.teams || isClosing) return;
                if (!confirm("¿Cerrar partido y procesar estadísticas?")) return;
                if (hasUnsavedBalance) {
                  return; // Parent will show toast
                }
                setIsClosing(true);
                try {
                  await onCloseMatch();
                } finally {
                  setIsClosing(false);
                }
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-[0.98] ${
                !match.teams || isClosing
                  ? "bg-slate-400 cursor-not-allowed opacity-50 shadow-none"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isClosing ? "⏳ Cerrando partido..." : "🔒 Cerrar partido final"}
            </button>
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
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-[0.98] ${
                isReopening
                  ? "bg-slate-400 cursor-not-allowed opacity-50 shadow-none"
                  : "bg-[#1f7a4f] hover:bg-[#16603c]"
              }`}
            >
              {isReopening ? "⏳ Reabriendo..." : "🔓 Reabrir partido"}
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
            🗑️ Borrar partido
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
            <p className="text-sm text-slate-500 mb-6">
              Esta acción es permanente. El partido y todos sus datos serán eliminados.
            </p>
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
