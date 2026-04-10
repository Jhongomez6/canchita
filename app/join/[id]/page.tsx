"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { loginWithGoogle } from "@/lib/auth";
import { formatDateSpanish, formatDateShort, formatTime12h, formatEndTime } from "@/lib/date";
import { googleMapsEmbedUrl, googleMapsLink, wazeLink } from "@/lib/maps";
import Image from "next/image";
import { Clock, MapPin, Map, User, Users, Key, Copy, Check, AlertTriangle, XCircle, CheckCircle2, ClipboardList, Trophy, Crown, Star, CalendarX, Lock, Activity, Calendar } from "lucide-react";

import { AnimatePresence, motion } from "framer-motion";
import AddGuestForm from "@/components/AddGuestForm";
import { isInAppBrowser } from "@/lib/browser";
import { Guest, guestToPlayer } from "@/lib/domain/guest";
import type { Match } from "@/lib/domain/match";

import { isAdmin } from "@/lib/domain/user";
import type { Location } from "@/lib/domain/location";
import { type Player, type Position, POSITION_ICONS } from "@/lib/domain/player";

import {
  joinMatch,
  confirmAttendance,
  unconfirmAttendance,
  joinWaitlist,
  leaveWaitlist,
  voteForMVP,
} from "@/lib/matches";
import { buildRosterReport, buildRosterReportTelegram } from "@/lib/matchReport";
import { promoteGuestToMatch, removeGuestFromMatch } from "@/lib/guests";
import { calculateMvpStatus } from "@/lib/mvp";
import { triggerMvpNotification } from "@/lib/push";
import {
  logOrganizerContacted,
  logMatchMapOpened,
  logMatchCodeCopied,
  logMatchMapDirectionClicked,
  logMatchReportCopied,
  logMatchJoined,
  logWaitlistJoined,
  logAttendanceConfirmed,
  logAttendanceUnconfirmed,
  logWaitlistLeft,
  logGuestRemoved,
  logMvpVoted,
} from "@/lib/analytics";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import JoinSkeleton from "@/components/skeletons/JoinSkeleton";
import Link from "next/link";
import PlayerCardDrawer from "@/components/PlayerCardDrawer";
import MatchTimeline from "@/components/MatchTimeline";
import JoinConfirmModal from "@/components/JoinConfirmModal";

