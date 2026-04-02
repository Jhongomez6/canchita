"use client";

import { useEffect, useState } from "react";
import { buildWhatsAppReport, buildRosterReport, buildRosterReportTelegram } from "@/lib/matchReport";
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
  deleteMatch,
  confirmTeams,
} from "@/lib/matches";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { balanceTeams } from "@/lib/balanceTeams";
import { calculateMvpStatus } from "@/lib/mvp";
import { getAllUsers, getUserProfile } from "@/lib/users";
import { formatDateSpanish, formatTime12h, formatEndTime } from "@/lib/date";
import type { DragEndEvent } from "@dnd-kit/core";
import { updatePlayerStats } from "@/lib/playerStats";
import type { PlayerLevel } from "@/lib/domain/player";
import type { Player, Position } from "@/lib/domain/player";
import type { Match } from "@/lib/domain/match";
import { canViewMatchAdmin, getMatchPhase, getDefaultTabForPhase } from "@/lib/domain/match";
import type { UserProfile } from "@/lib/domain/user";
import { isSuperAdmin } from "@/lib/domain/user";
import type { Location } from "@/lib/domain/location";
import type { Guest } from "@/lib/domain/guest";
import { guestToPlayer } from "@/lib/domain/guest";
import { addGuestToMatch, promoteGuestToMatch, removeGuestFromMatch } from "@/lib/guests";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import { logMatchInvitationCopied } from "@/lib/analytics";
import MatchAdminSkeleton from "@/components/skeletons/MatchAdminSkeleton";

