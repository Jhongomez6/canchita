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
  markPlayerAttendance,
  approveFromWaitlist,
} from "@/lib/matches";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams, useRouter } from "next/navigation";
import { balanceTeams } from "@/lib/balanceTeams";
import { calculateMvpStatus } from "@/lib/mvp";
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
import { getTeamSummary, sortTeamForDisplay } from "@/lib/domain/team";
import type { Guest } from "@/lib/domain/guest";
import { guestToPlayer } from "@/lib/domain/guest";
import { removeGuestFromMatch } from "@/lib/guests";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

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
  const [copiedCode, setCopiedCode] = useState(false);
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
  const [hasUnsavedBalance, setHasUnsavedBalance] = useState(false);
  const [guestLevels, setGuestLevels] = useState<Record<string, PlayerLevel>>({});
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [copyingInvitation, setCopyingInvitation] = useState(false);
  const [copiedInvitation, setCopiedInvitation] = useState(false);

  async function handleManualReminder() {
    if (!confirm("¿Seguro que quieres enviar una notificación Push a todos los jugadores registrados (confirmados y pendientes)?")) return;
    setSendingReminder(true);
    try {
      const { requestManualReminder } = await import("@/lib/push");
      const res = await requestManualReminder(id);
      toast.success(`Recordatorios enviados a ${res.sentTokens} dispositivos activos.`);
    } catch (err: unknown) {
      handleError(err, "Hubo un error al desencadenar las notificaciones Manuales.");
    } finally {
      setSendingReminder(false);
    }
  }

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

    // Clean undefined values to prevent Firebase errors
    const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

    try {
      await saveTeams(id, {
        A: cleanObject(result.teamA.players),
        B: cleanObject(result.teamB.players),
      });

      await loadMatch();
      toast.success("Equipos balanceados y guardados");
    } catch (err: unknown) {
      handleError(err, "Hubo un error balanceando los equipos.");
    } finally {
      setBalancing(false);
    }
  }

  async function generateWhatsAppReport() {
    // Prefer local balanced state (reflects DnD changes) over match.teams (Firestore)
    const teamA = balanced?.teamA.players ?? match?.teams?.A ?? [];
    const teamB = balanced?.teamB.players ?? match?.teams?.B ?? [];

    if (teamA.length === 0 && teamB.length === 0) return;

    const scoreA = match?.score?.A ?? 0;
    const scoreB = match?.score?.B ?? 0;

    let text = match?.status === "closed"
      ? `📋 *Resumen del partido de hoy:*\n`
      : `⚽ *La titular de hoy:*\n`;

    text += `📅 ${formatDateSpanish(match?.date || "")}\n\n`;

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

      // MVP Calculation
      if (match.mvpVotes) {
        const { votingClosed, topMvpScore, winnerNames } = calculateMvpStatus(match);

        if (votingClosed && topMvpScore > 0 && winnerNames.length > 0) {
          const title = winnerNames.length > 1 ? "MVPs del Partido" : "MVP del Partido";
          text += `\n⭐ *${title}*\n`;
          text += `👑 ${winnerNames.join(", ")} (${topMvpScore} ${topMvpScore === 1 ? 'voto' : 'votos'})\n`;
        }
      }
    }

    await navigator.clipboard.writeText(text);
  }

  async function generateMatchInvitation() {
    if (!match) return;

    const shareUrl = `${window.location.origin}/join/${id}`;
    const text = `⚽ *¡NUEVO PARTIDO EN LA CANCHITA!* 🏟️\n\n` +
      `📅 *Día:* ${formatDateSpanish(match.date)}\n` +
      `⏰ *Hora:* ${formatTime12h(match.time)}\n` +
      `📍 *Lugar:* ${location?.name || match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
      `🔑 *Código de búsqueda:* ${id}.ai\n` +
      `_(Copia el código y pégalo en la pantalla inicial o en "Buscar" para entrar al partido)_\n\n` +
      `🔗 *Link de invitación:* ${shareUrl}\n`;

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

  // MVP Calculation
  const voteCounts: Record<string, number> = {};
  if (match.mvpVotes) {
    Object.values(match.mvpVotes).forEach((votedId) => {
      voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    });
  }

  const sortedMVPLeaderboard = Object.entries(voteCounts)
    .sort(([, a], [, b]) => b - a);

  const topMvpScore = sortedMVPLeaderboard.length > 0 ? sortedMVPLeaderboard[0][1] : 0;

  const currentMVPs = sortedMVPLeaderboard
    .filter(([, score]) => score === topMvpScore && score > 0)
    .map(([id]) => id);

  // 5h Voting Window Validation
  const closedTime = match.closedAt ? new Date(match.closedAt).getTime() : 0;
  const now = new Date().getTime();
  const hoursSinceClosed = closedTime ? (now - closedTime) / (1000 * 60 * 60) : 0;
  const timeLimitClosed = hoursSinceClosed > 5;

  // Strict Mathematical Consensus Validation based on unique physical accounts
  const eligibleUIDs = new Set(
    match.players?.filter((p: Player) => p.confirmed && p.uid && !p.uid.startsWith("guest_")).map((p: Player) => p.uid) || []
  );
  if (match.createdBy) eligibleUIDs.add(match.createdBy);

  const totalEligibleVoters = eligibleUIDs.size;
  const votesCast = match.mvpVotes ? Object.keys(match.mvpVotes).filter(uid => eligibleUIDs.has(uid)).length : 0;
  const remainingVotes = totalEligibleVoters - votesCast;

  const secondHighestScore = sortedMVPLeaderboard.length > 1 ? sortedMVPLeaderboard[1][1] : 0;

  const mathematicallyClosed = (topMvpScore > 0) && (topMvpScore > secondHighestScore + remainingVotes);
  const allEligibleVoted = totalEligibleVoters > 0 && remainingVotes <= 0;
  const earlyClosure = mathematicallyClosed || allEligibleVoted;

  const votingClosed = isClosed && (timeLimitClosed || earlyClosure);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !balanced) return;

    const playerId = active.id as string;

    const fromA = balanced.teamA.players.find(
      (p: Player) => (p.id || p.uid || p.name) === playerId
    );
    const fromB = balanced.teamB.players.find(
      (p: Player) => (p.id || p.uid || p.name) === playerId
    );

    let newA = [...balanced.teamA.players];
    let newB = [...balanced.teamB.players];

    if (fromA) {
      newA = newA.filter(p => (p.id || p.uid || p.name) !== playerId);
      newB.push(fromA);
    } else if (fromB) {
      newB = newB.filter(p => (p.id || p.uid || p.name) !== playerId);
      newA.push(fromB);
    }

    setHasUnsavedBalance(true);
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
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${isClosed ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                    }`}>
                    {isClosed ? "Cerrado" : "Abierto"}
                  </span>
                  {match.isPrivate && (
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                      🔒 Privado
                    </span>
                  )}
                  <a
                    href={`/join/${id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors ml-1"
                  >
                    <span>👁️</span> Ver como jugador
                  </a>
                </div>
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

              {isClosed && match.closedAt && (
                <div className="flex items-center gap-3 bg-red-50 p-2 rounded-lg border border-red-100 mt-2">
                  <span className="text-lg">🔒</span>
                  <span className="text-red-700 font-bold text-sm">
                    Cerrado a las {new Date(match.closedAt).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-3">
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

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex gap-2">
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

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={id}
                    readOnly
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono font-bold tracking-wider"
                  />
                  <span className="absolute left-3 top-3 text-slate-400">🔐</span>
                </div>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(id);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1500);
                  }}
                  className={`px-4 py-2 rounded-xl font-bold text-white transition-all ${copiedCode ? "bg-[#16a34a]" : "bg-slate-700 hover:bg-slate-800"
                    }`}
                >
                  {copiedCode ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            <button
              onClick={async () => {
                setCopyingInvitation(true);
                setCopiedInvitation(false);
                try {
                  await generateMatchInvitation();
                  setCopiedInvitation(true);
                  toast.success("Invitación completa copiada");
                  setTimeout(() => setCopiedInvitation(false), 2000);
                } catch (err) {
                  handleError(err, "Error al copiar invitación");
                } finally {
                  setCopyingInvitation(false);
                }
              }}
              disabled={copyingInvitation}
              className={`w-full mt-4 py-3 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 ${copiedInvitation
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm"
                }`}
            >
              <span className="text-xl">{copiedInvitation ? "✅" : "📲"}</span>
              {copiedInvitation ? "¡Invitación lista para WhatsApp!" : "Copiar invitación para WhatsApp"}
            </button>
          </div>

          {/* ACCIONES DEL ADMIN */}
          {isOwner && !isClosed && (
            <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <button
                onClick={handleManualReminder}
                disabled={sendingReminder}
                className="w-full py-3 mb-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm text-amber-700 font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <span className="text-xl">{sendingReminder ? "⏳" : "🔔"}</span>
                {sendingReminder ? "Despachando notificaciones..." : "Enviar Recordatorio (Push)"}
              </button>
            </div>
          )}

          {/* AGREGAR JUGADORES (Collapsible) */}
          {isOwner && !isClosed && (
            <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
              {!isAddPlayerOpen ? (
                <button
                  onClick={() => setIsAddPlayerOpen(true)}
                  className="w-full py-3 bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-600 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
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
                        try {
                          const profile = await getUserProfile(selectedUid);
                          if (!profile) return;

                          await addPlayerToMatch(id, {
                            uid: selectedUid,
                            name: profile.name,
                            level: 2,
                            positions: profile.positions || [],
                          });

                          setSelectedUid("");
                          setIsAddPlayerOpen(false);
                          loadMatch();
                          toast.success("Jugador agregado!");
                        } catch (err: unknown) {
                          handleError(err, "Hubo un error al agregar al jugador.");
                        }
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
                            uid: `guest_${manualName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                            name: manualName,
                            level: manualLevel,
                            positions: manualPositions,
                          });
                          setManualName("");
                          setManualPositions([]);
                          setManualLevel(2);
                          setIsAddPlayerOpen(false);
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
            </div>
          )}

          {/* JUGADORES */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              👥 Jugadores
              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">{match.players?.filter((p: Player) => !p.isWaitlist).length || 0}</span>
            </h3>

            <div className="divide-y divide-slate-100">
              {match.players?.filter((p: Player) => !p.isWaitlist).map((p: Player, i: number) => (
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

                  {/* ATTENDANCE CONTROLS (Admin Only) */}
                  {isOwner && (
                    <div className="flex gap-1 mt-2 md:mt-0">
                      {[
                        { status: "present", icon: "✅", label: "Presente" },
                        { status: "late", icon: "⏰", label: "Tarde" },
                        { status: "no_show", icon: "🚫", label: "No Show" },
                      ].map((opt) => (
                        <button
                          key={opt.status}
                          onClick={async () => {
                            if (!p.uid) return;
                            await markPlayerAttendance(id, p.uid, opt.status as any);
                            loadMatch();
                          }}
                          className={`p-1.5 rounded-lg text-sm border transition-all ${(p.attendance ?? "present") === opt.status
                            ? "bg-slate-800 border-slate-800 text-white shadow-sm"
                            : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                            }`}
                          title={`Marcar como ${opt.label}`}
                        >
                          {opt.icon}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* ATTENDANCE INDICATOR (Non-Admin view) */
                    !isOwner && p.attendance && p.attendance !== "present" && (
                      <div className="mt-2 md:mt-0 px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600 flex items-center gap-1">
                        {p.attendance === "late" && "⏰ Tarde"}
                        {p.attendance === "no_show" && "🚫 No Show"}
                      </div>
                    )
                  }
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

            {/* WAITLIST (SUPLENTES) (Admin View) */}
            {(!isClosed && match.players?.filter((p: Player) => p.isWaitlist && !p.confirmed).length > 0) ? (() => {
              const waitlistPlayers = match.players
                .filter((p: Player) => p.isWaitlist && !p.confirmed)
                .sort((a: Player, b: Player) => {
                  const tA = a.waitlistJoinedAt ? new Date(a.waitlistJoinedAt).getTime() : 0;
                  const tB = b.waitlistJoinedAt ? new Date(b.waitlistJoinedAt).getTime() : 0;
                  return tA - tB;
                });

              return (
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                    📋 Lista de Espera ({waitlistPlayers.length})
                  </h4>
                  <div className="divide-y divide-slate-100">
                    {waitlistPlayers.map((p: Player, i: number) => (
                      <div key={`wl-${i}`} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-bold ring-1 ring-amber-200">
                            #{i + 1}
                          </div>
                          <span className="font-bold text-slate-700 text-sm">{p.name}</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 uppercase tracking-widest">
                            En espera
                          </span>

                          {isOwner && !isClosed && (
                            <>
                              <button
                                onClick={async () => {
                                  try {
                                    await approveFromWaitlist(id, p.name);
                                    await loadMatch();
                                    toast.success("Suplente aceptado y confirmado");
                                  } catch (err: unknown) {
                                    handleError(err, "Error al aceptar suplente.");
                                  }
                                }}
                                className="text-xs font-bold px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"
                              >
                                Aceptar
                              </button>

                              <button
                                onClick={async () => {
                                  if (!confirm(`¿Eliminar a ${p.name} de la lista de espera?`)) return;
                                  try {
                                    await deletePlayerFromMatch(id, p.name);
                                    await loadMatch();
                                    toast.success("Suplente eliminado");
                                  } catch (err: unknown) {
                                    handleError(err, "Error al eliminar suplente.");
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
                    ))}
                  </div>
                </div>
              );
            })() : null}
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
                              (p: Player) => p.id || p.uid || p.name
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {sortTeamForDisplay(balanced.teamA.players).map((p: Player) => {
                                const targetId = p.id || p.uid || p.name;
                                const isMvp = votingClosed && currentMVPs.includes(targetId);
                                const votes = isClosed ? (voteCounts[targetId] || 0) : 0;

                                return (
                                  <PlayerItem
                                    key={targetId}
                                    id={targetId}
                                    name={p.name}
                                    details={`⚡${p.level} · ${(p.positions || []).join("/")}`}
                                    isMvp={isMvp}
                                    votes={votes}
                                  />
                                );
                              })}
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
                              (p: Player) => p.id || p.uid || p.name
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {sortTeamForDisplay(balanced.teamB.players).map((p: Player) => {
                                const targetId = p.id || p.uid || p.name;
                                const isMvp = votingClosed && currentMVPs.includes(targetId);
                                const votes = isClosed ? (voteCounts[targetId] || 0) : 0;

                                return (
                                  <PlayerItem
                                    key={targetId}
                                    id={targetId}
                                    name={p.name}
                                    details={`⚡${p.level} · ${(p.positions || []).join("/")}`}
                                    isMvp={isMvp}
                                    votes={votes}
                                  />
                                );
                              })}
                            </div>
                          </SortableContext>
                        </div>
                      </div>
                    </DndContext>

                    <div className="flex gap-2 mt-4 relative">
                      {hasUnsavedBalance && (
                        <div className="absolute -top-3 -right-3">
                          <span className="flex h-4 w-4 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border border-white"></span>
                          </span>
                        </div>
                      )}

                      <button
                        disabled={savingTeams}
                        onClick={async () => {
                          setSavingTeams(true);
                          setTeamsSaved(false);

                          // Clean undefined values to prevent Firebase errors
                          const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

                          try {
                            await saveTeams(id, {
                              A: cleanObject(balanced.teamA.players),
                              B: cleanObject(balanced.teamB.players),
                            });

                            setHasUnsavedBalance(false);
                            setTeamsSaved(true);

                            setTimeout(() => {
                              setTeamsSaved(false);
                            }, 2000);

                          } catch (err: unknown) {
                            handleError(err, "Error al guardar equipos manualmente");
                          } finally {
                            setSavingTeams(false);
                          }
                        }}
                        className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] ${teamsSaved
                          ? "bg-[#16a34a]"
                          : savingTeams
                            ? "bg-slate-400 cursor-not-allowed shadow-none"
                            : hasUnsavedBalance
                              ? "bg-amber-500 hover:bg-amber-600 animate-pulse border-2 border-amber-600 shadow-amber-500/30"
                              : "bg-blue-600 hover:bg-blue-700"
                          }`}
                      >
                        {savingTeams
                          ? "⏳ Guardando cambios..."
                          : teamsSaved
                            ? "✅ Equipos guardados"
                            : hasUnsavedBalance
                              ? "⚠️ Guardar los cambios"
                              : "💾 Guardar cambios manuales"}
                      </button>

                      {hasUnsavedBalance && (
                        <button
                          onClick={() => {
                            if (!match.teams?.A || !match.teams?.B) return;
                            setBalanced({
                              teamA: { players: [...match.teams.A] },
                              teamB: { players: [...match.teams.B] }
                            });
                            setHasUnsavedBalance(false);
                            toast("Cambios descartados", { icon: "↩️" });
                          }}
                          className="px-4 py-3 bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl font-bold transition-colors shadow-sm"
                          title="Descartar cambios no guardados"
                        >
                          Descartar
                        </button>
                      )}
                    </div>
                    {hasUnsavedBalance && (
                      <div className="text-center text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 p-2 rounded-lg mt-2 animate-in fade-in slide-in-from-top-1">
                        ¡Atención! Has movido jugadores y no has guardado.
                      </div>
                    )}

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

                          } catch (err: unknown) {
                            handleError(err, "Error al copiar el reporte");
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
                    )
                    }


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
                <div className="flex flex-col items-center">
                  <div className="text-xs font-bold text-slate-500 uppercase mb-2">🔴 Equipo A</div>
                  <div className="flex items-center gap-2">
                    {!isClosed && (
                      <button
                        onClick={() => setScoreA(Math.max(0, scoreA - 1))}
                        disabled={scoreA <= 0}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-xl text-slate-600 transition-colors disabled:opacity-50"
                      >−</button>
                    )}
                    <input
                      type="number"
                      min={0}
                      value={scoreA}
                      onChange={e => setScoreA(Math.max(0, Number(e.target.value)))}
                      disabled={isClosed}
                      className="w-16 h-16 text-3xl text-center font-black bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-100 outline-none transition-all disabled:opacity-50"
                    />
                    {!isClosed && (
                      <button
                        onClick={() => setScoreA(scoreA + 1)}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-xl text-slate-600 transition-colors"
                      >+</button>
                    )}
                  </div>
                </div>

                <div className="text-4xl text-slate-300 font-thin mt-6">—</div>

                <div className="flex flex-col items-center">
                  <div className="text-xs font-bold text-slate-500 uppercase mb-2">🔵 Equipo B</div>
                  <div className="flex items-center gap-2">
                    {!isClosed && (
                      <button
                        onClick={() => setScoreB(Math.max(0, scoreB - 1))}
                        disabled={scoreB <= 0}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-xl text-slate-600 transition-colors disabled:opacity-50"
                      >−</button>
                    )}
                    <input
                      type="number"
                      min={0}
                      value={scoreB}
                      onChange={e => setScoreB(Math.max(0, Number(e.target.value)))}
                      disabled={isClosed}
                      className="w-16 h-16 text-3xl text-center font-black bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all disabled:opacity-50"
                    />
                    {!isClosed && (
                      <button
                        onClick={() => setScoreB(scoreB + 1)}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-xl text-slate-600 transition-colors"
                      >+</button>
                    )}
                  </div>
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
                    } catch (err: unknown) {
                      handleError(err, "Error al guardar el marcador.");
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

                  if (hasUnsavedBalance) {
                    toast.error("Tienes cambios sin guardar en los equipos. Por favor guarda (Guardar Cambios) o descarta los movimientos antes de cerrar el partido.");
                    return;
                  }

                  try {
                    // 1️⃣ Traer versión fresca del match
                    const snap = await getDoc(doc(db, "matches", id));
                    if (!snap.exists()) return;

                    const freshMatch = snap.data() as Match;

                    if (!freshMatch?.teams?.A || !freshMatch?.teams?.B) {
                      toast.error("Primero debes balancear los equipos.");
                      return;
                    }

                    const teamA = freshMatch.teams.A;
                    const teamB = freshMatch.teams.B;

                    // 🩹 MERGE ATTENDANCE:
                    // `teams` puede no tener la info de asistencia más reciente (que está en `players`).
                    // Cruzamos la info usando el UID.
                    const playersMap = new Map((freshMatch.players || []).map((p: Player) => [p.uid, p]));

                    const teamAWithAttendance = teamA.map((p: Player) => ({
                      ...p,
                      attendance: p.uid ? playersMap.get(p.uid)?.attendance : "present"
                    }));

                    const teamBWithAttendance = teamB.map((p: Player) => ({
                      ...p,
                      attendance: p.uid ? playersMap.get(p.uid)?.attendance : "present"
                    }));

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
                      await updatePlayerStats(teamAWithAttendance, "win", id, previousResultA);
                      await updatePlayerStats(teamBWithAttendance, "loss", id, previousResultB);
                    } else if (scoreB > scoreA) {
                      await updatePlayerStats(teamAWithAttendance, "loss", id, previousResultA);
                      await updatePlayerStats(teamBWithAttendance, "win", id, previousResultB);
                    } else {
                      await updatePlayerStats(teamAWithAttendance, "draw", id, previousResultA);
                      await updatePlayerStats(teamBWithAttendance, "draw", id, previousResultB);
                    }

                    await closeMatch(id);

                    await loadMatch();
                    toast.success("¡El partido ha sido cerrado!");
                  } catch (error: unknown) {
                    handleError(error, "Error cerrando el partido y guardando estado.");
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
      </main >
    </AuthGuard >
  );
}

function PlayerItem({ id, name, details, isMvp, votes }: { id: string; name: string, details: string, isMvp?: boolean, votes?: number }) {
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
      className={`p-3 bg-white border rounded-lg shadow-sm flex justify-between items-center cursor-grab active:cursor-grabbing hover:border-slate-300 transition-colors ${isDragging ? "ring-2 ring-emerald-500 rotate-2" : "border-slate-200"} ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border-amber-200 ring-1 ring-amber-100" : ""}`}
    >
      <div>
        <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
          {name}
          {isMvp && <span className="text-sm drop-shadow-sm" title="MVP Actual">👑</span>}
        </div>
        <div className="text-[10px] text-slate-500 font-medium">{details}</div>
      </div>

      {votes ? (
        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{votes} v.</span>
      ) : null}
    </div>
  );
}