export default function JoinMatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [matchLocation, setMatchLocation] = useState<Location | null>(null);
  const [error, setError] = useState("");
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [inApp, setInApp] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [showOrganizerTooltip, setShowOrganizerTooltip] = useState(false);
  const [showCodeTooltip, setShowCodeTooltip] = useState(false);
  const [selectedPlayerUid, setSelectedPlayerUid] = useState<string | null>(null);
  const [isPlayerCardOpen, setIsPlayerCardOpen] = useState(false);
  const [organizerPhone, setOrganizerPhone] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isWaitlistModal, setIsWaitlistModal] = useState(false);
  const [pendingJoinAction, setPendingJoinAction] = useState<(() => Promise<void>) | null>(null);

  const handlePlayerTap = (uid?: string) => {
    if (!uid) return;
    setSelectedPlayerUid(uid);
    setIsPlayerCardOpen(true);
  };

  useEffect(() => {
    const delay = setTimeout(() => {
      setInApp(isInAppBrowser());
    }, 0);
    return () => clearTimeout(delay);
  }, []);

  // Redirigir a /profile si el perfil está incompleto
  useEffect(() => {
    if (
      profile &&
      profile.roles?.includes("player") &&
      (!profile.positions || profile.positions.length === 0)
    ) {
      if (typeof window !== "undefined") {
        localStorage.setItem("returnToMatch", id);
      }
      router.replace("/profile");
    }
  }, [profile, router, id]);

  // Redirigir a /onboarding/phone si falta teléfono
  useEffect(() => {
    if (
      profile &&
      profile.roles?.includes("player") &&
      profile.positions?.length > 0 &&
      !profile.phone
    ) {
      if (typeof window !== "undefined") {
        localStorage.setItem("returnToMatch", id);
      }
      router.replace("/onboarding/phone");
    }
  }, [profile, router, id]);

  // 🔴 Real-time listener — auto-updates when Firestore changes
  useEffect(() => {
    if (loading || !user || !profile || !(profile.positions?.length > 0)) return;

    const ref = doc(db, "matches", id);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError("El partido no existe");
          return;
        }
        setMatch({ id: snap.id, ...snap.data() } as Match);
      },
      (e) => {
        handleError(e, "No se pudo cargar el partido");
        setError("No se pudo cargar el partido");
      }
    );

    return () => unsubscribe();
  }, [loading, user, id, profile]);

  // Sync player profile data (photo, positions) to match document reactively
  useEffect(() => {
    if (!user || !profile || !match || match.status === "closed" || !match.players) return;

    const currentPlayer = match.players.find((p: Player) => p.uid === user.uid);
    if (!currentPlayer) return;

    // Detectar cambios en foto o posiciones
    const profilePhoto = profile.photoURL || null;
    const matchPhoto = currentPlayer.photoURL || null;

    const profileThumb = profile.photoURLThumb || null;
    const matchThumb = currentPlayer.photoURLThumb || null;

    const profilePrimary = profile.primaryPosition || null;
    const matchPrimary = currentPlayer.primaryPosition || null;

    // Comparación básica de arrays para posiciones
    const profilePositions = JSON.stringify(profile.positions || []);
    const matchPositions = JSON.stringify(currentPlayer.positions || []);

    const needsSync = profilePhoto !== matchPhoto ||
      profileThumb !== matchThumb ||
      profilePrimary !== matchPrimary ||
      profilePositions !== matchPositions;

    if (needsSync) {
      const syncPlayerData = async () => {
        try {
          const updatedPlayers = match.players.map((p: Player) =>
            p.uid === user.uid ? {
              ...p,
              photoURL: profilePhoto,
              photoURLThumb: profileThumb,
              primaryPosition: profile.primaryPosition || p.primaryPosition,
              positions: profile.positions && profile.positions.length > 0 ? profile.positions : p.positions
            } : p
          );
          await updateDoc(doc(db, "matches", id), { players: updatedPlayers });
        } catch (err) {
          console.error("Error syncing player data:", err);
        }
      };
      syncPlayerData();
    }
  }, [user, profile, match, id]);

  useEffect(() => {
    if (!match?.locationId) return;

    getDoc(doc(db, "locations", match.locationId))
      .then(snap => {
        if (snap.exists()) {
          setMatchLocation({ id: snap.id, ...snap.data() } as Location);
        }
      });
  }, [match]);

  useEffect(() => {
    if (!match) return;
    setOrganizerPhone(match.creatorSnapshot?.phone || null);
  }, [match]);


  // 🔥 Reactive Push Trigger
  // Movido al inicio para cumplir las Rules of Hooks (sin early returns previos)
  useEffect(() => {
    if (!match || match.status !== "closed" || match.remindersSent?.mvp === true) return;

    const { votingClosed } = calculateMvpStatus(match);
    if (votingClosed) {
      triggerMvpNotification(id).catch(() => { });
    }
  }, [match, id]);

  // ⏳ Auth o perfil cargando
  if (loading) {
    return <JoinSkeleton />;
  }

  // 🔐 No logueado
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
          {/* LOGO */}
          <div className="mb-6 flex justify-center">
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ height: "auto", width: "auto" }}
              unoptimized
            />
          </div>

          {/* TÍTULO */}
          <h1 className="text-3xl font-bold text-[#1f7a4f] mb-3">
            Únete al partido
          </h1>

          {/* DESCRIPCIÓN */}
          {inApp ? (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 mb-8 text-sm text-left shadow-sm">
              <strong className="block mb-2 flex items-center gap-2 text-blue-800">
                <span className="text-lg">📋</span> Abre el link en tu navegador
              </strong>
              <p className="leading-relaxed mb-2">
                Parece que abriste este link desde <strong>WhatsApp, Instagram u otra app</strong>. Estos navegadores internos no permiten iniciar sesión con Google.
              </p>
              <p className="leading-relaxed mb-3">
                Para continuar, elige una de estas opciones:
              </p>
              <ol className="list-decimal list-inside space-y-1 mb-3 text-blue-800 font-medium">
                <li>Tocá los <strong>tres puntos ⋮</strong> y selecciona <strong>&quot;Abrir en el navegador&quot;</strong></li>
                <li>O copiá el link y pegalo en <strong>Chrome</strong> o <strong>Safari</strong></li>
              </ol>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
              >
                {isCopied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ¡Link copiado!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    Copiar link
                  </>
                )}
              </button>
            </div>
          ) : (
            <p className="text-slate-500 mb-8 leading-relaxed">
              Inicia sesión para confirmar tu asistencia al partido.
            </p>
          )}

          {/* BOTÓN GOOGLE */}
          <button
            onClick={() => {
              if (inApp || isInAppBrowser()) {
                setInApp(true);
                return;
              }
              loginWithGoogle().catch(console.error);
            }}
            disabled={inApp}
            className={`w-full bg-white border-2 rounded-xl py-3.5 px-6 text-base font-bold flex items-center justify-center gap-3 transition-all ${inApp
              ? "border-slate-100 text-slate-300 cursor-not-allowed opacity-50"
              : "border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-[#1f7a4f] hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className={inApp ? "grayscale opacity-50" : ""}>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar con Google
          </button>

          {/* FOOTER */}
          <p className="text-xs text-slate-400 mt-6 leading-relaxed">
            Al continuar, aceptas nuestros términos de servicio y política de
            privacidad.
          </p>
        </div>
      </div>
    );
  }

  // 🚨 PERFIL INCOMPLETO → Mostrar pantalla de redirección
  if (
    profile &&
    profile.roles.includes("player") &&
    (!profile.positions || profile.positions.length === 0)
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ height: "auto", width: "auto" }}
              unoptimized
            />
          </div>
          <p className="text-lg text-slate-500 font-medium">Redirigiendo a tu perfil...</p>
        </div>
      </div>
    );
  }

  // 📱 TELÉFONO FALTANTE → Mostrar pantalla de redirección
  if (
    profile &&
    profile.roles.includes("player") &&
    profile.positions?.length > 0 &&
    !profile.phone
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ height: "auto", width: "auto" }}
              unoptimized
            />
          </div>
          <p className="text-lg text-slate-500 font-medium">Necesitamos tu número de teléfono...</p>
        </div>
      </div>
    );
  }

  // ❌ Error real
  if (error) {
    return (
      <main className="p-5 flex items-center justify-center min-h-screen bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-red-100 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-slate-800 font-bold">{error}</p>
        </div>
      </main>
    );
  }

  // ⏳ Partido cargando
  if (!match) {
    return <JoinSkeleton />;
  }

  const playerName = profile?.name || user.displayName || user.email || "Jugador";
  const isClosed = match.status === "closed";
  const guestCount = match.guests?.filter((g: Guest) => !g.isWaitlist).length ?? 0;
  const confirmedCount = match.players.filter((p: Player) => p.confirmed).length + guestCount;
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);
  const hasWaitlist =
    (match.players?.some((p: Player) => p.isWaitlist && !p.confirmed) || false) ||
    (match.guests?.some((g: Guest) => g.isWaitlist && !g.confirmed) || false);

  const existingPlayer = match.players?.find(
    (p: Player) => p.uid === user.uid || p.name === playerName
  );

  const maxPlayers = match.maxPlayers ?? 0;
  const sidePlayers =
    maxPlayers && maxPlayers % 2 === 0 ? Math.min(maxPlayers / 2, 11) : null;

  const matchLabel = sidePlayers
    ? `Partido ${sidePlayers} vs ${sidePlayers}`
    : "Partido";

  // MVP Logic
  const myVote = match.mvpVotes?.[user.uid] || null;
  const eligiblePlayersAndGuests: Player[] = [
    ...(match.players?.filter((p: Player) => p.confirmed) || []),
    ...(match.guests?.filter((g: Guest) => !g.isWaitlist).map((g: Guest) => guestToPlayer(g, 2)) || [])
  ];

  const {
    currentMVPs,
    votingClosed,
    sortedMVPLeaderboard,
    voteCounts,
  } = calculateMvpStatus(match);

  const handlePromoteGuest = async (guestName: string, inviterUid: string) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await promoteGuestToMatch(id, guestName, inviterUid);
      toast.success(`Invitado ${guestName} ascendido a titular`);
    } catch (err: unknown) {
      handleError(err, "Error al promover invitado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto">
        {/* HEADER VERDE */}
        <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white px-4 pt-4 pb-8 rounded-b-2xl shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
          <div className="relative flex justify-between items-center">
            <h2 className="font-bold text-lg text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-white/90" />
              {matchLabel}
              {match.isPrivate && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white/70 flex items-center gap-1 border border-white/20">
                  <Lock className="w-3 h-3" /> Privado
                </span>
              )}
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${isClosed ? "bg-slate-500/60 text-white" : "bg-white text-emerald-700"}`}>
              {isClosed ? "Completado" : "Abierto"}
            </span>
          </div>
        </div>

        {/* CONTAINER CON MARGIN NEGATIVO PARA QUE MONTE EL HEADER */}
        <div className="px-4 -mt-5 relative z-20 space-y-4">

          {/* BOTÓN VER COMO ADMIN */}
          {profile && isAdmin(profile) && (
            <Link
              href={`/match/${id}`}
              className="flex items-center justify-center gap-2 w-full py-3 bg-slate-800 text-white font-bold rounded-xl shadow-md hover:bg-slate-700 transition-colors"
            >
              👁️ Ver como admin
            </Link>
          )}

          {/* CARD PARTIDO */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden" onClick={() => { setShowOrganizerTooltip(false); setShowCodeTooltip(false); }}>
            <div className="space-y-3 px-4 py-3">
              {/* Fecha y hora en una sola línea */}
              <div className="flex items-center gap-3 text-slate-600">
                <Calendar size={18} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 font-medium">
                  {formatDateShort(match.date)}
                  <span className="text-slate-300 mx-2">·</span>
                  <span className="font-bold">{formatTime12h(match.time)}</span>
                  {match.duration ? (
                    <span className="text-slate-400 font-normal ml-1.5 italic">
                      hasta {formatEndTime(match.time, match.duration)}
                    </span>
                  ) : ""}
                </span>
              </div>

              {/* Ubicación */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (!isMapOpen) logMatchMapOpened(id);
                    setIsMapOpen(!isMapOpen);
                  }}
                  className="flex items-center gap-3 text-slate-600 w-full text-left group"
                >
                  <MapPin size={18} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700 text-sm flex-1 text-left font-medium">
                    {matchLocation?.name || match.locationSnapshot?.name || "Cancha no disponible"}
                  </span>
                  <span className={`w-28 justify-center flex items-center gap-1.5 py-1 px-2.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${isMapOpen ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-600 group-hover:bg-slate-100"}`}>
                    <Map className="w-3 h-3" />
                    {isMapOpen ? "Ocultar" : "Ver mapa"}
                  </span>
                </button>

                {/* MAPA EXPANDIBLE */}
                {isMapOpen && matchLocation && (
                  <div className="mt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-xs text-slate-500 mb-2 ml-10">{matchLocation.address}</p>
                    <iframe
                      src={googleMapsEmbedUrl(matchLocation.lat, matchLocation.lng)}
                      width="100%"
                      height="200"
                      className="rounded-xl border-0 bg-slate-100 mb-2"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <div className="flex gap-2">
                      <a
                        href={googleMapsLink(matchLocation.lat, matchLocation.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => logMatchMapDirectionClicked(id, "google")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Image src="/icons/google-maps.svg" alt="G" width={16} height={16} className="w-4 h-4" unoptimized />
                        Maps
                      </a>
                      <a
                        href={wazeLink(matchLocation.lat, matchLocation.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => logMatchMapDirectionClicked(id, "waze")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Image src="/icons/waze.svg" alt="W" width={16} height={16} className="w-4 h-4" unoptimized />
                        Waze
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Organizador */}
              {match.creatorSnapshot?.name && (
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="relative shrink-0 flex items-center">
                    <User size={18} className="text-slate-400 shrink-0" />
                    <AnimatePresence>
                      {showOrganizerTooltip && (
                        <motion.div
                          initial={{ opacity: 0, y: 4, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full mb-3 left-0 w-52 bg-slate-800 text-white text-[11px] rounded-xl px-3 py-2.5 shadow-xl z-50 leading-relaxed pointer-events-none"
                        >
                          <p className="font-bold text-emerald-400 mb-1">Organizador</p>
                          <p className="text-slate-300">Quien creó el partido. Puedes contactarlo por WhatsApp si tienes dudas.</p>
                          <div className="absolute top-full left-4 border-4 border-transparent border-t-slate-800" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowOrganizerTooltip(p => !p); setShowCodeTooltip(false); }}
                    className="text-slate-700 text-sm flex-1 text-left font-medium"
                  >
                    {match.creatorSnapshot.name}
                  </button>
                  {organizerPhone && match.createdBy !== user.uid && (
                    <a
                      href={`https://wa.me/${organizerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola! Te escribo por el partido del ${formatDateSpanish(match.date)} a las ${formatTime12h(match.time)}, código ${id}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => logOrganizerContacted(id)}
                      className="w-28 justify-center flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-transparent bg-[#25D366] text-white text-xs font-medium hover:bg-[#1ebe5d] transition-colors shrink-0"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </svg>
                      Contactar
                    </a>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 text-slate-600">
                <div className="relative shrink-0 flex items-center">
                  <Key size={18} className="text-slate-400 shrink-0" />
                  <AnimatePresence>
                    {showCodeTooltip && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-3 left-0 w-52 bg-slate-800 text-white text-[11px] rounded-xl px-3 py-2.5 shadow-xl z-50 leading-relaxed pointer-events-none"
                      >
                        <p className="font-bold text-emerald-400 mb-1">Código del partido</p>
                        <p className="text-slate-300">Identificador único del partido. Compártelo para que otros jugadores puedan unirse.</p>
                        <div className="absolute top-full left-4 border-4 border-transparent border-t-slate-800" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCodeTooltip(p => !p); setShowOrganizerTooltip(false); }}
                  className="font-mono text-slate-600 text-sm flex-1 text-left truncate font-medium"
                >
                  {id}
                </button>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(id);
                    logMatchCodeCopied(id);
                    setIsCodeCopied(true);
                    setTimeout(() => setIsCodeCopied(false), 2500);
                  }}
                  className={`w-28 justify-center flex items-center gap-1.5 py-1 px-2.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${isCodeCopied
                    ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                >
                  {isCodeCopied
                    ? <><Check className="w-3 h-3" /> Copiado</>
                    : <><Copy className="w-3 h-3" /> Copiar</>
                  }
                </button>
              </div>

            </div>
          </div>

          {/* TIMELINE DEL PARTIDO */}
          <MatchTimeline match={match} confirmedCount={confirmedCount} />

          {/* CARD ASISTENCIA - Solo si partido abierto y equipos no definidos */}
          {!isClosed && !match.teamsConfirmed && (
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">

              {/* ── Estado: Partido lleno, usuario no registrado ── */}
              {isFull && !existingPlayer && (
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-amber-700 text-sm font-semibold flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> Partido lleno — anotate como suplente
                </div>
              )}

              {/* ── Estado: Hay lista de espera activa, usuario no registrado ── */}
              {!isFull && hasWaitlist && !existingPlayer && (
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-amber-700 text-sm font-semibold flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" /> Hay jugadores en lista de espera — anotate como suplente
                </div>
              )}

              {/* ── Estado: Perdiste tu lugar ── */}
              {isFull && existingPlayer && !existingPlayer.confirmed && !existingPlayer.isWaitlist && (
                <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-red-600 text-sm font-semibold flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" /> Perdiste tu lugar reservado
                </div>
              )}

              {/* ── CTA: Ingresar como Suplente ── */}
              {(isFull || hasWaitlist) && (!existingPlayer || (!existingPlayer.confirmed && !existingPlayer.isWaitlist)) && (
                <button
                  disabled={submitting}
                  onClick={() => {
                    setPendingJoinAction(() => async () => {
                      await joinWaitlist(id, { uid: user.uid, name: playerName });
                    });
                    setIsWaitlistModal(true);
                    setShowJoinModal(true);
                  }}
                  className={`w-full py-3 font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${submitting
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                    }`}
                >
                  <ClipboardList className="w-4 h-4" /> Ingresar como Suplente
                </button>
              )}

              {/* ── CTA: Confirmar asistencia (primera vez) ── */}
              {!isFull && !hasWaitlist && !existingPlayer && (
                <button
                  disabled={submitting}
                  onClick={() => {
                    setPendingJoinAction(() => async () => {
                      await joinMatch(id, { uid: user.uid, name: playerName });
                    });
                    setShowJoinModal(true);
                  }}
                  className={`w-full py-3.5 font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${submitting
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                    }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> Anotarme al partido
                </button>
              )}

              {/* ── CTA: Confirmar asistencia (ya en lista, no confirmado) ── */}
              {!isFull && existingPlayer && !existingPlayer.confirmed && !existingPlayer.isWaitlist && (
                <>
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0" /> Aún no confirmaste
                  </div>
                  <button
                    disabled={submitting}
                    onClick={() => {
                      setPendingJoinAction(() => async () => {
                        await confirmAttendance(id, playerName);
                      });
                      setShowJoinModal(true);
                    }}
                    className={`w-full py-3.5 font-bold text-base transition-all active:scale-[0.98] ${submitting
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                      }`}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Anotarme al partido
                  </button>
                </>
              )}

              {/* ── CTA: En lista de espera ── */}
              {existingPlayer?.isWaitlist && !existingPlayer.confirmed && (
                <>
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center gap-2">
                    <ClipboardList className="w-3.5 h-3.5 shrink-0" /> Estás en lista de espera
                  </div>
                  <button
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        await leaveWaitlist(id, playerName);
                        logWaitlistLeft(id);
                        toast.success("Has salido de la lista de espera");
                      } catch (err: unknown) {
                        handleError(err, "Hubo un error al salir de la lista de espera");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="w-full py-2.5 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Salir de la lista de espera
                  </button>
                </>
              )}

              {/* ── Estado: CONFIRMADO — fila compacta ── */}
              {existingPlayer?.confirmed && (
                <>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      Estás confirmado
                    </span>
                    <button
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await unconfirmAttendance(id, playerName);
                          logAttendanceUnconfirmed(id);
                          toast.success("Has liberado tu cupo");
                        } catch (err: unknown) {
                          handleError(err, "Hubo un error al liberar tu cupo");
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      disabled={submitting}
                      className="text-xs text-red-500 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 font-semibold transition-colors flex items-center gap-1 disabled:opacity-40"
                    >
                      Cancelar asistencia <CalendarX className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* ── Fila Agregar Invitado (inline, dentro del mismo card) ── */}
                  {match.allowGuests !== false && (
                    <div className="border-t border-slate-100">
                      <AddGuestForm
                        matchId={id}
                        playerUid={user.uid}
                        existingGuests={match.guests?.filter((g: Guest) => g.invitedBy === user.uid) || []}
                        onSuccess={() => { /* snapshot auto-refreshes */ }}
                      />
                    </div>
                  )}
                </>
              )}

            </div>
          )}




          {/* LISTA DE JUGADORES, EQUIPOS CONFIRMADOS O REPORTE */}
          {isClosed && match.teams ? (() => {
            // LOGICA RESULTADO PERSONAL
            const userInTeamA = match.teams.A?.some((p: Player) => p.uid === user.uid);
            const userInTeamB = match.teams.B?.some((p: Player) => p.uid === user.uid);

            const scoreA = match.score?.A ?? 0;
            const scoreB = match.score?.B ?? 0;

            let resultMessage = "";
            let resultColor = "";
            let resultBg = "";

            if (userInTeamA) {
              if (scoreA > scoreB) {
                resultMessage = "¡Ganaste! 🎉";
                resultColor = "text-emerald-700";
                resultBg = "bg-emerald-100";
              } else if (scoreA < scoreB) {
                resultMessage = "Partido difícil 😔";
                resultColor = "text-red-700";
                resultBg = "bg-red-100";
              } else {
                resultMessage = "Empate 🤝";
                resultColor = "text-amber-700";
                resultBg = "bg-amber-100";
              }
            } else if (userInTeamB) {
              if (scoreB > scoreA) {
                resultMessage = "¡Ganaste! 🎉";
                resultColor = "text-emerald-700";
                resultBg = "bg-emerald-100";
              } else if (scoreB < scoreA) {
                resultMessage = "Partido difícil 😔";
                resultColor = "text-red-700";
                resultBg = "bg-red-100";
              } else {
                resultMessage = "Empate 🤝";
                resultColor = "text-amber-700";
                resultBg = "bg-amber-100";
              }
            }

            return (
              <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6">


                <h3 className="font-bold text-slate-800 mb-6 text-center text-lg flex flex-col items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" /><span>Resultado del Partido</span>
                  {resultMessage && (
                    <span className={`text-sm px-3 py-1 rounded-full ${resultBg} ${resultColor} border border-current opacity-80`}>
                      {resultMessage}
                    </span>
                  )}
                </h3>

                {/* MARCADOR */}
                {match.score && (
                  <div className="flex justify-center items-center gap-6 mb-8 bg-slate-50 py-4 rounded-xl border border-slate-100">
                    <div className="text-center">
                      <div className="text-4xl font-black text-red-600 mb-1">{match.score.A}</div>
                      <div className="text-xs font-bold text-red-800/60 uppercase tracking-widest">Equipo A</div>
                    </div>
                    <div className="text-2xl font-black text-slate-300">-</div>
                    <div className="text-center">
                      <div className="text-4xl font-black text-blue-600 mb-1">{match.score.B}</div>
                      <div className="text-xs font-bold text-blue-800/60 uppercase tracking-widest">Equipo B</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* EQUIPO A */}
                  <div className={`rounded-xl p-4 border ${userInTeamA ? "bg-red-100 border-red-300 ring-2 ring-red-200" : "bg-red-50 border-red-100"}`}>
                    <h4 className="font-bold text-red-800 mb-3 text-sm uppercase tracking-wide border-b border-red-200 pb-2 flex justify-between">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" /> Equipo A {userInTeamA && "(Tú)"}</span>
                      <span className="text-red-500 opacity-60 text-xs">{match.teams.A.length} jug.</span>
                    </h4>
                    <div className="space-y-2">
                      {[...match.teams.A].sort((a: Player, b: Player) => {
                        const ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
                        const posA = ORDER[a.primaryPosition ?? a.positions?.[0] ?? "MID"] ?? 2;
                        const posB = ORDER[b.primaryPosition ?? b.positions?.[0] ?? "MID"] ?? 2;
                        return posA - posB;
                      }).map((p: Player, i: number) => {
                        const targetId = p.uid || p.name;
                        const isMvp = currentMVPs.includes(targetId);
                        const votes = voteCounts[targetId] || 0;
                        const fullPlayerA = match.players?.find((mp: Player) => mp.uid === p.uid);
                        const photoURL = p.photoURL || fullPlayerA?.photoURL;
                        const photoURLThumb = p.photoURLThumb || fullPlayerA?.photoURLThumb;
                        const primaryPosition = p.primaryPosition || fullPlayerA?.primaryPosition;

                        return (
                          <div key={i} className={`flex items-center justify-between p-1.5 rounded-lg ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border border-amber-100" : ""}`}>
                            <div className="flex items-center gap-2">
                              <div className={`relative shrink-0 ${p.uid ? "cursor-pointer" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                                {(photoURLThumb ?? photoURL) ? (
                                  <div className="w-7 h-7 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                                    <Image src={photoURLThumb ?? photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                                  </div>
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-white text-red-700 flex items-center justify-center text-[10px] font-black shadow-sm ring-1 ring-red-100 shrink-0">
                                    {p.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-slate-50 z-10 font-bold">
                                  {POSITION_ICONS[(primaryPosition || (p.positions?.[0] as Position) || "MID")]}
                                </div>
                              </div>
                              <span className={`text-sm font-medium ${p.uid === user.uid ? "text-red-900 font-bold" : "text-slate-700"} ${p.uid ? "underline decoration-slate-300 underline-offset-2 cursor-pointer active:text-red-700" : ""}`} onClick={() => handlePlayerTap(p.uid)}>{p.name}</span>
                              {isMvp && <Crown className={`w-4 h-4 text-amber-500 ${votingClosed ? "" : "animate-pulse"}`} aria-label={`MVP Actual con ${votes} votos`} />}
                            </div>
                            {votes > 0 && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{votes} v.</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* EQUIPO B */}
                  <div className={`rounded-xl p-4 border ${userInTeamB ? "bg-blue-100 border-blue-300 ring-2 ring-blue-200" : "bg-blue-50 border-blue-100"}`}>
                    <h4 className="font-bold text-blue-800 mb-3 text-sm uppercase tracking-wide border-b border-blue-200 pb-2 flex justify-between">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" /> Equipo B {userInTeamB && "(Tú)"}</span>
                      <span className="text-blue-500 opacity-60 text-xs">{match.teams.B.length} jug.</span>
                    </h4>
                    <div className="space-y-2">
                      {[...match.teams.B].sort((a: Player, b: Player) => {
                        const ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
                        const posA = ORDER[a.primaryPosition ?? a.positions?.[0] ?? "MID"] ?? 2;
                        const posB = ORDER[b.primaryPosition ?? b.positions?.[0] ?? "MID"] ?? 2;
                        return posA - posB;
                      }).map((p: Player, i: number) => {
                        const targetId = p.uid || p.name;
                        const isMvp = currentMVPs.includes(targetId);
                        const votes = voteCounts[targetId] || 0;
                        const fullPlayerB = match.players?.find((mp: Player) => mp.uid === p.uid);
                        const photoURL = p.photoURL || fullPlayerB?.photoURL;
                        const photoURLThumb = p.photoURLThumb || fullPlayerB?.photoURLThumb;
                        const primaryPosition = p.primaryPosition || fullPlayerB?.primaryPosition;

                        return (
                          <div key={i} className={`flex items-center justify-between p-1.5 rounded-lg ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border border-amber-100" : ""}`}>
                            <div className="flex items-center gap-2">
                              <div className={`relative shrink-0 ${p.uid ? "cursor-pointer" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                                {(photoURLThumb ?? photoURL) ? (
                                  <div className="w-7 h-7 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                                    <Image src={photoURLThumb ?? photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                                  </div>
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-white text-blue-700 flex items-center justify-center text-[10px] font-black shadow-sm ring-1 ring-blue-100 shrink-0">
                                    {p.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-slate-50 z-10 font-bold">
                                  {POSITION_ICONS[(primaryPosition || (p.positions?.[0] as Position) || "MID")]}
                                </div>
                              </div>
                              <span className={`text-sm font-medium ${p.uid === user.uid ? "text-blue-900 font-bold" : "text-slate-700"} ${p.uid ? "underline decoration-slate-300 underline-offset-2 cursor-pointer active:text-blue-700" : ""}`} onClick={() => handlePlayerTap(p.uid)}>{p.name}</span>
                              {isMvp && <Crown className={`w-4 h-4 text-amber-500 ${votingClosed ? "" : "animate-pulse"}`} aria-label={`MVP Actual con ${votes} votos`} />}
                            </div>
                            {votes > 0 && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{votes} v.</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>


                {/* MVP VOTING CARD - DENTRO DEL BLOQUE DE RESULTADOS */}
                {isClosed && (existingPlayer?.confirmed || match.createdBy === user.uid) && (
                  <div className="mt-8 p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 shadow-sm relative overflow-hidden">
                    <div className="absolute -top-6 -right-6 opacity-10"><Crown className="w-16 h-16 text-amber-500" /></div>
                    <h4 className="font-bold text-amber-900 mb-4 flex items-center gap-2 relative z-10">
                      {votingClosed ? <><Crown className="w-4 h-4 text-amber-500" /> MVP del Partido</> : <><Trophy className="w-4 h-4 text-amber-500" /> Elige al MVP del Partido</>}
                    </h4>

                    {myVote && !votingClosed && (
                      <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded mb-4 relative z-10 border border-emerald-100 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Tu voto ha sido registrado.
                      </p>
                    )}

                    {(!votingClosed && !myVote) && (
                      <p className="text-xs text-amber-700/80 mb-4 relative z-10 font-medium">
                        ¡Reconoce a la figura de hoy! Tu voto es <strong className="font-bold underline">definitivo</strong>.
                      </p>
                    )}

                    <div className="relative z-10">
                      {(myVote || votingClosed) ? (
                        <div className="space-y-3">
                          {votingClosed && currentMVPs.length > 1 && (
                            <div className="bg-amber-100/50 flex items-center justify-center gap-2 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium mb-4">
                              <Star className="w-3.5 h-3.5 shrink-0" /> ¡Empate! Hoy se comparte el podio.
                            </div>
                          )}
                          {votingClosed && currentMVPs.length === 1 && (
                            <div className="bg-amber-100/50 flex items-center justify-center gap-2 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium mb-4">
                              <Crown className="w-3.5 h-3.5 shrink-0" /> ¡Ya tenemos la figura de la canchita!
                            </div>
                          )}
                          {sortedMVPLeaderboard.slice(0, 3).map(([targetId, votes]: [string, number], idx: number) => {
                            const player = eligiblePlayersAndGuests.find(p => p.uid === targetId || p.name === targetId) as Player;
                            if (!player) return null;
                            const isMyVote = myVote === targetId;
                            const isWinner = currentMVPs.includes(targetId);

                            return (
                              <div key={targetId}
                                className={`flex items-center justify-between p-4 rounded-2xl relative overflow-hidden transition-all duration-300
                                      ${isWinner
                                    ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 ring-2 ring-yellow-400 shadow-md transform hover:scale-[1.02]'
                                    : isMyVote
                                      ? 'bg-amber-50 border border-amber-200 ring-1 ring-amber-300 shadow-sm'
                                      : 'bg-white border border-slate-100 hover:border-slate-300'}`}>

                                {isWinner && (
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full blur-2xl -mr-10 -mt-10 animate-pulse"></div>
                                )}

                                <div className="flex items-center gap-4 relative z-10">
                                  <div
                                    className={`relative z-10 ${player.uid && !player.uid.startsWith("guest_") ? "cursor-pointer" : ""}`}
                                    onClick={() => { if (player.uid && !player.uid.startsWith("guest_")) handlePlayerTap(player.uid); }}
                                  >
                                    <div className="relative">
                                      {(player.photoURLThumb ?? player.photoURL) ? (
                                        <div className={`w-14 h-14 rounded-full overflow-hidden relative border-2 ${isWinner ? 'border-amber-400' : 'border-slate-200'} shadow-md`}>
                                          <Image src={player.photoURLThumb ?? player.photoURL!} alt={player.name} fill className="object-cover" sizes="96px" unoptimized />
                                        </div>
                                      ) : (
                                        <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-xl shadow-inner
                                            ${isWinner ? 'bg-amber-100/50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-400'}`}>
                                          {isWinner ? <Crown className={`w-6 h-6 text-amber-500 ${votingClosed ? "" : "animate-bounce"}`} /> : idx + 1}
                                        </div>
                                      )}
                                      <div className={`absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs shadow-md border font-bold z-10
                                          ${isWinner ? 'border-amber-300' : 'border-slate-100'}`}>
                                        {POSITION_ICONS[player.primaryPosition || (player.positions?.[0] as Position) || "MID"]}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col">
                                    <span
                                      className={`font-black text-lg tracking-tight ${isWinner ? 'text-amber-900' : 'text-slate-800'} ${player.uid && !player.uid.startsWith("guest_") ? "underline decoration-slate-300 underline-offset-2 cursor-pointer" : ""}`}
                                      onClick={() => { if (player.uid && !player.uid.startsWith("guest_")) handlePlayerTap(player.uid); }}
                                    >
                                      {player.name} {player.uid?.startsWith("guest_") && <span className="text-xs font-medium opacity-70">(Inv)</span>}
                                    </span>
                                    {isMyVote && (
                                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded flex w-fit mt-0.5 tracking-wider
                                          ${isWinner ? 'bg-amber-200 text-amber-800' : 'bg-amber-100 text-amber-700'}`}>
                                        Tu voto
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className={`flex flex-col items-end relative z-10 ${isWinner ? 'text-amber-900' : 'text-slate-600'}`}>
                                  <span className="font-black text-3xl leading-none">{votes}</span>
                                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isWinner ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {votes === 1 ? 'Voto' : 'Votos'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {sortedMVPLeaderboard.length === 0 && (
                            <div className="text-center p-4 text-sm text-slate-500 bg-white/50 rounded-xl border border-slate-100">
                              Nadie ha recibido votos aún.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {[
                            { key: "A", title: "Equipo A", color: "bg-red-500", players: match.teams?.A || [] },
                            { key: "B", title: "Equipo B", color: "bg-blue-500", players: match.teams?.B || [] }
                          ].map(({ key, title, color, players }) => {
                            // Convert back to MVP-eligible subset
                            const teamEligible = (players as Player[]).filter(p => p.uid !== user.uid && eligiblePlayersAndGuests.some(e => e.uid === p.uid || e.name === p.name));
                            if (teamEligible.length === 0) return null;

                            return (
                              <div key={key} className="space-y-2">
                                <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1 flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${color}`} />{title}
                                </h5>
                                <div className="grid grid-cols-2 gap-2">
                                  {teamEligible.map(p => {
                                    const targetId = p.uid || p.name;
                                    const isSelected = myVote === targetId;
                                    const fullPlayerMvp = match.players?.find((mp: Player) => mp.uid === p.uid);
                                    const photoURL = p.photoURL || fullPlayerMvp?.photoURL;
                                    const photoURLThumb = p.photoURLThumb || fullPlayerMvp?.photoURLThumb;
                                    const primaryPosition = p.primaryPosition || fullPlayerMvp?.primaryPosition;

                                    return (
                                      <button
                                        key={targetId}
                                        disabled={votingClosed || submittingVote || !!myVote}
                                        onClick={async () => {
                                          if (votingClosed || myVote) return;
                                          if (!confirm("¿Estás seguro de tu voto por " + p.name + "?\n\nSolo puedes emitir tu voto UNA vez y es definitivo.")) return;

                                          setSubmittingVote(true);
                                          try {
                                            await voteForMVP(id, user.uid, targetId);
                                            logMvpVoted(id, targetId);
                                            toast.success("Tu voto ha sido registrado");
                                          } catch (err: unknown) {
                                            handleError(err, "Hubo un error al registrar tu voto");
                                          } finally {
                                            setSubmittingVote(false);
                                          }
                                        }}
                                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${isSelected
                                          ? "bg-amber-500 border-amber-600 text-white shadow-inner font-bold"
                                          : (votingClosed || myVote)
                                            ? "bg-white/50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                            : "bg-white border-amber-200 text-slate-700 hover:bg-amber-100 hover:scale-105 active:scale-95"
                                          }`}
                                      >
                                        <div
                                          className={`relative shrink-0 ${p.uid && !p.uid.startsWith("guest_") ? "cursor-pointer" : ""}`}
                                          onClick={e => { e.stopPropagation(); if (p.uid && !p.uid.startsWith("guest_")) handlePlayerTap(p.uid); }}
                                        >
                                          {(photoURLThumb ?? photoURL) ? (
                                            <div className="w-6 h-6 rounded-full overflow-hidden relative border border-slate-200">
                                              <Image src={photoURLThumb ?? photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                                            </div>
                                          ) : (
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${isSelected ? "bg-white text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                                              {p.name.charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center text-[7px] shadow-sm border border-amber-50 z-10 font-black">
                                            {POSITION_ICONS[(primaryPosition || (p.positions?.[0] as Position) || "MID")]}
                                          </div>
                                        </div>
                                        <span className="text-xs truncate">{p.name} {p.uid?.startsWith("guest_") && "(Inv)"}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            );
          })() : match.teamsConfirmed && match.teams ? (() => {
            const userInTeamA = match.teams!.A?.some((p: Player) => p.uid === user.uid);
            const userInTeamB = match.teams!.B?.some((p: Player) => p.uid === user.uid);

            return (
              <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6">
                <h3 className="font-bold text-slate-800 mb-4 text-center text-lg">
                  Equipos definidos
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* EQUIPO A */}
                  <div className={`rounded-xl p-4 border ${userInTeamA ? "bg-red-100 border-red-300 ring-2 ring-red-200" : "bg-red-50 border-red-100"}`}>
                    <h4 className="font-bold text-red-800 mb-3 text-sm uppercase tracking-wide border-b border-red-200 pb-2 flex justify-between">
                      <span>Equipo A {userInTeamA && "(Tú)"}</span>
                      <span className="text-red-500 opacity-60 text-xs">{match.teams!.A.length} jug.</span>
                    </h4>
                    <div className="space-y-2">
                      {[...match.teams!.A].sort((a: Player, b: Player) => {
                        const ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
                        const posA = ORDER[a.primaryPosition ?? a.positions?.[0] ?? "MID"] ?? 2;
                        const posB = ORDER[b.primaryPosition ?? b.positions?.[0] ?? "MID"] ?? 2;
                        return posA - posB;
                      }).map((p: Player, i: number) => {
                        const fullPlayerA = match.players?.find((mp: Player) => mp.uid === p.uid);
                        const photoURL = p.photoURL || fullPlayerA?.photoURL;
                        const photoURLThumb = p.photoURLThumb || fullPlayerA?.photoURLThumb;
                        const primaryPosition = p.primaryPosition || fullPlayerA?.primaryPosition;

                        return (
                          <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg">
                            <div className={`relative shrink-0 ${p.uid ? "cursor-pointer" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                              {(photoURLThumb ?? photoURL) ? (
                                <div className="w-7 h-7 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                                  <Image src={photoURLThumb ?? photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-white text-red-700 flex items-center justify-center text-[10px] font-black shadow-sm ring-1 ring-red-100 shrink-0">
                                  {p.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-slate-50 z-10 font-bold">
                                {POSITION_ICONS[(primaryPosition || (p.positions?.[0] as Position) || "MID")]}
                              </div>
                            </div>
                            <span className={`text-sm font-medium ${p.uid === user.uid ? "text-red-900 font-bold" : "text-slate-700"} ${p.uid ? "underline decoration-slate-300 underline-offset-2 cursor-pointer active:text-red-700" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                              {p.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* EQUIPO B */}
                  <div className={`rounded-xl p-4 border ${userInTeamB ? "bg-blue-100 border-blue-300 ring-2 ring-blue-200" : "bg-blue-50 border-blue-100"}`}>
                    <h4 className="font-bold text-blue-800 mb-3 text-sm uppercase tracking-wide border-b border-blue-200 pb-2 flex justify-between">
                      <span>Equipo B {userInTeamB && "(Tú)"}</span>
                      <span className="text-blue-500 opacity-60 text-xs">{match.teams!.B.length} jug.</span>
                    </h4>
                    <div className="space-y-2">
                      {[...match.teams!.B].sort((a: Player, b: Player) => {
                        const ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
                        const posA = ORDER[a.primaryPosition ?? a.positions?.[0] ?? "MID"] ?? 2;
                        const posB = ORDER[b.primaryPosition ?? b.positions?.[0] ?? "MID"] ?? 2;
                        return posA - posB;
                      }).map((p: Player, i: number) => {
                        const fullPlayerB = match.players?.find((mp: Player) => mp.uid === p.uid);
                        const photoURL = p.photoURL || fullPlayerB?.photoURL;
                        const photoURLThumb = p.photoURLThumb || fullPlayerB?.photoURLThumb;
                        const primaryPosition = p.primaryPosition || fullPlayerB?.primaryPosition;

                        return (
                          <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg">
                            <div className={`relative shrink-0 ${p.uid ? "cursor-pointer" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                              {(photoURLThumb ?? photoURL) ? (
                                <div className="w-7 h-7 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
                                  <Image src={photoURLThumb ?? photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-white text-blue-700 flex items-center justify-center text-[10px] font-black shadow-sm ring-1 ring-blue-100 shrink-0">
                                  {p.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-slate-50 z-10 font-bold">
                                {POSITION_ICONS[(primaryPosition || (p.positions?.[0] as Position) || "MID")]}
                              </div>
                            </div>
                            <span className={`text-sm font-medium ${p.uid === user.uid ? "text-blue-900 font-bold" : "text-slate-700"} ${p.uid ? "underline decoration-slate-300 underline-offset-2 cursor-pointer active:text-blue-700" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                              {p.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" /> Jugadores
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">{confirmedCount} / {match.maxPlayers || "?"}</span>
                  </h3>
                  <div className="group relative flex items-center" tabIndex={0}>
                    <span className="cursor-pointer w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                      ?
                    </span>
                    <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-56 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50 text-left">
                      <div className="text-center font-bold text-slate-300 mb-1.5 border-b border-slate-700 pb-1.5">Posiciones de Juego</div>
                      <div className="mb-1"><span className="mr-2">🧤</span> Portero</div>
                      <div className="mb-1"><span className="mr-2">🛡️</span> Defensa</div>
                      <div className="mb-1"><span className="mr-2">⚙️</span> Medio</div>
                      <div><span className="mr-2">⚡</span> Delantero</div>
                      <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                  </div>
                </div>

                {confirmedCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        const locName = matchLocation?.name || match.locationSnapshot?.name || "Cancha por definir";
                        const text = buildRosterReport(match, locName, confirmedCount);

                        await navigator.clipboard.writeText(text);
                        logMatchReportCopied(id, "roster", "clipboard");
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2500);
                      }}
                      className={`p-1.5 px-2 rounded-lg transition-colors border flex items-center justify-center gap-1 shadow-sm font-bold flex-shrink-0 ${isCopied ? 'border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      title="Copiar lista"
                    >
                      {isCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      <span className="text-[10px] hidden sm:inline uppercase">{isCopied ? "Copiado" : "Copiar"}</span>
                    </button>
                    <button
                      onClick={() => {
                        const text = buildRosterReport(match, matchLocation?.name || match.locationSnapshot?.name || "Cancha por definir", confirmedCount);
                        logMatchReportCopied(id, "roster", "whatsapp");
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                      }}
                      className="p-1.5 px-2 rounded-lg transition-colors border flex items-center justify-center gap-1 shadow-sm font-bold flex-shrink-0 bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Compartir por WhatsApp"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-5 h-5" />
                      <span className="text-[10px] hidden sm:inline uppercase">WhatsApp</span>
                    </button>
                    <button
                      onClick={() => {
                        const text = buildRosterReportTelegram(match, matchLocation?.name || match.locationSnapshot?.name || "Cancha por definir", confirmedCount);
                        logMatchReportCopied(id, "roster", "telegram");
                        window.open(`https://t.me/share/url?url=%20&text=${encodeURIComponent(text)}`, "_blank");
                      }}
                      className="p-1.5 px-2 rounded-lg transition-colors border flex items-center justify-center gap-1 shadow-sm font-bold flex-shrink-0 bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Compartir por Telegram"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/telegram.svg" alt="Telegram" className="w-5 h-5" />
                      <span className="text-[10px] hidden sm:inline uppercase">Telegram</span>
                    </button>
                  </div>
                )}
              </div>

              {confirmedCount === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Aún no hay jugadores confirmados. ¡Sé el primero!</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* PLAYERS (Titulares) */}
                  {match.players?.filter((p: Player) => p.confirmed).map((p: Player, i: number) => (
                    <div key={`p-${i}`} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`relative shrink-0 ${p.uid ? "cursor-pointer" : ""}`} onClick={() => handlePlayerTap(p.uid)}>
                          {(p.photoURLThumb ?? p.photoURL) ? (
                            <div className="w-9 h-9 rounded-full overflow-hidden relative border border-emerald-200 shadow-sm">
                              <Image src={p.photoURLThumb ?? p.photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-black shadow-sm ring-1 ring-emerald-200">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center text-[10px] shadow-sm border border-slate-100 font-bold z-10">
                            {POSITION_ICONS[p.primaryPosition || (p.positions?.[0] as Position) || "MID"]}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className={`font-bold text-slate-800 text-sm ${p.uid ? "underline decoration-slate-300 underline-offset-2 cursor-pointer active:text-emerald-700" : ""}`} onClick={() => handlePlayerTap(p.uid)}>{p.name}</span>
                          {profile && isAdmin(profile) && p.phone && (
                            <a href={`tel:+57${p.phone}`} className="text-xs font-medium text-emerald-600 hover:underline flex items-center gap-1 mt-0.5">
                              📞 +57 {p.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600">
                        Confirmado
                      </span>
                    </div>
                  ))}

                  {/* GUESTS */}
                  {match.guests?.filter((g: Guest) => !g.isWaitlist).map((g: Guest, i: number) => {
                    const hostName = match.players?.find((p: Player) => p.uid === g.invitedBy)?.name;
                    const canDelete = !isClosed && (g.invitedBy === user?.uid || (profile && isAdmin(profile)));

                    return (
                      <div key={`g-${i}`} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black shrink-0 relative shadow-sm">
                            {g.name.charAt(0).toUpperCase()}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-purple-50 z-10 font-bold">
                              {POSITION_ICONS[g.primaryPosition || (g.positions?.[0] as Position) || "MID"]}
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 text-sm">{g.name}</span>
                            <span className="text-[10px] text-slate-400">
                              Invitado{hostName ? ` de ${hostName}` : ""}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canDelete && (
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Estás seguro de que deseas eliminar al invitado ${g.name}?`)) return;
                                try {
                                  await removeGuestFromMatch(id, g.invitedBy, g.name);
                                  logGuestRemoved(id);
                                  toast.success("Invitado cancelado");
                                } catch (err: unknown) {
                                  handleError(err, "Hubo un error al eliminar el invitado.");
                                }
                              }}
                              className="text-xs font-bold px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-600">
                            Confirmado
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* WAITLIST (SUPLENTES) DISPLAY */}
          {(!isClosed && ((match.players?.filter((p: Player) => p.isWaitlist && !p.confirmed).length || 0) > 0 || (match.guests?.filter((g: Guest) => g.isWaitlist && !g.confirmed).length || 0) > 0)) ? (() => {
            // Ordenar la lista de espera por fecha de ingreso para ser transparentes
            const waitlistPlayers: Player[] = [
              ...(match.players?.filter((p: Player) => p.isWaitlist && !p.confirmed) || []),
              ...(match.guests?.filter((g: Guest) => g.isWaitlist && !g.confirmed).map((g: Guest) => guestToPlayer(g, 2)) || [])
            ].sort((a: Player, b: Player) => {
              const tA = a.waitlistJoinedAt ? new Date(a.waitlistJoinedAt).getTime() : 0;
              const tB = b.waitlistJoinedAt ? new Date(b.waitlistJoinedAt).getTime() : 0;
              return tA - tB;
            });

            const maxP = match.maxPlayers ?? Infinity;
            const openSpots = maxP !== Infinity ? Math.max(0, maxP - confirmedCount) : Infinity;

            return (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6 mt-4 opacity-90">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-500" /> Lista de espera
                  <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-black">{waitlistPlayers.length}</span>
                </h3>
                <div className="divide-y divide-slate-100">
                  {waitlistPlayers.map((p: Player, i: number) => {
                    const isGuest = p.id?.startsWith("guest-");
                    let guestInviterUid = "";
                    let rawGuestName = "";
                    let guestHostName = "";
                    if (isGuest && p.id) {
                      guestInviterUid = p.id.split("-")[1];
                      rawGuestName = p.name.replace(" (inv)", "");
                      guestHostName = match.players?.find(player => player.uid === guestInviterUid)?.name || "";
                    }
                    const canPromote = isGuest && (user.uid === guestInviterUid || (profile && isAdmin(profile))) && openSpots > 0;

                    return (
                      <div key={`wl-${i}`} className="py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`relative shrink-0 ${!isGuest && p.uid ? "cursor-pointer" : ""}`} onClick={() => !isGuest && handlePlayerTap(p.uid)}>
                            {(p.photoURLThumb ?? p.photoURL) ? (
                              <div className="w-8 h-8 rounded-full overflow-hidden relative border border-amber-200 ring-1 ring-amber-100 shadow-sm">
                                <Image src={p.photoURLThumb ?? p.photoURL!} alt={p.name} fill className="object-cover" sizes="48px" unoptimized />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-bold ring-1 ring-amber-200">
                                #{i + 1}
                              </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-amber-100 z-10 font-bold">
                              {POSITION_ICONS[(p.primaryPosition || (p.positions?.[0] as Position) || "MID")]}
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className={`font-bold text-slate-700 text-sm ${!isGuest && p.uid ? "underline decoration-slate-300 underline-offset-2 cursor-pointer active:text-amber-700" : ""}`} onClick={() => !isGuest && handlePlayerTap(p.uid)}>
                              {isGuest ? rawGuestName : p.name} {p.uid === user.uid && "(Tú)"}
                            </span>
                            {isGuest && guestHostName && (
                              <span className="text-[10px] text-slate-400">
                                Invitado de {guestHostName}
                              </span>
                            )}
                            {profile && isAdmin(profile) && p.phone && (
                              <a href={`tel:+57${p.phone}`} className="text-[10px] font-medium text-amber-600 hover:underline flex items-center gap-1 mt-0.5">
                                📞 +57 {p.phone}
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-right">
                          {isGuest && !isClosed && (user?.uid === guestInviterUid || (profile && isAdmin(profile))) && (
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Eliminar a ${rawGuestName} de la lista de espera?`)) return;
                                try {
                                  await removeGuestFromMatch(id, guestInviterUid, rawGuestName);
                                  logGuestRemoved(id);
                                  toast.success("Invitado removido de espera");
                                } catch (err: unknown) {
                                  handleError(err, "Error al remover invitado.");
                                }
                              }}
                              className="text-[10px] font-bold px-2 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors shadow-sm"
                            >
                              Cancelar
                            </button>
                          )}

                          {canPromote ? (
                            <button
                              disabled={submitting}
                              onClick={() => handlePromoteGuest(rawGuestName, guestInviterUid)}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors shadow-sm"
                            >
                              {submitting ? "..." : "Confirmar invitado"}
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-widest shrink-0">
                              En espera
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })() : null}


        </div>
      </div>
      <PlayerCardDrawer
        isOpen={isPlayerCardOpen}
        onClose={() => { setIsPlayerCardOpen(false); setSelectedPlayerUid(null); }}
        playerUid={selectedPlayerUid}
      />

      <JoinConfirmModal
        isOpen={showJoinModal}
        instructions={match?.instructions}
        isWaitlist={isWaitlistModal}
        submitting={submitting}
        onClose={() => { setShowJoinModal(false); setIsWaitlistModal(false); setPendingJoinAction(null); }}
        onConfirm={async () => {
          if (!pendingJoinAction) return;
          setSubmitting(true);
          try {
            await pendingJoinAction();
            if (isWaitlistModal) {
              logWaitlistJoined(id);
            } else if (match?.players?.find(p => p.uid === user.uid)) {
              logAttendanceConfirmed(id);
            } else {
              logMatchJoined(id);
            }
            toast.success(isWaitlistModal ? "Te has unido a la lista de espera" : "¡Asistencia confirmada!");
            setShowJoinModal(false);
            setIsWaitlistModal(false);
            setPendingJoinAction(null);
          } catch (e: unknown) {
            handleError(e, isWaitlistModal ? "Hubo un error uniéndose a la lista de espera" : "Hubo un error al confirmar tu asistencia");
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </main >
  );
}
