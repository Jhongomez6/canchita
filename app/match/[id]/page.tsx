"use client";

import { useEffect, useState, useRef } from "react";
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
  moveToWaitlist,
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
import type { Guest } from "@/lib/domain/guest";
import { guestToPlayer } from "@/lib/domain/guest";
import { addGuestToMatch, promoteGuestToMatch, removeGuestFromMatch } from "@/lib/guests";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import { type FABPhase } from "./components/MatchFAB";
import {
  logMatchInvitationCopied,
  logMatchAdminTabSwitched,
  logMatchClosed,
  logMatchDeleted,
  logTeamsBalanced,
  logPushRemindersSent,
  logMatchPlayerAdded,
  logMatchReportCopied,
  logMatchSettingUpdated,
  logMatchInstructionsSaved,
} from "@/lib/analytics";
import { Lock } from "lucide-react";
import MatchAdminSkeleton from "@/components/skeletons/MatchAdminSkeleton";

// Tab components
import MatchAdminTabs, { type TabId } from "./components/MatchAdminTabs";
import DashboardTab from "./components/DashboardTab";
import PlayersTab from "./components/PlayersTab";
import TeamsTab from "./components/TeamsTab";
import ScoreTab from "./components/ScoreTab";
import SettingsTab from "./components/SettingsTab";
import PaymentsTab from "./components/PaymentsTab";
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
  const [balancing, setBalancing] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [isSavingTeams, setIsSavingTeams] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [guestLevels, setGuestLevels] = useState<Record<string, PlayerLevel>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") as TabId) || "dashboard"
  );
  const [tabInitialized, setTabInitialized] = useState(false);

  // Interceptar cambio de tab si hay cobros sin guardar
  function handleTabChange(tab: TabId) {
    logMatchAdminTabSwitched(id, tab);
    setActiveTab(tab);
  }


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
    if (urlTab && ["dashboard", "players", "teams", "settings", "payments"].includes(urlTab)) {
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
          <Lock size={64} className="text-slate-300 mb-4" />
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
  const isFull = confirmedCount >= (match?.maxPlayers || 14);

  // New granular FAB state detection
  const confirmedP = match?.players?.filter(p => p.confirmed && !p.isWaitlist) || [];
  const confirmedG = match?.guests?.filter(g => g.confirmed && !g.isWaitlist) || [];
  const totalConfirmedParticipants = confirmedP.length + confirmedG.length;
  const paidCount = Object.values(match?.payments || {}).filter(Boolean).length;
  const isAllPaid = totalConfirmedParticipants > 0 && paidCount >= totalConfirmedParticipants;

  let fabPhase: FABPhase = "recruiting";
  if (isClosed) {
    fabPhase = isAllPaid ? "all_set" : "can_collect";
  } else if (match?.score) {
    fabPhase = "can_close";
  } else if (match?.teamsConfirmed) {
    fabPhase = "can_score";
  } else if (match?.teams) {
    fabPhase = "can_confirm";
  } else if (isFull) {
    fabPhase = "can_balance";
  }

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

  const { 
    voteCounts, 
    currentMVPs, 
    votingClosed 
  } = calculateMvpStatus(match);

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
      logTeamsBalanced(id);
      setIsSavingTeams(false);
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
      newA = newA.filter((p) => (p.id || p.uid || p.name) !== playerId);
      newB.push(fromA);
    } else if (fromB) {
      newB = newB.filter((p) => (p.id || p.uid || p.name) !== playerId);
      newA.push(fromB);
    }

    const nextBalanced = {
      teamA: { players: newA },
      teamB: { players: newB },
    };
    setBalanced(nextBalanced);

    // Debounced auto-save: cancel any pending save, then schedule a new one
    setIsSavingTeams(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const cleanObject = (obj: unknown) => JSON.parse(JSON.stringify(obj));
      try {
        await saveTeams(id, {
          A: cleanObject(nextBalanced.teamA.players),
          B: cleanObject(nextBalanced.teamB.players),
        });
      } catch (err: unknown) {
        handleError(err, "Error al guardar equipos automáticamente");
      } finally {
        setIsSavingTeams(false);
      }
    }, 1500);
  }

  async function handleSaveScore(sa: number, sb: number) {
    try {
      await updateDoc(doc(db, "matches", id), {
        score: { A: sa, B: sb },
      });
      toast.success("Marcador guardado");
    } catch (err: unknown) {
      handleError(err, "Error al guardar marcador");
    }
  }

  function buildReportText(): string {
    const teamA = balanced?.teamA.players ?? match?.teams?.A ?? [];
    const teamB = balanced?.teamB.players ?? match?.teams?.B ?? [];
    if (teamA.length === 0 && teamB.length === 0) return "";

    const sA = match?.score?.A ?? 0;
    const sB = match?.score?.B ?? 0;

    let text = match?.status === "closed"
      ? `📋 *Resumen del partido de hoy:*\n`
      : `⚽ *La titular de hoy:*\n`;

    text += `📅 ${formatDateSpanish(match?.date || "")}\n`;
    text += `⏰ ${formatTime12h(match?.time || "")}${match?.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n\n`;
    text += `🔴 *Equipo A*\n`;
    teamA.forEach((p: Player, i: number) => { text += `${i + 1}. ${p.name} \n`; });
    text += `\n🔵 *Equipo B*\n`;
    teamB.forEach((p: Player, i: number) => { text += `${i + 1}. ${p.name} \n`; });

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

    return text;
  }

  async function generateWhatsAppReport() {
    const text = buildReportText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    logMatchReportCopied(
      id,
      match?.status === "closed" ? "summary" : "teams",
      "clipboard"
    );
  }

  async function generateMatchInvitation() {
    if (!match) return;
    const shareUrl = `${window.location.origin}/join/${id}`;
    const text =
      `⚽ *¡NUEVO PARTIDO EN LA CANCHITA!* 🏟️\n\n` +
      `📅 *Día:* ${formatDateSpanish(match.date)}\n` +
      `⏰ *Hora:* ${formatTime12h(match.time)}${match.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n` +
      `📍 *Lugar:* ${match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
      `🔗 *Link de invitación:* ${shareUrl}\n\n` +
      `🔑 *Código de búsqueda:* ${id}.ai\n` +
      `_(Copia el código y pégalo en la pantalla inicial o en "Buscar" para entrar al partido)_\n`;
    await navigator.clipboard.writeText(text);
    logMatchReportCopied(id, "invitation", "clipboard");
    logMatchInvitationCopied(id); // Keep existing one for backwards compatibility
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
      logPushRemindersSent(id);
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
    if (!match?.score) {
      toast.error("Debes registrar el marcador antes de cerrar el partido.");
      return;
    }
    if (isSavingTeams) {
      toast.error("Los equipos se están guardando. Espera un momento y vuelve a intentarlo.");
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

      // Jugadores que cancelaron (solo en match.players, sin equipo) marcados como no-show
      const teamUids = new Set([
        ...teamA.map((p: Player) => p.uid).filter(Boolean),
        ...teamB.map((p: Player) => p.uid).filter(Boolean),
      ]);
      const pendingNoShows = (freshMatch.players || []).filter(
        (p: Player) => p.uid && !teamUids.has(p.uid) && p.attendance === "no_show"
      );

      // First batch: Team A stats + pending no-shows + match document update (atomic)
      // Second batch: Team B stats (atomic)
      if (scoreA > scoreB) {
        await updatePlayerStats(teamAWithAttendance, "win", id, previousResultA, matchData, pendingNoShows);
        await updatePlayerStats(teamBWithAttendance, "loss", id, previousResultB);
      } else if (scoreB > scoreA) {
        await updatePlayerStats(teamAWithAttendance, "loss", id, previousResultA, matchData, pendingNoShows);
        await updatePlayerStats(teamBWithAttendance, "win", id, previousResultB);
      } else {
        await updatePlayerStats(teamAWithAttendance, "draw", id, previousResultA, matchData, pendingNoShows);
        await updatePlayerStats(teamBWithAttendance, "draw", id, previousResultB);
      }

      await closeMatch(id);
      logMatchClosed(id);
      toast.success("¡El partido ha sido cerrado!");
    } catch (error: unknown) {
      handleError(error, "Error cerrando el partido y guardando estado.");
    }
  }

  async function handleDeleteMatchAction() {
    try {
      await deleteMatch(id);
      logMatchDeleted(id);
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
      logMatchPlayerAdded(id, "registered");
      toast.success("Jugador agregado!");
    } catch (err: unknown) {
      handleError(err, "Hubo un error al agregar al jugador.");
    }
  }

  async function handleAddManualPlayer(
    name: string,
    _level: number,
    positions: string[]
  ) {
    await addGuestToMatch(id, user!.uid, {
      name,
      positions: positions as Position[],
    });
    logMatchPlayerAdded(id, "manual");
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
    const scrollTo = (elementId: string) => {
      // Small delay to allow the tab panel to render before we try to scroll to the element
      setTimeout(() => {
        const el = document.getElementById(elementId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Highlight with a pulse effect if possible (CSS transition)
          el.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
          setTimeout(() => el.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2"), 2000);
        }
      }, 400);
    };

    switch (fabPhase) {
      case "recruiting":
        setActiveTab("settings");
        generateMatchInvitation().then(() => {
          toast.success("Invitación copiada");
        });
        break;
      case "can_balance":
        setActiveTab("teams");
        break;
      case "can_confirm":
        setActiveTab("teams");
        scrollTo("btn-confirm-teams");
        break;
      case "can_score":
        setActiveTab("score");
        break;
      case "can_close":
        setActiveTab("settings");
        scrollTo("btn-close-match");
        break;
      case "can_collect":
        setActiveTab("payments");
        break;
      case "all_set":
        generateWhatsAppReport().then(() => {
          toast.success("Reporte copiado");
        });
        break;
    }
  }

  // ========================
  // RENDER
  // ========================
  const hasUnsavedScore = match.score 
    ? (scoreA !== match.score.A || scoreB !== match.score.B)
    : (scoreA !== 0 || scoreB !== 0);

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-3xl mx-auto p-4 md:p-6">
          {/* Tab Navigation */}
          <MatchAdminTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            playerCount={confirmedCount}
            isSavingTeams={isSavingTeams}
            hasUnsavedScore={hasUnsavedScore}
            hasTeams={Boolean(match.teams)}
            isClosed={isClosed}
            fabPhase={fabPhase}
          />

          {/* Tab Panels */}
          {activeTab === "dashboard" && (
            <DashboardTab
              match={match}
              phase={phase}
              confirmedCount={confirmedCount}
              isClosed={isClosed}
              onNavigateTab={setActiveTab}
              onCopyLink={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/join/${id}`);
              }}
              onCopyCode={async () => {
                await navigator.clipboard.writeText(id);
              }}
              onCopyInvitation={generateMatchInvitation}
              onCopyReport={generateWhatsAppReport}
              getInvitationText={() => {
                const shareUrl = `${window.location.origin}/join/${id}`;
                return (
                  `⚽ *¡NUEVO PARTIDO EN LA CANCHITA!* 🏟️\n\n` +
                  `📅 *Día:* ${formatDateSpanish(match.date)}\n` +
                  `⏰ *Hora:* ${formatTime12h(match.time)}${match.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n` +
                  `📍 *Lugar:* ${match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
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
                  `📍 Lugar: ${match.locationSnapshot?.name || "Cancha por definir"}\n\n` +
                  `🔗 Link de invitación: ${shareUrl}\n\n` +
                  `🔑 Código de búsqueda: ${id}.ai\n` +
                  `(Copia el código y pégalo en la pantalla inicial o en "Buscar" para entrar al partido)\n`
                );
              }}
              getReportText={buildReportText}
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
              onMoveToWaitlist={async (name) => { await moveToWaitlist(id, name); toast.success(`${name} movido a lista de espera`); }}
              onRemoveGuest={(invitedBy, name) => removeGuestFromMatch(id, invitedBy, name)}
              onPromoteGuest={async (name, invitedBy) => { await promoteGuestToMatch(id, name, invitedBy); toast.success("Suplente aceptado y confirmado"); }}
              onCopyRoster={async () => {
                const locName = match.locationSnapshot?.name || "Cancha por definir";
                const text = buildRosterReport(match, locName, confirmedCount);
                await navigator.clipboard.writeText(text);
                toast.success("Lista copiada");
              }}
              onShareRoster={() => {
                const locName = match.locationSnapshot?.name || "Cancha por definir";
                return buildRosterReport(match, locName, confirmedCount);
              }}
              onShareTelegram={() => {
                const locName = match.locationSnapshot?.name || "Cancha por definir";
                return buildRosterReportTelegram(match, locName, confirmedCount);
              }}
            />
          )}

          {activeTab === "teams" && (
            <TeamsTab
              matchId={id}
              balanced={balanced}
              confirmedCount={confirmedCount}
              isOwner={isOwner}
              isClosed={isClosed}
              isSavingTeams={isSavingTeams}
              votingClosed={votingClosed}
              currentMVPs={currentMVPs}
              voteCounts={voteCounts}
              hasTeamsSaved={Boolean(match.teams)}
              teamsConfirmed={match.teamsConfirmed ?? false}
              onBalance={handleBalance}
              onDragEnd={handleDragEnd}
              onCopyReport={generateWhatsAppReport}
              onGetReportText={buildReportText}
              onConfirmTeams={async () => {
                try {
                  await confirmTeams(id);
                  toast.success("Equipos confirmados y publicados");
                } catch (err) {
                  handleError(err, "Error al confirmar equipos");
                }
              }}
              balancing={balancing}
            />
          )}

          {activeTab === "score" && (
            <ScoreTab
              scoreA={scoreA}
              scoreB={scoreB}
              isClosed={isClosed}
              hasUnsavedScore={!match.score || scoreA !== match.score.A || scoreB !== match.score.B}
              onScoreAChange={setScoreA}
              onScoreBChange={setScoreB}
              onSaveScore={handleSaveScore}
              onDiscardScore={() => {
                setScoreA(match.score?.A ?? 0);
                setScoreB(match.score?.B ?? 0);
              }}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              match={match}
              isOwner={isOwner}
              isClosed={isClosed}
              hasScore={Boolean(match.score)}
              maxPlayersDraft={maxPlayersDraft}
              onUpdateMaxPlayers={async (value) => {
                setMaxPlayersDraft(value);
                await updateDoc(doc(db, "matches", id), { maxPlayers: value });
                logMatchSettingUpdated(id, "max_players", value);
              }}
              onUpdateDuration={async (value) => {
                await updateDoc(doc(db, "matches", id), { duration: value });
                logMatchSettingUpdated(id, "duration", value);
              }}
              onSendReminder={handleManualReminder}
              onCloseMatch={handleCloseMatch}
              onReopenMatch={async () => reopenMatch(id)}
              onDeleteMatch={handleDeleteMatchAction}
              onToggleAllowGuests={async (value) => {
                const update: Record<string, unknown> = { allowGuests: value };
                if (!value) {
                  update.guests = [];
                }
                await updateDoc(doc(db, "matches", id), update);
                logMatchSettingUpdated(id, "allow_guests", value);
              }}
              onUpdateInstructions={async (value) => {
                await updateDoc(doc(db, "matches", id), { instructions: value });
                logMatchInstructionsSaved(id);
                toast.success("Instrucciones guardadas");
              }}
            />
          )}

          {activeTab === "payments" && (
            <PaymentsTab
              match={match}
              onTogglePayment={async (playerId, isPaid) => {
                try {
                  await updateDoc(doc(db, "matches", id), {
                    [`payments.${playerId}`]: isPaid
                  });
                } catch (err: unknown) {
                  handleError(err, "Error al guardar el cobro.");
                  throw err;
                }
              }}
            />
          )}
        </div>

        {/* Floating Action Button */}
        {isOwner && (
          <MatchFAB
            phase={fabPhase}
            onAction={handleFABAction}
          />
        )}
      </main>
    </AuthGuard>
  );
}
