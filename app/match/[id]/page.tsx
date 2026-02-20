"use client";

import { useEffect, useState } from "react";
import { buildWhatsAppReport } from "@/lib/matchReport";
import { useAuth } from "@/lib/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import {
  addPlayerToMatch,
  confirmAttendance,
  updatePlayerData,
  saveTeams,
  closeMatch,
  reopenMatch,
  unconfirmAttendance,
  deletePlayerFromMatch,
} from "@/lib/matches";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams, useRouter } from "next/navigation";
import { balanceTeams } from "@/lib/balanceTeams";
import { getAllUsers, getUserProfile } from "@/lib/users";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import { updatePlayerStats } from "@/lib/playerStats";
import type { Position, PlayerLevel } from "@/lib/domain/player";
import type { Player } from "@/lib/domain/player";
import type { Match } from "@/lib/domain/match";
import type { UserProfile } from "@/lib/domain/user";
import type { Location } from "@/lib/domain/location";
import { getTeamSummary } from "@/lib/domain/team";
import type { Guest } from "@/lib/domain/guest";
import { guestToPlayer } from "@/lib/domain/guest";
import { removeGuestFromMatch } from "@/lib/guests";

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [balanced, setBalanced] = useState<{ teamA: { players: Player[] }; teamB: { players: Player[] } } | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [selectedUid, setSelectedUid] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualLevel, setManualLevel] = useState(2);
  const [copied, setCopied] = useState(false);
  const [manualPositions, setManualPositions] = useState<string[]>([]);
  const [maxPlayersDraft, setMaxPlayersDraft] = useState<number | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [balancing, setBalancing] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [savingTeams, setSavingTeams] = useState(false);
  const [teamsSaved, setTeamsSaved] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copyingReport, setCopyingReport] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [guestLevels, setGuestLevels] = useState<Record<string, PlayerLevel>>({});


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );


  async function loadMatch() {
    const snap = await getDoc(doc(db, "matches", id));
    if (!snap.exists()) return;

    const data = snap.data() as Omit<Match, "id">;

    setMatch({ id: snap.id, ...data } as Match);
    setMaxPlayersDraft(
      typeof data.maxPlayers === "number" ? data.maxPlayers : null
    );
    if (data.teams?.A && data.teams?.B) {
      setBalanced({
        teamA: { players: data.teams.A },
        teamB: { players: data.teams.B },
      });
    }

  }
  async function handleBalance() {
    if (!match || confirmedCount < 4) return;

    setBalancing(true);

    const confirmed = match.players
      .filter((p: Player) => p.confirmed)
      .map((p: Player, i: number) => ({
        id: p.uid ?? `player-${i}`,
        uid: p.uid ?? undefined,
        name: p.name,
        level: p.level ?? 2,
        positions: p.positions ?? ["MID"],
        confirmed: p.confirmed,
      }));

    // Incluir invitados en el balanceo
    const guestPlayers = (match.guests ?? []).map((g: Guest) =>
      guestToPlayer(g, guestLevels[g.name] ?? 2)
    );

    const result = balanceTeams([...confirmed, ...guestPlayers]);

    setBalanced(result);

    await saveTeams(id, {
      A: result.teamA.players,
      B: result.teamB.players,
    });

    await loadMatch();

    setBalancing(false);
  }

  async function generateWhatsAppReport() {
    // Prefer local balanced state (reflects DnD changes) over match.teams (Firestore)
    const teamA = balanced?.teamA.players ?? match?.teams?.A ?? [];
    const teamB = balanced?.teamB.players ?? match?.teams?.B ?? [];

    if (teamA.length === 0 && teamB.length === 0) return;

    const scoreA = match?.score?.A ?? 0;
    const scoreB = match?.score?.B ?? 0;

    let text = `⚽ *La titular de hoy:*\n\n`;

    text += `🔴 *Equipo A*\n`;
    teamA.forEach((p: Player) => {
      text += `• ${p.name} \n`;
    });

    text += `\n🔵 *Equipo B*\n`;
    teamB.forEach((p: Player) => {
      text += `• ${p.name} \n`;
    });

    if (match?.status === "closed") {
      text += `\n🏆 *Resultado Final*\n`;
      text += `🔴 Equipo A ${scoreA} - ${scoreB} Equipo B 🔵\n`;
    }

    await navigator.clipboard.writeText(text);
  }

  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(profile => {
      setUserProfile(profile);
      setLoadingProfile(false);
    });
  }, [user]);

  useEffect(() => {
    if (!userProfile) return;
    loadMatch();
  }, [userProfile]);

  useEffect(() => {
    if (!match?.score) return;

    setScoreA(match.score.A ?? 0);
    setScoreB(match.score.B ?? 0);
  }, [match]);

  useEffect(() => {
    if (!match?.locationId) return;

    getDoc(doc(db, "locations", match.locationId))
      .then(snap => {
        if (snap.exists()) {
          setLocation({ id: snap.id, ...snap.data() } as Location);
        }
      });
  }, [match]);


  useEffect(() => {
    if (!match) return;
    const isOwner = user?.uid === match.createdBy;
    if (!isOwner) return;
    getAllUsers().then(setUsers);
  }, [match, user]);

  // Redirigir si no es admin
  useEffect(() => {
    if (!loadingProfile && userProfile && !userProfile.roles.includes("admin")) {
      router.push("/");
    }
  }, [loadingProfile, userProfile, router]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
        </div>
      </AuthGuard>
    );
  }

  if (!userProfile || !userProfile.roles.includes("admin")) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
        </div>
      </AuthGuard>
    );
  }

  if (!match) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
    </div>
  );

  const isOwner = user?.uid === match.createdBy;
  const isClosed = match.status === "closed";
  const existingPlayers = match.players ?? [];

  const availableUsers = users.filter(u => {
    const uidExists = existingPlayers.some(
      (p: Player) => p.uid && p.uid === u.uid
    );
    const nameExists = existingPlayers.some(
      (p: Player) =>
        typeof p.name === "string" &&
        typeof u.name === "string" &&
        p.name.trim().toLowerCase() === u.name.trim().toLowerCase()
    );
    return !uidExists && !nameExists;
  });

  const guestCount = match.guests?.length ?? 0;
  const confirmedCount = (match.players?.filter((p: Player) => p.confirmed).length ?? 0) + guestCount;
  const totalPlayers = (match.players?.length ?? 0) + guestCount;
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !balanced) return;

    const playerId = active.id as string;

    const fromA = balanced.teamA.players.find(
      (p: Player) => (p.id ?? p.name) === playerId
    );
    const fromB = balanced.teamB.players.find(
      (p: Player) => (p.id ?? p.name) === playerId
    );

    let newA = [...balanced.teamA.players];
    let newB = [...balanced.teamB.players];

    if (fromA) {
      newA = newA.filter(p => (p.id ?? p.name) !== playerId);
      newB.push(fromA);
    } else if (fromB) {
      newB = newB.filter(p => (p.id ?? p.name) !== playerId);
      newA.push(fromB);
    }

    setBalanced({
      teamA: { players: newA },
      teamB: { players: newB },
    });
  }


  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-3xl mx-auto p-4 md:p-6">

          {/* INFO PARTIDO */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  ⚽ Partido
                </h1>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${isClosed ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                  }`}>
                  {isClosed ? "Cerrado" : "Abierto"}
                </span>
              </div>

              {isOwner && !isClosed && (
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase">Máx Jugadores</span>
                  <input
                    type="number"
                    min={2}
                    value={maxPlayersDraft ?? ""}
                    onChange={e => setMaxPlayersDraft(Number(e.target.value))}
                    onBlur={async () => {
                      if (maxPlayersDraft === match.maxPlayers) return;
                      await updateDoc(doc(db, "matches", id), {
                        maxPlayers: maxPlayersDraft,
                      });
                      loadMatch();
                    }}
                    className="w-12 text-center font-bold bg-white border border-slate-200 rounded-lg py-1 focus:ring-2 focus:ring-[#1f7a4f] outline-none"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">📍</span>
                <span className="text-slate-600 font-medium">{location?.name || "Cargando cancha..."}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">📅</span>
                <span className="text-slate-600 font-medium">{formatDateSpanish(match.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">⏰</span>
                <span className="text-slate-600 font-medium">{formatTime12h(match.time)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <span className={`font-bold ${isFull ? "text-red-500" : "text-emerald-600"}`}>
                  {confirmedCount} / {match.maxPlayers} Confirmados
                  {isFull && " · COMPLETO"}
                </span>
              </div>
            </div>

            {isFull && !isClosed && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100 text-center">
                🚫 El partido está completo
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={`${window.location.origin}/join/${id}`}
                  readOnly
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono"
                />
                <span className="absolute left-3 top-3 text-slate-400">🔗</span>
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/join/${id}`
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className={`px-4 py-2 rounded-xl font-bold text-white transition-all ${copied ? "bg-[#16a34a]" : "bg-blue-600 hover:bg-blue-700"
                  }`}
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>


          {/* AGREGAR JUGADORES */}
          {isOwner && !isClosed && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                ➕ Agregar jugador
              </h3>

              <div className="flex gap-2 mb-6">
                <select
                  value={selectedUid}
                  onChange={e => setSelectedUid(e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1f7a4f] outline-none"
                >
                  <option value="">Seleccionar usuario registrado...</option>
                  {availableUsers.map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.name}
                    </option>
                  ))}
                </select>

                <button
                  disabled={!selectedUid || isFull}
                  onClick={async () => {
                    if (isFull) return;
                    const profile = await getUserProfile(selectedUid);
                    if (!profile) return;

                    await addPlayerToMatch(id, {
                      uid: selectedUid,
                      name: profile.name,
                      level: 2,
                      positions: profile.positions || [],
                    });

                    setSelectedUid("");
                    loadMatch();
                  }}
                  className="bg-[#1f7a4f] text-white font-bold py-2 px-6 rounded-xl disabled:opacity-50 hover:bg-[#16603c] transition-colors"
                >
                  Agregar
                </button>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Invitado Manual</h4>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      placeholder="Nombre invitado"
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1f7a4f]"
                    />
                    <select
                      value={manualLevel}
                      onChange={e => setManualLevel(Number(e.target.value))}
                      className="w-24 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1f7a4f]"
                    >
                      <option value={1}>Bajo (1)</option>
                      <option value={2}>Medio (2)</option>
                      <option value={3}>Alto (3)</option>
                    </select>
                  </div>

                  <div className="flex gap-4 flex-wrap">
                    {(["GK", "DEF", "MID", "FWD"] as Position[]).map(pos => (
                      <label key={pos} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={manualPositions.includes(pos)}
                          onChange={e => {
                            const updated = e.target.checked
                              ? [...manualPositions, pos]
                              : manualPositions.filter(p => p !== pos);
                            if (updated.length <= 2) setManualPositions(updated);
                          }}
                          className="w-4 h-4 text-[#1f7a4f] rounded focus:ring-[#1f7a4f]"
                        />
                        <span className="text-sm font-medium text-slate-600">{pos}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    disabled={!manualName || isFull}
                    onClick={async () => {
                      if (isFull) return;
                      await addPlayerToMatch(id, {
                        name: manualName,
                        level: manualLevel,
                        positions: manualPositions,
                      });
                      setManualName("");
                      setManualPositions([]);
                      setManualLevel(2);
                      loadMatch();
                    }}
                    className="mt-2 w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Agregar Invitado Manual
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* JUGADORES */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              👥 Jugadores
              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">{match.players?.length || 0}</span>
            </h3>

            <div className="divide-y divide-slate-100">
              {match.players?.map((p: Player, i: number) => (
                <div key={i} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${p.confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800">{p.name}</div>
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded-md inline-block ${p.confirmed ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        }`}>
                        {p.confirmed ? "Confirmado" : "Pendiente"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {!isClosed && (
                      <button
                        disabled={!p.confirmed && isFull}
                        onClick={async () => {
                          if (!p.confirmed && isFull) return;
                          p.confirmed
                            ? await unconfirmAttendance(id, p.name)
                            : await confirmAttendance(id, p.name);
                          loadMatch();
                        }}
                        className={`text-xs font-bold px-3 py-2 rounded-lg transition-colors ${p.confirmed
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          }`}
                      >
                        {p.confirmed ? "Cancelar" : "Confirmar"}
                      </button>
                    )}

                    {isOwner && !isClosed && (
                      <>
                        <button
                          onClick={async () => {
                            if (!confirm(`Eliminar a ${p.name}?`)) return;
                            await deletePlayerFromMatch(id, p.name);
                            loadMatch();
                          }}
                          className="text-xs font-bold px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                        >
                          Eliminar
                        </button>

                        <select
                          value={p.level ?? 2}
                          onChange={async e => {
                            await updatePlayerData(id, p.name, {
                              level: Number(e.target.value),
                            });
                            loadMatch();
                          }}
                          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none"
                        >
                          <option value={1}>Lvl 1</option>
                          <option value={2}>Lvl 2</option>
                          <option value={3}>Lvl 3</option>
                        </select>
                      </>
                    )}
                  </div>

                  {isOwner && !isClosed && (
                    <div className="flex gap-2 mt-2 md:mt-0 w-full md:w-auto">
                      {(["GK", "DEF", "MID", "FWD"] as Position[]).map(pos => (
                        <label key={pos} className={`flex-1 md:flex-none text-center cursor-pointer text-[10px] font-bold px-2 py-1 rounded border transition-all ${p.positions?.includes(pos)
                            ? "bg-blue-50 border-blue-200 text-blue-600"
                            : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300"
                          }`}>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={p.positions?.includes(pos) ?? false}
                            onChange={async e => {
                              const current = p.positions ?? [];
                              const updated = e.target.checked
                                ? [...current, pos]
                                : current.filter((x: Position) => x !== pos);
                              if (updated.length > 2) return;
                              await updatePlayerData(id, p.name, { positions: updated });
                              loadMatch();
                            }}
                          />
                          {pos}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* INVITADOS */}
            {(match.guests ?? []).length > 0 && (
              <div className="mt-8">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  🎟️ Invitados ({match.guests!.length})
                </h4>
                <div className="divide-y divide-slate-100">
                  {match.guests!.map((g: Guest, i: number) => {
                    const inviter = match.players?.find((p: Player) => p.uid === g.invitedBy);
                    return (
                      <div key={`guest-${i}`} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">
                            Inv
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-800">{g.name}</div>
                            <div className="text-xs text-slate-500">por {inviter?.name ?? "Desconocido"}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                            {g.positions?.join(", ") || "Sin posición"}
                          </span>

                          {isOwner && !isClosed && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Eliminar invitado ${g.name}?`)) return;
                                await removeGuestFromMatch(id, g.invitedBy);
                                loadMatch();
                              }}
                              className="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                            >
                              Eliminar
                            </button>
                          )}

                          {isOwner && !isClosed && (
                            <select
                              value={guestLevels[g.name] ?? 2}
                              onChange={e => {
                                setGuestLevels(prev => ({
                                  ...prev,
                                  [g.name]: Number(e.target.value) as PlayerLevel,
                                }));
                              }}
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
          </div>

          {/* BALANCEO */}
          {isOwner && !isClosed && (
            <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-500/20 p-5 mb-6">
              <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
                ⚖️ Balancear equipos
              </h3>

              <p className="text-sm text-emerald-700 mb-4 opacity-80">
                Se usarán los jugadores <strong>confirmados</strong> + <strong>invitados</strong>.<br />
                Total elegibles: <strong>{confirmedCount}</strong>
              </p>

              <button
                disabled={confirmedCount < 4}
                onClick={handleBalance}
                className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] ${confirmedCount < 4
                    ? "bg-slate-300 cursor-not-allowed shadow-none"
                    : "bg-[#16a34a] hover:bg-[#15803d]"
                  }`}
              >
                {balancing ? "⏳ Balanceando..." : "⚖️ Generar equipos"}
              </button>

              {confirmedCount < 4 && (
                <p className="text-xs text-red-500 mt-2 font-medium text-center">
                  Necesitas al menos 4 jugadores confirmados
                </p>
              )}
            </div>
          )}

          {/* RESULTADO BALANCEO */}
          {balanced && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
              <h3 className="font-bold text-slate-800 mb-4">⚖️ Balance de Equipos</h3>

              {(() => {
                const summaryA = getTeamSummary(balanced.teamA.players);
                const summaryB = getTeamSummary(balanced.teamB.players);

                const diffLevel = Math.abs(
                  summaryA.totalLevel - summaryB.totalLevel
                );

                return (
                  <>
                    {/* ================= RESUMEN GLOBAL ================= */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
                      <div className="text-center mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Diferencia de nivel</span>
                        <div className="text-2xl font-black text-slate-800">{diffLevel} pts</div>
                      </div>

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

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="flex flex-col md:flex-row gap-4">
                        {/* ================= EQUIPO A ================= */}
                        <div className="flex-1 bg-red-50 rounded-xl p-4 border border-red-100">
                          <h4 className="font-bold text-red-800 mb-2">🔴 Equipo A</h4>

                          <div className="text-xs text-red-600 mb-4 opacity-80 font-medium">
                            ⚡ <strong>{summaryA.totalLevel}</strong> pts · 👥 {summaryA.count}
                          </div>

                          <SortableContext
                            items={balanced.teamA.players.map(
                              (p: Player) => p.id ?? p.name
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {balanced.teamA.players.map((p: Player) => (
                                <PlayerItem
                                  key={p.id ?? p.name}
                                  id={p.id ?? p.name}
                                  name={p.name}
                                  details={`⚡${p.level} · ${(p.positions || []).join("/")}`}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </div>

                        {/* ================= EQUIPO B ================= */}
                        <div className="flex-1 bg-blue-50 rounded-xl p-4 border border-blue-100">
                          <h4 className="font-bold text-blue-800 mb-2">🔵 Equipo B</h4>

                          <div className="text-xs text-blue-600 mb-4 opacity-80 font-medium">
                            ⚡ <strong>{summaryB.totalLevel}</strong> pts · 👥 {summaryB.count}
                          </div>

                          <SortableContext
                            items={balanced.teamB.players.map(
                              (p: Player) => p.id ?? p.name
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {balanced.teamB.players.map((p: Player) => (
                                <PlayerItem
                                  key={p.id ?? p.name}
                                  id={p.id ?? p.name}
                                  name={p.name}
                                  details={`⚡${p.level} · ${(p.positions || []).join("/")}`}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </div>
                      </div>
                    </DndContext>

                    <button
                      disabled={savingTeams}
                      onClick={async () => {
                        setSavingTeams(true);
                        setTeamsSaved(false);

                        try {
                          await saveTeams(id, {
                            A: balanced.teamA.players,
                            B: balanced.teamB.players,
                          });

                          setTeamsSaved(true);

                          setTimeout(() => {
                            setTeamsSaved(false);
                          }, 2000);

                        } finally {
                          setSavingTeams(false);
                        }
                      }}
                      className={`mt-4 w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] ${teamsSaved
                          ? "bg-[#16a34a]"
                          : savingTeams
                            ? "bg-slate-400 cursor-not-allowed shadow-none"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                      {savingTeams
                        ? "⏳ Guardando cambios..."
                        : teamsSaved
                          ? "✅ Equipos guardados"
                          : "💾 Guardar cambios manuales"}
                    </button>
                    {match.teams && (
                      <button
                        disabled={copyingReport}
                        onClick={async () => {
                          setCopyingReport(true);
                          setCopiedReport(false);

                          try {
                            await generateWhatsAppReport();
                            setCopiedReport(true);

                            setTimeout(() => {
                              setCopiedReport(false);
                            }, 2000);

                          } finally {
                            setCopyingReport(false);
                          }
                        }}
                        className={`mt-3 w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] ${copiedReport
                            ? "bg-[#16a34a]"
                            : copyingReport
                              ? "bg-slate-400 cursor-not-allowed"
                              : "bg-[#25D366] hover:bg-[#20bd5a]"
                          }`}
                      >
                        {copyingReport
                          ? "⏳ Copiando reporte..."
                          : copiedReport
                            ? "✅ Reporte copiado"
                            : match.status === "closed"
                              ? "📲 Copiar reporte final"
                              : "📲 Copiar equipos balanceados"}
                      </button>
                    )}


                  </>
                );
              })()}
            </div>
          )}

          {isOwner && match.teams && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-6 text-center">
                {isClosed ? "🏆 Marcador final" : "🏆 Registrar marcador final"}
              </h3>

              {isClosed && (
                <div className="mb-4 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-bold border border-red-100 text-center">
                  🔒 El partido está cerrado. No se puede modificar el resultado.
                </div>
              )}

              <div className="flex items-center justify-center gap-6 mb-6">
                <div className="text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase mb-2">🔴 Equipo A</div>
                  <input
                    type="number"
                    min={0}
                    value={scoreA}
                    onChange={e => setScoreA(Number(e.target.value))}
                    disabled={isClosed}
                    className="w-20 h-20 text-4xl text-center font-black bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-100 outline-none transition-all disabled:opacity-50"
                  />
                </div>

                <div className="text-4xl text-slate-300 font-thin">—</div>

                <div className="text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase mb-2">🔵 Equipo B</div>
                  <input
                    type="number"
                    min={0}
                    value={scoreB}
                    onChange={e => setScoreB(Number(e.target.value))}
                    disabled={isClosed}
                    className="w-20 h-20 text-4xl text-center font-black bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {!isClosed && (
                <button
                  onClick={async () => {
                    if (!match?.teams) return;

                    setSavingScore(true);
                    setScoreSaved(false);

                    try {
                      await updateDoc(doc(db, "matches", id), {
                        score: {
                          A: scoreA,
                          B: scoreB,
                        },
                      });

                      await loadMatch();

                      setScoreSaved(true);
                      setTimeout(() => setScoreSaved(false), 2000);
                    } finally {
                      setSavingScore(false);
                    }
                  }}
                  disabled={savingScore}
                  className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] ${scoreSaved
                      ? "bg-[#16a34a]"
                      : savingScore
                        ? "bg-slate-400 cursor-not-allowed"
                        : "bg-[#1f7a4f] hover:bg-[#16603c]"
                    }`}
                >
                  {scoreSaved
                    ? "✅ Resultado guardado"
                    : savingScore
                      ? "⏳ Guardando resultado..."
                      : "💾 Guardar resultado"}
                </button>
              )}


            </div>
          )}

          {/* ESTADO PARTIDO */}
          <div className="mt-8 flex justify-center">
            {isOwner && !isClosed && (
              <button
                disabled={!match?.teams}
                onClick={async () => {
                  if (!match?.teams) return;
                  if (!confirm("¿Cerrar partido y procesar estadísticas?")) return;

                  try {
                    // 1️⃣ Traer versión fresca del match
                    const snap = await getDoc(doc(db, "matches", id));
                    if (!snap.exists()) return;

                    const freshMatch = snap.data();

                    if (!freshMatch?.teams?.A || !freshMatch?.teams?.B) {
                      alert("Primero debes balancear los equipos.");
                      return;
                    }

                    const teamA = freshMatch.teams.A;
                    const teamB = freshMatch.teams.B;

                    let previousResultA: "win" | "loss" | "draw" | undefined;
                    let previousResultB: "win" | "loss" | "draw" | undefined;

                    if (freshMatch.statsProcessed && freshMatch.previousScore) {
                      const prevA = freshMatch.previousScore.A ?? 0;
                      const prevB = freshMatch.previousScore.B ?? 0;

                      if (prevA > prevB) {
                        previousResultA = "win";
                        previousResultB = "loss";
                      } else if (prevB > prevA) {
                        previousResultA = "loss";
                        previousResultB = "win";
                      } else {
                        previousResultA = "draw";
                        previousResultB = "draw";
                      }
                    }

                    // 3️⃣ Guardar score + reporte
                    const report = buildWhatsAppReport({
                      ...freshMatch,
                      score: { A: scoreA, B: scoreB },
                    });

                    await updateDoc(doc(db, "matches", id), {
                      score: {
                        A: scoreA,
                        B: scoreB,
                      },
                      previousScore: freshMatch.score || { A: 0, B: 0 },
                      finalReport: report,
                      statsProcessed: true,
                    });

                    // 4️⃣ Actualizar stats según resultado (revirtiendo previos si existen)
                    if (scoreA > scoreB) {
                      await updatePlayerStats(teamA, "win", id, previousResultA);
                      await updatePlayerStats(teamB, "loss", id, previousResultB);
                    } else if (scoreB > scoreA) {
                      await updatePlayerStats(teamA, "loss", id, previousResultA);
                      await updatePlayerStats(teamB, "win", id, previousResultB);
                    } else {
                      await updatePlayerStats(teamA, "draw", id, previousResultA);
                      await updatePlayerStats(teamB, "draw", id, previousResultB);
                    }

                    // 5️⃣ Cerrar partido
                    await closeMatch(id);

                    await loadMatch();
                  } catch (error) {
                    console.error("Error cerrando partido:", error);
                  }
                }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-[0.98] ${!match?.teams
                    ? "bg-slate-400 cursor-not-allowed opacity-50"
                    : "bg-red-600 hover:bg-red-700"
                  }`}
              >
                🔒 Cerrar partido final
              </button>
            )}

            {isOwner && isClosed && (
              <button
                onClick={async () => {
                  if (confirm("¿Reabrir el partido?")) {
                    await reopenMatch(id);
                    loadMatch();
                  }
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-[#1f7a4f] text-white hover:bg-[#16603c] transition-all shadow-lg active:scale-[0.98]"
              >
                🔓 Reabrir partido
              </button>
            )}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}

function PlayerItem({ id, name, details }: { id: string; name: string, details: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 transition-colors ${isDragging ? "ring-2 ring-emerald-500 rotate-2" : ""}`}
    >
      <div className="font-bold text-sm text-slate-800">{name}</div>
      <div className="text-[10px] text-slate-500 font-medium">{details}</div>
    </div>
  );
}
