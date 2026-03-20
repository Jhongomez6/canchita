"use client";

import { useState } from "react";
import Image from "next/image";
import type { Match, MatchPhase } from "@/lib/domain/match";
import type { Player, Position, PlayerLevel, AttendanceStatus } from "@/lib/domain/player";
import { POSITION_ICONS } from "@/lib/domain/player";
import type { Guest } from "@/lib/domain/guest";
import { guestToPlayer } from "@/lib/domain/guest";
import type { UserProfile } from "@/lib/domain/user";
import PlayerRow from "./PlayerRow";
import AttendanceMode from "./AttendanceMode";

interface PlayersTabProps {
  match: Match;
  isOwner: boolean;
  isClosed: boolean;
  isFull: boolean;
  confirmedCount: number;
  phase: MatchPhase;
  availableUsers: UserProfile[];
  guestLevels: Record<string, PlayerLevel>;
  onGuestLevelChange: (name: string, level: PlayerLevel) => void;
  // Actions
  onAddRegisteredPlayer: (uid: string) => Promise<void>;
  onAddManualPlayer: (name: string, level: number, positions: string[]) => Promise<void>;
  onConfirmAttendance: (name: string) => Promise<void>;
  onUnconfirmAttendance: (name: string) => Promise<void>;
  onDeletePlayer: (name: string) => Promise<void>;
  onUpdatePlayerData: (name: string, data: { level?: number; positions?: Position[] }) => Promise<void>;
  onMarkAttendance: (uid: string, status: AttendanceStatus) => Promise<void>;
  onMarkAllPresent: () => Promise<void>;
  onApproveFromWaitlist: (name: string) => Promise<void>;
  onRemoveGuest: (invitedBy: string, name: string) => Promise<void>;
  onPromoteGuest: (name: string, invitedBy: string) => Promise<void>;
}

