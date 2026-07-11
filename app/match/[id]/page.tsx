"use client";

import { useEffect, useState, useRef } from "react";
import { buildWhatsAppReport, buildRosterReport, buildRosterReportTelegram, buildMultiTeamReport } from "@/lib/matchReport";
import { useAuth } from "@/lib/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import {
  addPlayerToMatch,
  updatePlayerData,
  saveTeams,
  closeMatch,
  reopenMatch,
  markPlayerAttendance,
  moveToWaitlist,
  deleteMatch,
  confirmTeams,
  updateTeamColors,
  updateMatchDatetime,
} from "@/lib/matches";
import { updateMultiTeamStats } from "@/lib/playerStats";
import { canUseMultiTeam, allFixturesPlayed } from "@/lib/domain/multiTeam";
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
  logTeamColorChanged,
} from "@/lib/analytics";
import { getTeamColors, TEAM_COLOR_EMOJI } from "@/lib/domain/team-colors";
import { Lock } from "lucide-react";
import { adminRemovePlayer, confirmFromWaitlist } from "@/lib/wallet";
import { formatCOP } from "@/lib/domain/wallet";
import MatchAdminSkeleton from "@/components/skeletons/MatchAdminSkeleton";

// Tab components
import MatchAdminTabs, { type TabId } from "./components/MatchAdminTabs";
import DashboardTab from "./components/DashboardTab";
import PlayersTab from "./components/PlayersTab";
import TeamsTab from "./components/TeamsTab";
import MultiTeamsTab from "./components/MultiTeamsTab";
import ScoreTab from "./components/ScoreTab";
import MultiScoreTab from "./components/MultiScoreTab";
import SettingsTab from "./components/SettingsTab";
import PaymentsTab from "./components/PaymentsTab";
import ReviewsTab from "./components/ReviewsTab";
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
  const [showMultiSetup, setShowMultiSetup] = useState(false);
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
      } else {
        // Sin equipos clásicos (p. ej. tras cambiar a multi-equipo): limpiar estado obsoleto
        setBalanced(null);
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
    if (urlTab && ["dashboard", "players", "teams", "score", "settings", "payments", "reviews"].includes(urlTab)) {
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
  const superAdmin = Boolean(profile && isSuperAdmin(profile));
  const isOwner = Boolean(
    user?.uid && (user.uid === match.createdBy || superAdmin)
  );
  const isClosed = match.status === "closed";
  const existingPlayers = match.players ?? [];
  const guestCount =
    match.guests?.filter((g: Guest) => !g.isWaitlist).length ?? 0;
  const confirmedCount =
    (match.players?.filter((p: Player) => p.confirmed).length ?? 0) +
    guestCount;
  const isFull = confirmedCount >= (match?.maxPlayers || 14);

  // Modo multi-equipo: activo si el partido ya tiene torneo multi, o si el admin
  // está en el flujo de setup (showMultiSetup) tras elegir "varios equipos".
  const inMultiMode = Boolean(match.multiTeam) || showMultiSetup;
  const canOfferMulti = canUseMultiTeam(confirmedCount);

  // Jugadores elegibles para balancear (confirmados + invitados no-waitlist), como Player[]
  const eligiblePlayersForBalance: Player[] = [
    ...(match.players ?? [])
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
        sex: p.sex,
      })),
    ...(match.guests ?? [])
      .filter((g: Guest) => !g.isWaitlist)
      .map((g: Guest) => guestToPlayer(g, guestLevels[g.name] ?? 2)),
  ];

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
      logTeamsBalanced(id, result.quality);
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

    const { A: colorA, B: colorB } = getTeamColors(match?.teamColors);
    const emojiA = TEAM_COLOR_EMOJI[colorA];
    const emojiB = TEAM_COLOR_EMOJI[colorB];

    let text = match?.status === "closed"
      ? `📋 *Resumen del partido de hoy:*\n`
      : `⚽ *La titular de hoy:*\n`;

    text += `📅 ${formatDateSpanish(match?.date || "")}\n`;
    text += `⏰ ${formatTime12h(match?.time || "")}${match?.duration ? ` — hasta las ${formatEndTime(match.time, match.duration)}` : ""}\n\n`;
    text += `${emojiA} *Equipo A*\n`;
    teamA.forEach((p: Player, i: number) => { text += `${i + 1}. ${p.name} \n`; });
    text += `\n${emojiB} *Equipo B*\n`;
    teamB.forEach((p: Player, i: number) => { text += `${i + 1}. ${p.name} \n`; });

    if (match?.status === "closed") {
      text += `\n🏆 *Resultado Final*\n`;
      text += `${emojiA} Equipo A ${sA} - ${sB} Equipo B ${emojiB}\n`;

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

  async function handleCloseMultiTeam() {
    try {
      const snap = await getDoc(doc(db, "matches", id));
      if (!snap.exists()) return;
      const freshMatch = snap.data() as Match;

      if (freshMatch.status === "closed") {
        toast.error("Este partido ya está cerrado.");
        return;
      }
      if (!freshMatch.multiTeam?.fixtures?.length) {
        toast.error("Primero debes confirmar los equipos y generar los fixtures.");
        return;
      }
      if (!allFixturesPlayed(freshMatch.multiTeam.fixtures)) {
        toast.error("Debes registrar todos los marcadores antes de cerrar el partido.");
        return;
      }

      // Procesa stats (resultado neto por jugador) + statsProcessed + previousMultiTeam
      await updateMultiTeamStats({
        id,
        date: freshMatch.date,
        multiTeam: freshMatch.multiTeam,
        players: freshMatch.players,
        statsProcessed: freshMatch.statsProcessed,
        previousMultiTeam: freshMatch.previousMultiTeam,
      });

      await closeMatch(id);
      logMatchClosed(id);
      toast.success("¡El partido ha sido cerrado!");
    } catch (error: unknown) {
      handleError(error, "Error cerrando el partido multi-equipo.");
    }
  }

  async function handleCloseMatch() {
    // Modo multi-equipo: cierre por resultado de fixtures (balance neto)
    if (match?.multiTeam) {
      await handleCloseMultiTeam();
      return;
    }
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

      // Re-cierre: mapa uid → resultado previo derivado del equipo REAL donde estaba
      // cada jugador en el cierre anterior (previousTeams). Así la reversión es correcta
      // aunque el jugador haya cambiado de equipo entre cierres.
      let previousResultByUid: Map<string, "win" | "loss" | "draw"> | undefined;
      if (freshMatch.statsProcessed && freshMatch.previousScore) {
        const prevA = freshMatch.previousScore.A ?? 0;
        const prevB = freshMatch.previousScore.B ?? 0;
        const prevResultA: "win" | "loss" | "draw" =
          prevA > prevB ? "win" : prevA < prevB ? "loss" : "draw";
        const prevResultB: "win" | "loss" | "draw" =
          prevB > prevA ? "win" : prevB < prevA ? "loss" : "draw";
        // Fallback a equipos actuales para partidos cerrados antes de que se guardara previousTeams.
        const prevTeamA = freshMatch.previousTeams?.A ?? teamA;
        const prevTeamB = freshMatch.previousTeams?.B ?? teamB;
        previousResultByUid = new Map();
        for (const p of prevTeamA) if (p.uid) previousResultByUid.set(p.uid, prevResultA);
        for (const p of prevTeamB) if (p.uid) previousResultByUid.set(p.uid, prevResultB);
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
        // Composición aplicada en este cierre — el próximo re-cierre la usa como "equipos previos".
        previousTeams: { A: teamA, B: teamB },
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
      const matchDate = freshMatch.date;
      if (scoreA > scoreB) {
        await updatePlayerStats(teamAWithAttendance, "win", id, matchDate, previousResultByUid, matchData, pendingNoShows);
        await updatePlayerStats(teamBWithAttendance, "loss", id, matchDate, previousResultByUid);
      } else if (scoreB > scoreA) {
        await updatePlayerStats(teamAWithAttendance, "loss", id, matchDate, previousResultByUid, matchData, pendingNoShows);
        await updatePlayerStats(teamBWithAttendance, "win", id, matchDate, previousResultByUid);
      } else {
        await updatePlayerStats(teamAWithAttendance, "draw", id, matchDate, previousResultByUid, matchData, pendingNoShows);
        await updatePlayerStats(teamBWithAttendance, "draw", id, matchDate, previousResultByUid);
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
      // Incluir waitlist: también merecen notificación al cancelar
      const notifiableCount = match
        ? (match.players?.filter((p: Player) => !!p.uid).length ?? 0)
        : 0;
      await deleteMatch(id, {
        hasDeposit: (match?.deposit ?? 0) > 0,
        confirmedCount: notifiableCount,
      });
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
            hasTeams={Boolean(match.teams) || Boolean(match.multiTeam)}
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
              onDeletePlayer={async (name) => {
                try {
                  const result = await adminRemovePlayer(id, name);
                  if (result.refunded) {
                    toast.success(`${name} retirado. Depósito de ${formatCOP(match.deposit!)} reembolsado a su billetera.`, { duration: 6000 });
                  } else {
                    toast.success(`${name} retirado del partido.`, { duration: 6000 });
                  }
                } catch (err: unknown) {
                  handleError(err, "Error al retirar al jugador");
                }
              }}
              onUpdatePlayerData={(name, data) => updatePlayerData(id, name, data)}
              onMarkAttendance={(uid, status) => markPlayerAttendance(id, uid, status)}
              onMarkAllPresent={handleMarkAllPresent}
              onApproveFromWaitlist={async (name) => {
                try {
                  await confirmFromWaitlist(id, name);
                  toast.success("Suplente aceptado y confirmado");
                } catch (err: unknown) {
                  handleError(err, "No se pudo aceptar al suplente");
                }
              }}
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

          {activeTab === "teams" && inMultiMode && (
            <MultiTeamsTab
              matchId={id}
              isOwner={isOwner}
              isClosed={isClosed}
              confirmedCount={confirmedCount}
              eligiblePlayers={eligiblePlayersForBalance}
              multiTeam={match.multiTeam}
              currentMVPs={currentMVPs}
              voteCounts={voteCounts}
              votingClosed={votingClosed}
              onExitMulti={() => setShowMultiSetup(false)}
              onGetReportText={() => buildMultiTeamReport(match)}
            />
          )}

          {activeTab === "teams" && !inMultiMode && (
            <>
              {isOwner && !isClosed && canOfferMulti && (
                <button
                  onClick={() => setShowMultiSetup(true)}
                  className="w-full mb-3 py-2.5 rounded-xl font-bold text-sm text-emerald-700 bg-emerald-50 border-2 border-emerald-500/20 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                >
                  🏆 {balanced ? "Cambiar a varios equipos (round-robin)" : "¿Muchos anotados? Armar varios equipos (round-robin)"}
                </button>
              )}
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
              teamColors={getTeamColors(match.teamColors)}
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
              onColorChange={async (team, color) => {
                const current = getTeamColors(match.teamColors);
                const next = { ...current, [team]: color };
                try {
                  await updateTeamColors(id, next);
                  logTeamColorChanged(id, team, color);
                } catch (err) {
                  handleError(err, "No se pudo cambiar el color");
                }
              }}
              balancing={balancing}
            />
            </>
          )}

          {activeTab === "score" && match.multiTeam && (
            <MultiScoreTab
              matchId={id}
              isOwner={isOwner}
              isClosed={isClosed}
              multiTeam={match.multiTeam}
              onGetReportText={() => buildMultiTeamReport(match)}
            />
          )}

          {activeTab === "score" && !match.multiTeam && (
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
              teamColors={match.teamColors}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              match={match}
              isOwner={isOwner}
              isClosed={isClosed}
              hasScore={Boolean(match.score)}
              maxPlayersDraft={maxPlayersDraft}
              isSuperAdmin={superAdmin}
              onUpdateDatetime={async (date, time) => {
                try {
                  await updateMatchDatetime(id, date, time);
                  logMatchSettingUpdated(id, "datetime", `${date} ${time}`);
                  toast.success("Fecha y hora actualizadas");
                } catch (err) {
                  handleError(err, "No se pudo actualizar la fecha/hora.");
                  throw err;
                }
              }}
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

          {activeTab === "reviews" && match.status === "closed" && (
            <ReviewsTab matchId={id} players={match.players} />
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