// Tab components
import MatchAdminTabs, { type TabId } from "./components/MatchAdminTabs";
import DashboardTab from "./components/DashboardTab";
import PlayersTab from "./components/PlayersTab";
import TeamsTab from "./components/TeamsTab";
import SettingsTab from "./components/SettingsTab";
import MatchFAB from "./components/MatchFAB";

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ========================
  // STATE
  // ========================
  const [match, setMatch] = useState<Match | null>(null);
  const [balanced, setBalanced] = useState<{
    teamA: { players: Player[] };
    teamB: { players: Player[] };
  } | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [maxPlayersDraft, setMaxPlayersDraft] = useState<number | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [balancing, setBalancing] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [hasUnsavedBalance, setHasUnsavedBalance] = useState(false);
  const [guestLevels, setGuestLevels] = useState<Record<string, PlayerLevel>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") as TabId) || "dashboard"
  );
  const [tabInitialized, setTabInitialized] = useState(false);

  // ========================
  // REAL-TIME LISTENER
  // ========================
  useEffect(() => {
    if (authLoading || !profile) return;

    const ref = doc(db, "matches", id);
    const unsubscribe = onSnapshot(ref, (snap) => {
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
    });

    return () => unsubscribe();
  }, [profile, authLoading, id]);

  // Sync score from match
  useEffect(() => {
    if (!match?.score) return;
    setScoreA(match.score.A ?? 0);
    setScoreB(match.score.B ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.score?.A, match?.score?.B]);

  // Fetch location
  useEffect(() => {
    if (!match?.locationId) return;
    getDoc(doc(db, "locations", match.locationId)).then((snap) => {
      if (snap.exists()) {
        setLocation({ id: snap.id, ...snap.data() } as Location);
      }
    });
  }, [match?.locationId]);

  // Fetch users for player dropdown
  useEffect(() => {
    if (!match) return;
    const isOwner = user?.uid === match.createdBy;
    if (!isOwner) return;
    getAllUsers().then(setUsers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, user?.uid, match?.createdBy]);

  // Access control
  useEffect(() => {
    if (!profile || !match) return;
    if (
      !profile.roles.includes("admin") ||
      !canViewMatchAdmin(profile, match)
    ) {
      setAccessDenied(true);
    }
  }, [profile, match]);

  // Auto-select tab based on phase (only once on load)
  useEffect(() => {
    if (!match || tabInitialized) return;
    const urlTab = searchParams.get("tab") as TabId | null;
    if (urlTab && ["dashboard", "players", "teams", "settings"].includes(urlTab)) {
      setActiveTab(urlTab);
    } else {
      const phase = getMatchPhase(
        match,
        confirmedCountFor(match),
        match.maxPlayers ?? 14,
        new Date().toISOString().split("T")[0]
      );
      setActiveTab(getDefaultTabForPhase(phase));
    }
    setTabInitialized(true);
  }, [match, tabInitialized, searchParams]);

  // ========================
  // DERIVED VALUES
  // ========================
  function confirmedCountFor(m: Match): number {
    const guestCount = m.guests?.filter((g: Guest) => !g.isWaitlist).length ?? 0;
    return (m.players?.filter((p: Player) => p.confirmed).length ?? 0) + guestCount;
  }

  if (!profile) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
        </div>
      </AuthGuard>
    );
  }

  if (accessDenied) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-5 text-center">
          <p className="text-6xl mb-4">🔒</p>
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            Sin permisos de administración
          </h1>
          <p className="text-slate-500 mb-6">
            No tienes acceso de admin a este partido, pero puedes unirte como jugador.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/join/${id}`}
              className="px-5 py-2.5 bg-[#1f7a4f] text-white font-semibold rounded-lg hover:bg-[#186440] transition-colors"
            >
              Ir a la página del partido
            </Link>
            <Link
              href="/"
              className="text-slate-500 text-sm hover:underline"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (!match) return <MatchAdminSkeleton />;

  // ========================
  // COMPUTED
  // ========================
  const isOwner = Boolean(
    user?.uid &&
      (user.uid === match.createdBy || (profile && isSuperAdmin(profile)))
  );
  const isClosed = match.status === "closed";
  const existingPlayers = match.players ?? [];
  const guestCount =
    match.guests?.filter((g: Guest) => !g.isWaitlist).length ?? 0;
  const confirmedCount =
    (match.players?.filter((p: Player) => p.confirmed).length ?? 0) +
    guestCount;
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);
  const today = new Date().toISOString().split("T")[0];
  const phase = getMatchPhase(match, confirmedCount, match.maxPlayers ?? 14, today);

  const availableUsers = users.filter((u) => {
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

  // MVP
  const voteCounts: Record<string, number> = {};
  if (match.mvpVotes) {
    Object.values(match.mvpVotes).forEach((votedId) => {
      voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    });
  }
  const sortedMVPLeaderboard = Object.entries(voteCounts).sort(
    ([, a], [, b]) => b - a
  );
  const topMvpScore =
    sortedMVPLeaderboard.length > 0 ? sortedMVPLeaderboard[0][1] : 0;
  const currentMVPs = sortedMVPLeaderboard
    .filter(([, score]) => score === topMvpScore && score > 0)
    .map(([id]) => id);

  const closedTime = match.closedAt
    ? new Date(match.closedAt).getTime()
    : 0;
  const now = new Date().getTime();
  const hoursSinceClosed = closedTime
    ? (now - closedTime) / (1000 * 60 * 60)
    : 0;
  const timeLimitClosed = hoursSinceClosed > 5;

  const eligibleUIDs = new Set(
    match.players
      ?.filter(
        (p: Player) =>
          p.confirmed && p.uid && !p.uid.startsWith("guest_")
      )
      .map((p: Player) => p.uid) || []
  );
  if (match.createdBy) eligibleUIDs.add(match.createdBy);
  const totalEligibleVoters = eligibleUIDs.size;
  const votesCast = match.mvpVotes
    ? Object.keys(match.mvpVotes).filter((uid) => eligibleUIDs.has(uid))
        .length
    : 0;
  const remainingVotes = totalEligibleVoters - votesCast;
  const secondHighestScore =
    sortedMVPLeaderboard.length > 1 ? sortedMVPLeaderboard[1][1] : 0;
  const mathematicallyClosed =
    topMvpScore > 0 && topMvpScore > secondHighestScore + remainingVotes;
  const allEligibleVoted =
    totalEligibleVoters > 0 && remainingVotes <= 0;
  const earlyClosure = mathematicallyClosed || allEligibleVoted;
  const votingClosed = isClosed && (timeLimitClosed || earlyClosure);

  // ========================
  // HANDLERS
  // ========================
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
        primaryPosition: p.primaryPosition,
        photoURL: p.photoURL,
        confirmed: p.confirmed,
      }));

    const guestPlayers = (match.guests ?? [])
      .filter((g: Guest) => !g.isWaitlist)
      .map((g: Guest) => guestToPlayer(g, guestLevels[g.name] ?? 2));

    const result = balanceTeams([...confirmed, ...guestPlayers]);
    setBalanced(result);

    const cleanObject = (obj: unknown) => JSON.parse(JSON.stringify(obj));

    try {
      await saveTeams(id, {
        A: cleanObject(result.teamA.players),
        B: cleanObject(result.teamB.players),
      });
      setHasUnsavedBalance(false);
      toast.success("Equipos balanceados y guardados");
    } catch (err: unknown) {
      handleError(err, "Hubo un error balanceando los equipos.");
    } finally {
      setBalancing(false);
    }
  }

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
      newA = newA.filter(
        (p) => (p.id || p.uid || p.name) !== playerId
      );
      newB.push(fromA);
    } else if (fromB) {
      newB = newB.filter(
        (p) => (p.id || p.uid || p.name) !== playerId
      );
      newA.push(fromB);
    }

    setHasUnsavedBalance(true);
    setBalanced({
      teamA: { players: newA },
      teamB: { players: newB },
    });
  }

  async function handleSaveAll(sa: number, sb: number) {
    if (!balanced) return;
    const cleanObject = (obj: unknown) => JSON.parse(JSON.stringify(obj));

    try {
      await saveTeams(id, {
        A: cleanObject(balanced.teamA.players),
        B: cleanObject(balanced.teamB.players),
      });
      await updateDoc(doc(db, "matches", id), {
        score: { A: sa, B: sb },
      });
      setHasUnsavedBalance(false);
      toast.success("Equipos y marcador guardados");
    } catch (err: unknown) {
      handleError(err, "Error al guardar");
    }
  }

  function handleDiscardChanges() {
    if (!match?.teams?.A || !match?.teams?.B) return;
    setBalanced({
      teamA: { players: [...match.teams.A] },
      teamB: { players: [...match.teams.B] },
    });
    setHasUnsavedBalance(false);
    toast("Cambios descartados", { icon: "↩️" });
  }

  async function generateWhatsAppReport() {
    const teamA = balanced?.teamA.players ?? match?.teams?.A ?? [];
    const teamB = balanced?.teamB.players ?? match?.teams?.B ?? [];
    if (teamA.length === 0 && teamB.length === 0) return;

    const sA = match?.score?.A ?? 0;
    const sB = match?.score?.B ?? 0;

    let text = match?.status === "closed"
      ? `📋 *Resumen del partido de hoy:*\n`
      : `⚽ *La titular de hoy:*\n`;

    text += `📅 ${formatDateSpanish(match?.date || "")}\n`;
    text += `⏰ ${formatTime12h(match?.time || "")}${match?.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n\n`;
    text += `🔴 *Equipo A*\n`;
    teamA.forEach((p: Player) => { text += `• ${p.name} \n`; });
    text += `\n🔵 *Equipo B*\n`;
    teamB.forEach((p: Player) => { text += `• ${p.name} \n`; });

    if (match?.status === "closed") {
      text += `\n🏆 *Resultado Final*\n`;
      text += `🔴 Equipo A ${sA} - ${sB} Equipo B 🔵\n`;

      if (match.mvpVotes) {
        const { votingClosed: vc, topMvpScore: ts, winnerNames } = calculateMvpStatus(match);
        if (vc && ts > 0 && winnerNames.length > 0) {
          const title = winnerNames.length > 1 ? "MVPs del Partido" : "MVP del Partido";
          text += `\n⭐ *${title}*\n`;
          text += `👑 ${winnerNames.join(", ")} (${ts} ${ts === 1 ? "voto" : "votos"})\n`;
        }
      }
    }

    await navigator.clipboard.writeText(text);
  }

  async function generateMatchInvitation() {
    if (!match) return;
    const shareUrl = `${window.location.origin}/join/${id}`;
    const text =
      `⚽ *¡NUEVO PARTIDO EN LA CANCHITA!* 🏟️\n\n` +
      `📅 *Día:* ${formatDateSpanish(match.date)}\n` +
      `⏰ *Hora:* ${formatTime12h(match.time)}${match.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n` +
      `📍 *Lugar:* ${location?.name || match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
      `🔗 *Link de invitación:* ${shareUrl}\n\n` +
      `🔑 *Código de búsqueda:* ${id}.ai\n` +
      `_(Copia el código y pégalo en la pantalla inicial o en "Buscar" para entrar al partido)_\n`;
    await navigator.clipboard.writeText(text);
    logMatchInvitationCopied(id);
  }

  async function handleManualReminder() {
    if (
      !confirm(
        "¿Seguro que quieres enviar una notificación Push a todos los jugadores registrados (confirmados y pendientes)?"
      )
    )
      return;
    try {
      const { requestManualReminder } = await import("@/lib/push");
      const res = await requestManualReminder(id);
      toast.success(
        `Recordatorios enviados a ${res.sentTokens} dispositivos activos.`
      );
    } catch (err: unknown) {
      handleError(
        err,
        "Hubo un error al desencadenar las notificaciones Manuales."
      );
    }
  }

  async function handleCloseMatch() {
    if (!match?.teams) return;
    if (hasUnsavedBalance) {
      toast.error(
        "Tienes cambios sin guardar en los equipos. Por favor guarda o descarta los movimientos antes de cerrar el partido."
      );
      return;
    }

    try {
      const snap = await getDoc(doc(db, "matches", id));
      if (!snap.exists()) return;
      const freshMatch = snap.data() as Match;

      if (freshMatch.status === "closed") {
        toast.error("Este partido ya está cerrado.");
        return;
      }

      if (!freshMatch?.teams?.A || !freshMatch?.teams?.B) {
        toast.error("Primero debes balancear los equipos.");
        return;
      }

      const teamA = freshMatch.teams.A;
      const teamB = freshMatch.teams.B;

      const playersMap = new Map(
        (freshMatch.players || []).map((p: Player) => [p.uid, p])
      );

      const teamAWithAttendance = teamA.map((p: Player) => ({
        ...p,
        attendance: p.uid
          ? playersMap.get(p.uid)?.attendance
          : "present",
      }));
      const teamBWithAttendance = teamB.map((p: Player) => ({
        ...p,
        attendance: p.uid
          ? playersMap.get(p.uid)?.attendance
          : "present",
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

      const report = buildWhatsAppReport({
        ...freshMatch,
        score: { A: scoreA, B: scoreB },
      });

      const matchRef = doc(db, "matches", id);
      const matchData = {
        matchRef,
        score: { A: scoreA, B: scoreB },
        previousScore: freshMatch.score || { A: 0, B: 0 },
        finalReport: report,
      };

      // First batch: Team A stats + match document update (atomic)
      // Second batch: Team B stats (atomic)
      if (scoreA > scoreB) {
        await updatePlayerStats(teamAWithAttendance, "win", id, previousResultA, matchData);
        await updatePlayerStats(teamBWithAttendance, "loss", id, previousResultB);
      } else if (scoreB > scoreA) {
        await updatePlayerStats(teamAWithAttendance, "loss", id, previousResultA, matchData);
        await updatePlayerStats(teamBWithAttendance, "win", id, previousResultB);
      } else {
        await updatePlayerStats(teamAWithAttendance, "draw", id, previousResultA, matchData);
        await updatePlayerStats(teamBWithAttendance, "draw", id, previousResultB);
      }

      await closeMatch(id);
      toast.success("¡El partido ha sido cerrado!");
    } catch (error: unknown) {
      handleError(error, "Error cerrando el partido y guardando estado.");
    }
  }

  async function handleDeleteMatchAction() {
    try {
      await deleteMatch(id);
      router.push("/");
    } catch (err: unknown) {
      handleError(err, "Error al borrar el partido.");
    }
  }

  async function handleAddRegisteredPlayer(uid: string) {
    try {
      const prof = await getUserProfile(uid);
      if (!prof) return;
      await addPlayerToMatch(id, {
        uid,
        name: prof.name,
        level: prof.level ?? 2,
        positions: prof.positions || [],
        ...(prof.primaryPosition ? { primaryPosition: prof.primaryPosition } : {}),
        confirmed: true,
      });
      toast.success("Jugador agregado!");
    } catch (err: unknown) {
      handleError(err, "Hubo un error al agregar al jugador.");
    }
  }

  async function handleAddManualPlayer(
    name: string,
    level: number,
    positions: string[]
  ) {
    await addGuestToMatch(id, user!.uid, {
      name,
      positions: positions as Position[],
    });
  }

  async function handleMarkAllPresent() {
    const confirmed = match?.players?.filter(
      (p) => p.confirmed && !p.isWaitlist && p.uid
    ) || [];
    for (const p of confirmed) {
      if (p.uid) {
        await markPlayerAttendance(id, p.uid, "present");
      }
    }
    toast.success("Todos marcados como presentes");
  }

  // FAB action based on phase
  function handleFABAction() {
    switch (phase) {
      case "recruiting":
        setActiveTab("settings");
        // Trigger invitation copy
        generateMatchInvitation().then(() => {
          toast.success("Invitación copiada");
        });
        break;
      case "full":
        setActiveTab("teams");
        handleBalance();
        break;
      case "gameday":
        setActiveTab("players");
        break;
      case "postgame":
        setActiveTab("settings");
        break;
      case "closed":
        generateWhatsAppReport().then(() => {
          toast.success("Reporte copiado");
        });
        break;
    }
  }

  // ========================
  // RENDER
  // ========================
  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-3xl mx-auto p-4 md:p-6">
          {/* Tab Navigation */}
          <MatchAdminTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            playerCount={confirmedCount}
            hasUnsavedBalance={hasUnsavedBalance}
          />

          {/* Tab Panels */}
          {activeTab === "dashboard" && (
            <DashboardTab
              match={match}
              location={location}
              phase={phase}
              confirmedCount={confirmedCount}
              isClosed={isClosed}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === "players" && (
            <PlayersTab
              match={match}
              isOwner={isOwner}
              isClosed={isClosed}
              isFull={isFull}
              phase={phase}
              availableUsers={availableUsers}
              guestLevels={guestLevels}
              onGuestLevelChange={(name, level) =>
                setGuestLevels((prev) => ({ ...prev, [name]: level }))
              }
              onAddRegisteredPlayer={handleAddRegisteredPlayer}
              onAddManualPlayer={handleAddManualPlayer}
              onConfirmAttendance={(name) => confirmAttendance(id, name)}
              onUnconfirmAttendance={(name) => unconfirmAttendance(id, name)}
              onDeletePlayer={(name) => deletePlayerFromMatch(id, name)}
              onUpdatePlayerData={(name, data) => updatePlayerData(id, name, data)}
              onMarkAttendance={(uid, status) => markPlayerAttendance(id, uid, status)}
              onMarkAllPresent={handleMarkAllPresent}
              onApproveFromWaitlist={async (name) => { await approveFromWaitlist(id, name); toast.success("Suplente aceptado y confirmado"); }}
              onRemoveGuest={(invitedBy, name) => removeGuestFromMatch(id, invitedBy, name)}
              onPromoteGuest={async (name, invitedBy) => { await promoteGuestToMatch(id, name, invitedBy); toast.success("Suplente aceptado y confirmado"); }}
              onCopyRoster={async () => {
                const locName = location?.name || match.locationSnapshot?.name || "Cancha por definir";
                const text = buildRosterReport(match, locName, confirmedCount);
                await navigator.clipboard.writeText(text);
                toast.success("Lista copiada");
              }}
              onShareRoster={() => {
                const locName = location?.name || match.locationSnapshot?.name || "Cancha por definir";
                return buildRosterReport(match, locName, confirmedCount);
              }}
              onShareTelegram={() => {
                const locName = location?.name || match.locationSnapshot?.name || "Cancha por definir";
                return buildRosterReportTelegram(match, locName, confirmedCount);
              }}
            />
          )}

          {activeTab === "teams" && (
            <TeamsTab
              balanced={balanced}
              confirmedCount={confirmedCount}
              isOwner={isOwner}
              isClosed={isClosed}
              hasUnsavedBalance={hasUnsavedBalance}
              votingClosed={votingClosed}
              currentMVPs={currentMVPs}
              voteCounts={voteCounts}
              scoreA={scoreA}
              scoreB={scoreB}
              hasTeamsSaved={Boolean(match.teams)}
              teamsConfirmed={match.teamsConfirmed ?? false}
              onBalance={handleBalance}
              onDragEnd={handleDragEnd}
              onSaveAll={handleSaveAll}
              onDiscardChanges={handleDiscardChanges}
              onCopyReport={generateWhatsAppReport}
              onConfirmTeams={async () => {
                try {
                  await confirmTeams(id);
                  toast.success("Equipos confirmados y publicados");
                } catch (err) {
                  handleError(err, "Error al confirmar equipos");
                }
              }}
              onScoreAChange={setScoreA}
              onScoreBChange={setScoreB}
              balancing={balancing}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              match={match}
              isOwner={isOwner}
              isClosed={isClosed}
              hasUnsavedBalance={hasUnsavedBalance}
              maxPlayersDraft={maxPlayersDraft}
              onUpdateMaxPlayers={async (value) => {
                setMaxPlayersDraft(value);
                await updateDoc(doc(db, "matches", id), { maxPlayers: value });
              }}
              onUpdateDuration={async (value) => {
                await updateDoc(doc(db, "matches", id), { duration: value });
              }}
              onSendReminder={handleManualReminder}
              onCopyLink={async () => {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/join/${id}`
                );
              }}
              onCopyCode={async () => {
                await navigator.clipboard.writeText(id);
              }}
              onCopyInvitation={generateMatchInvitation}
              getInvitationText={() => {
                const shareUrl = `${window.location.origin}/join/${id}`;
                return (
                  `⚽ *¡NUEVO PARTIDO EN LA CANCHITA!* 🏟️\n\n` +
                  `📅 *Día:* ${formatDateSpanish(match.date)}\n` +
                  `⏰ *Hora:* ${formatTime12h(match.time)}${match.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n` +
                  `📍 *Lugar:* ${location?.name || match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
                  `🔗 *Link de invitación:* ${shareUrl}\n\n` +
                  `🔑 *Código de búsqueda:* ${id}.ai\n` +
                  `_(Copia el código y pégalo en la pantalla inicial o en "Buscar" para entrar al partido)_\n`
                );
              }}
              getInvitationTextTelegram={() => {
                const shareUrl = `${window.location.origin}/join/${id}`;
                return (
                  `⚽ ¡NUEVO PARTIDO EN LA CANCHITA! 🏟️\n\n` +
                  `📅 Día: ${formatDateSpanish(match.date)}\n` +
                  `⏰ Hora: ${formatTime12h(match.time)}${match.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n` +
                  `📍 Lugar: ${location?.name || match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
                  `🔗 Link de invitación: ${shareUrl}\n\n` +
                  `🔑 Código de búsqueda: ${id}.ai\n` +
                  `(Copia el código y pégalo en la pantalla inicial o en "Buscar" para entrar al partido)\n`
                );
              }}
              onCloseMatch={handleCloseMatch}
              onReopenMatch={async () => reopenMatch(id)}
              onDeleteMatch={handleDeleteMatchAction}
              onToggleAllowGuests={async (value) => {
                const update: Record<string, unknown> = { allowGuests: value };
                if (!value) {
                  update.guests = [];
                }
                await updateDoc(doc(db, "matches", id), update);
              }}
            />
          )}
        </div>

        {/* Floating Action Button */}
        {isOwner && (
          <MatchFAB
            phase={phase}
            onAction={handleFABAction}
          />
        )}
      </main>
    </AuthGuard>
  );
}