export default function PlayersTab({
  match,
  isOwner,
  isClosed,
  isFull,
  confirmedCount,
  phase,
  availableUsers,
  guestLevels,
  onGuestLevelChange,
  onAddRegisteredPlayer,
  onAddManualPlayer,
  onConfirmAttendance,
  onUnconfirmAttendance,
  onDeletePlayer,
  onUpdatePlayerData,
  onMarkAttendance,
  onMarkAllPresent,
  onApproveFromWaitlist,
  onRemoveGuest,
  onPromoteGuest,
}: PlayersTabProps) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [addingUid, setAddingUid] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualLevel, setManualLevel] = useState(2);
  const [manualPositions, setManualPositions] = useState<string[]>([]);

  const players = match.players?.filter((p: Player) => !p.isWaitlist) || [];
  const confirmedPlayers = players.filter((p: Player) => p.confirmed);
  const pendingPlayers = players.filter((p: Player) => !p.confirmed);
  const guests = match.guests?.filter((g: Guest) => !g.isWaitlist) || [];

  // Waitlist
  const waitlistPlayers: Player[] = [
    ...(match.players?.filter((p: Player) => p.isWaitlist && !p.confirmed) || []),
    ...(match.guests
      ?.filter((g: Guest) => g.isWaitlist && !g.confirmed)
      .map((g: Guest) => guestToPlayer(g, 2)) || []),
  ].sort((a: Player, b: Player) => {
    const tA = a.waitlistJoinedAt ? new Date(a.waitlistJoinedAt).getTime() : 0;
    const tB = b.waitlistJoinedAt ? new Date(b.waitlistJoinedAt).getTime() : 0;
    return tA - tB;
  });

  // Attendance mode
  if (attendanceMode) {
    return (
      <div role="tabpanel" id="panel-players" className="animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <AttendanceMode
            players={match.players || []}
            onMarkAttendance={onMarkAttendance}
            onMarkAllPresent={onMarkAllPresent}
            onExit={() => setAttendanceMode(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div role="tabpanel" id="panel-players" className="space-y-4 animate-in fade-in duration-200">
      {/* Summary Bar */}
      <div className="flex gap-2 text-xs font-bold">
        <span className="flex-1 text-center bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg py-2">
          ✅ {confirmedPlayers.length} Confirmados
        </span>
        {pendingPlayers.length > 0 && (
          <span className="flex-1 text-center bg-amber-50 text-amber-600 border border-amber-100 rounded-lg py-2">
            ⏳ {pendingPlayers.length} Pendientes
          </span>
        )}
        {guests.length > 0 && (
          <span className="flex-1 text-center bg-violet-50 text-violet-600 border border-violet-100 rounded-lg py-2">
            🎟️ {guests.length} {guests.length === 1 ? "Invitado" : "Invitados"}
          </span>
        )}
        {waitlistPlayers.length > 0 && (
          <span className="flex-1 text-center bg-slate-50 text-slate-600 border border-slate-100 rounded-lg py-2">
            📋 {waitlistPlayers.length} Espera
          </span>
        )}
      </div>

      {/* Attendance Mode Button (game day) */}
      {isOwner && (phase === "gameday" || phase === "full") && !isClosed && (
        <button
          onClick={() => setAttendanceMode(true)}
          className="w-full py-3 bg-emerald-50 border border-emerald-200 rounded-xl font-bold text-emerald-700 flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
        >
          📋 Pasar Lista
        </button>
      )}

      {/* Add Player (Collapsible) */}
      {isOwner && !isClosed && (
        <div>
          {!isAddPlayerOpen ? (
            <button
              onClick={() => setIsAddPlayerOpen(true)}
              className="w-full py-3 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                +
              </span>
              Agregar Jugador o Invitado
            </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  ➕ Agregar jugador
                </h3>
                <button
                  onClick={() => setIsAddPlayerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>

              {/* Searchable registered user list */}
              <div className="mb-6">
                <div className="relative mb-3">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar jugador por nombre..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1f7a4f] outline-none text-base"
                    autoFocus
                  />
                </div>

                {(() => {
                  const query = searchQuery.trim().toLowerCase();
                  const filtered = query
                    ? availableUsers.filter((u) =>
                        (u.name || "").toLowerCase().includes(query)
                      )
                    : availableUsers;

                  if (filtered.length === 0 && query) {
                    return (
                      <p className="text-sm text-slate-400 text-center py-4">
                        No se encontraron jugadores con &quot;{searchQuery}&quot;
                      </p>
                    );
                  }

                  return (
                    <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-xl">
                      {filtered.slice(0, 20).map((u) => {
                        const isAdding = addingUid === u.uid;
                        const posLabel = u.positions?.length
                          ? u.positions
                              .map((p) => POSITION_ICONS[p as Position] || p)
                              .join(" ")
                          : "";
                        const levelLabel =
                          u.level === 1
                            ? "Bajo"
                            : u.level === 3
                              ? "Alto"
                              : "Medio";

                        return (
                          <button
                            key={u.uid}
                            disabled={isFull || isAdding}
                            onClick={async () => {
                              if (isFull) return;
                              setAddingUid(u.uid);
                              try {
                                await onAddRegisteredPlayer(u.uid);
                                setSearchQuery("");
                                setIsAddPlayerOpen(false);
                              } finally {
                                setAddingUid(null);
                              }
                            }}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/50 transition-all active:scale-[0.98] disabled:opacity-50 text-left"
                          >
                            {/* Photo */}
                            <div className="shrink-0">
                              {u.photoURL ? (
                                <div className="w-9 h-9 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                                  <Image
                                    src={u.photoURL}
                                    alt={u.name}
                                    fill
                                    className="object-cover"
                                    sizes="36px"
                                  />
                                </div>
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-slate-500">
                                  {(u.name || "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-slate-800 truncate">
                                {u.name || "Sin nombre"}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                {posLabel && <span>{posLabel}</span>}
                                <span className="text-slate-300">·</span>
                                <span>Lvl {u.level ?? 2} ({levelLabel})</span>
                              </div>
                            </div>

                            {/* Add indicator */}
                            <span className="shrink-0 text-xs font-bold text-emerald-600">
                              {isAdding ? "⏳" : "+"}
                            </span>
                          </button>
                        );
                      })}
                      {filtered.length > 20 && (
                        <p className="text-[10px] text-slate-400 text-center py-2">
                          Mostrando 20 de {filtered.length} — escribe para filtrar
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Manual guest */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                  Invitado Manual
                </h4>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      placeholder="Nombre invitado"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1f7a4f]"
                    />
                    <select
                      value={manualLevel}
                      onChange={(e) => setManualLevel(Number(e.target.value))}
                      className="w-24 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1f7a4f]"
                    >
                      <option value={1}>Bajo (1)</option>
                      <option value={2}>Medio (2)</option>
                      <option value={3}>Alto (3)</option>
                    </select>
                  </div>

                  <div className="flex gap-4 flex-wrap">
                    {(["GK", "DEF", "MID", "FWD"] as Position[]).map((pos) => (
                      <label key={pos} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={manualPositions.includes(pos)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...manualPositions, pos]
                              : manualPositions.filter((p) => p !== pos);
                            if (updated.length <= 2) setManualPositions(updated);
                          }}
                          className="w-4 h-4 text-[#1f7a4f] rounded focus:ring-[#1f7a4f]"
                        />
                        <span className="text-sm font-medium text-slate-600">{pos}</span>
                      </label>
                    ))}
                  </div>

                  {manualName && manualPositions.length === 0 && (
                    <p className="text-xs text-red-500 font-medium">
                      Selecciona al menos 1 posición
                    </p>
                  )}

                  <button
                    disabled={!manualName || manualPositions.length === 0 || isFull}
                    onClick={async () => {
                      if (isFull) return;
                      await onAddManualPlayer(manualName, manualLevel, manualPositions);
                      setManualName("");
                      setManualPositions([]);
                      setManualLevel(2);
                      setIsAddPlayerOpen(false);
                    }}
                    className="mt-2 w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Agregar Invitado Manual
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Players List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          👥 Jugadores
          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
            {players.length}
          </span>
        </h3>

        <div className="divide-y divide-slate-100">
          {players.map((p: Player, i: number) => (
            <PlayerRow
              key={p.uid || `player-${i}`}
              player={p}
              isOwner={isOwner}
              isClosed={isClosed}
              isFull={isFull}
              isExpanded={expandedPlayerId === (p.uid || p.name)}
              onToggleExpand={() =>
                setExpandedPlayerId(
                  expandedPlayerId === (p.uid || p.name) ? null : (p.uid || p.name)
                )
              }
              onConfirm={() => onConfirmAttendance(p.name)}
              onUnconfirm={() => onUnconfirmAttendance(p.name)}
              onDelete={() => {
                if (confirm(`Eliminar a ${p.name}?`)) onDeletePlayer(p.name);
              }}
              onUpdateLevel={(level) => onUpdatePlayerData(p.name, { level })}
              onUpdatePositions={(positions) => onUpdatePlayerData(p.name, { positions })}
              onMarkAttendance={(status) => p.uid ? onMarkAttendance(p.uid, status) : Promise.resolve()}
            />
          ))}
        </div>

        {/* Guests */}
        {guests.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              🎟️ Invitados ({guests.length})
            </h4>
            <div className="divide-y divide-slate-100">
              {guests.map((g: Guest, i: number) => {
                const inviter = match.players?.find((p: Player) => p.uid === g.invitedBy);
                return (
                  <div
                    key={`guest-${i}`}
                    className="py-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold shrink-0 relative shadow-sm">
                        Inv
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-purple-50 z-10">
                          {POSITION_ICONS[g.primaryPosition || (g.positions?.[0] as Position) || "MID"]}
                        </div>
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-800">{g.name}</div>
                        <div className="text-xs text-slate-500">
                          por {inviter?.name ?? "Admin"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                        {g.positions?.join(", ") || "Sin posición"}
                      </span>

                      {isOwner && !isClosed && (
                        <button
                          onClick={() => {
                            if (confirm(`Eliminar invitado ${g.name}?`))
                              onRemoveGuest(g.invitedBy, g.name);
                          }}
                          className="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      )}

                      {isOwner && !isClosed && (
                        <select
                          value={guestLevels[g.name] ?? 2}
                          onChange={(e) =>
                            onGuestLevelChange(g.name, Number(e.target.value) as PlayerLevel)
                          }
                          className="text-xs bg-slate-50 border border-slate-200 rounded px-1 py-1 outline-none"
                        >
                          <option value={1}>Lvl 1</option>
                          <option value={2}>Lvl 2</option>
                          <option value={3}>Lvl 3</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Waitlist */}
        {!isClosed && waitlistPlayers.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
              📋 Lista de Espera ({waitlistPlayers.length})
            </h4>
            <div className="divide-y divide-slate-100">
              {waitlistPlayers.map((p: Player, i: number) => {
                const isGuest = p.id?.startsWith("guest-");
                let guestInviterUid = "";
                let rawGuestName = "";
                let guestHostName = "";
                if (isGuest && p.id) {
                  guestInviterUid = p.id.split("-")[1];
                  rawGuestName = p.name.replace(" (inv)", "");
                  guestHostName =
                    match.players?.find((player) => player.uid === guestInviterUid)?.name || "";
                }

                return (
                  <div
                    key={`wl-${i}`}
                    className="py-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        {p.photoURL ? (
                          <div className="w-8 h-8 rounded-full overflow-hidden relative border border-slate-200 shadow-sm ring-1 ring-amber-200">
                            <Image
                              src={p.photoURL}
                              alt={p.name}
                              fill
                              className="object-cover"
                              sizes="32px"
                            />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-bold ring-1 ring-amber-200">
                            #{i + 1}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center text-[10px] shadow-sm border border-amber-100 z-10">
                          {POSITION_ICONS[p.primaryPosition || (p.positions?.[0] as Position) || "MID"]}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 text-sm">{p.name}</span>
                        {isGuest && guestHostName && (
                          <span className="text-[10px] text-slate-400">
                            Invitado de {guestHostName}
                          </span>
                        )}
                        {isOwner && p.phone && (
                          <a
                            href={`tel:+57${p.phone}`}
                            className="text-[10px] font-medium text-amber-600 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            📞 +57 {p.phone}
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 uppercase tracking-widest">
                        En espera
                      </span>

                      {isOwner && !isClosed && (
                        <>
                          <button
                            onClick={async () => {
                              if (isGuest) {
                                await onPromoteGuest(rawGuestName, guestInviterUid);
                              } else {
                                await onApproveFromWaitlist(p.name);
                              }
                            }}
                            className="text-xs font-bold px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"
                          >
                            Aceptar
                          </button>

                          <button
                            onClick={() => {
                              if (!confirm(`¿Eliminar a ${p.name} de la lista de espera?`)) return;
                              if (isGuest) {
                                onRemoveGuest(guestInviterUid, rawGuestName);
                              } else {
                                onDeletePlayer(p.name);
                              }
                            }}
                            className="text-xs font-bold px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
