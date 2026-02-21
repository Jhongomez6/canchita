"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { loginWithGoogle } from "@/lib/auth";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import { googleMapsEmbedUrl, googleMapsLink, wazeLink } from "@/lib/maps";
import Image from "next/image";
import { getUserProfile } from "@/lib/users";
import AddGuestForm from "@/components/AddGuestForm";
import { isInAppBrowser } from "@/lib/browser";
import { Guest } from "@/lib/domain/guest";
import type { Match } from "@/lib/domain/match";
import type { UserProfile } from "@/lib/domain/user";
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

export default function JoinMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setInApp(isInAppBrowser());
  }, []);

  async function loadMatch() {
    try {
      const ref = doc(db, "matches", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setError("El partido no existe");
        return;
      }

      setMatch({ id: snap.id, ...snap.data() } as Match);
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar el partido");
    }
  }

  // Cargar perfil del usuario
  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      return;
    }

    getUserProfile(user.uid)
      .then(p => {
        setProfile(p || { uid: user.uid, name: user.displayName || '', roles: ["player"] as const, positions: [] });
        setLoadingProfile(false);
      })
      .catch(err => {
        console.error("Error cargando perfil:", err);
        setProfile({ uid: user.uid, name: user.displayName || '', roles: ["player"] as const, positions: [] });
        setLoadingProfile(false);
      });
  }, [user]);

  // Redirigir a /profile si el perfil está incompleto
  useEffect(() => {
    if (
      profile &&
      profile.roles.includes("player") &&
      (!profile.positions || profile.positions.length === 0)
    ) {
      // Guardar el ID del partido para volver después
      if (typeof window !== "undefined") {
        localStorage.setItem("returnToMatch", id);
      }
      router.replace("/profile");
    }
  }, [profile, router, id]);

  // Cargar partido cuando auth y perfil estén listos
  useEffect(() => {
    if (!loading && user && profile && profile.positions?.length > 0) {
      loadMatch();
    }
  }, [loading, user, profile]);

  useEffect(() => {
    if (!match?.locationId) return;

    getDoc(doc(db, "locations", match.locationId))
      .then(snap => {
        if (snap.exists()) {
          setLocation({ id: snap.id, ...snap.data() } as Location);
        }
      });
  }, [match]);


  // ⏳ Auth o perfil cargando
  if (loading || loadingProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
            />
          </div>
          <p className="text-lg text-slate-500 font-medium animate-pulse">Cargando...</p>
        </div>
      </div>
    );
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
            />
          </div>

          {/* TÍTULO */}
          <h1 className="text-3xl font-bold text-[#1f7a4f] mb-3">
            Únete al partido
          </h1>

          {/* DESCRIPCIÓN */}
          {inApp ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 mb-8 text-sm text-left shadow-sm">
              <strong className="block mb-1 flex items-center gap-2">⚠️ Navegador no soportado</strong>
              Estás usando un navegador integrado (como WhatsApp o Instagram) que bloquea el inicio de sesión con Google.
              <br /><br />
              Toca los <strong>tres puntos ⋮</strong> en la esquina y selecciona <strong>&quot;Abrir en el navegador&quot;</strong> (Safari o Chrome) para continuar.
            </div>
          ) : (
            <p className="text-slate-500 mb-8 leading-relaxed">
              Inicia sesión para confirmar tu asistencia al partido.
            </p>
          )}

          {/* BOTÓN GOOGLE */}
          <button
            onClick={loginWithGoogle}
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
            />
          </div>
          <p className="text-lg text-slate-500 font-medium">Redirigiendo a tu perfil...</p>
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
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
      </div>
    );
  }

  const playerName = user.displayName || user.email || "Jugador";
  const isClosed = match.status === "closed";
  const guestCount = match.guests?.length ?? 0;
  const confirmedCount = match.players.filter((p: Player) => p.confirmed).length + guestCount;
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);

  const existingPlayer = match.players?.find(
    (p: Player) => p.uid === user.uid || p.name === playerName
  );

  const maxPlayers = match.maxPlayers ?? 0;
  const sidePlayers =
    maxPlayers && maxPlayers % 2 === 0 ? maxPlayers / 2 : null;

  const matchLabel = sidePlayers
    ? `Partido ${sidePlayers} vs ${sidePlayers}`
    : "Partido";

  // MVP Logic
  const myVote = match.mvpVotes?.[user.uid] || null;
  const eligiblePlayersAndGuests = [
    ...(match.players?.filter((p: Player) => p.confirmed) || []),
    ...(match.guests || []).map((g: Guest) => ({ name: g.name, uid: `guest_${g.name}` })) // Fake UIDs for guests to handle votes
  ];

  // Calculate Leaderboard
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

  // 6h Voting Window Validation
  const closedTime = match.closedAt ? new Date(match.closedAt).getTime() : 0;
  const now = new Date().getTime();
  const hoursSinceClosed = closedTime ? (now - closedTime) / (1000 * 60 * 60) : 0;
  const timeLimitClosed = hoursSinceClosed > 6;

  // Strict Mathematical Consensus Validation based on unique physical accounts
  const eligibleUIDs = new Set(
    match.players?.filter((p: Player) => p.confirmed && p.uid && !p.uid.startsWith("guest_")).map((p: Player) => p.uid) || []
  );
  if (match.createdBy) eligibleUIDs.add(match.createdBy); // Admin can always vote

  const totalEligibleVoters = eligibleUIDs.size;
  const votesCast = match.mvpVotes ? Object.keys(match.mvpVotes).filter(uid => eligibleUIDs.has(uid)).length : 0;
  const remainingVotes = totalEligibleVoters - votesCast;

  const secondHighestScore = sortedMVPLeaderboard.length > 1 ? sortedMVPLeaderboard[1][1] : 0;

  // A player has mathematically won if their score is strictly greater than the 
  // second highest score plus all remaining possible votes.
  const mathematicallyClosed = (topMvpScore > 0) && (topMvpScore > secondHighestScore + remainingVotes);

  // Voting is also definitively closed if every single eligible player has voted, 
  // regardless of ties.
  const allEligibleVoted = totalEligibleVoters > 0 && remainingVotes <= 0;

  const earlyClosure = mathematicallyClosed || allEligibleVoted;

  const votingClosed = isClosed && (timeLimitClosed || earlyClosure);

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto">
        {/* HEADER VERDE */}
        <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-6 pb-8 rounded-b-3xl shadow-lg mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          <h2 className="text-2xl font-bold relative z-10 flex items-center gap-2">
            ⚽ <span className="text-emerald-50">Partido</span>
          </h2>
          <p className="relative z-10 text-emerald-100 text-sm mt-1">
            Detalles del partido
          </p>
        </div>

        {/* CONTAINER CON MARGIN NEGATIVO PARA QUE MONTE EL HEADER */}
        <div className="px-4 -mt-10 relative z-20 space-y-4">

          {/* CARD PARTIDO */}
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                {matchLabel}
                {match.isPrivate && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    🔒 Privado
                  </span>
                )}
              </h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isClosed ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                }`}>
                {isClosed ? "Cerrado" : "Abierto"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-600">
                <span className="bg-slate-100 p-2 rounded-lg text-lg">🕒</span>
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 text-sm">{formatDateSpanish(match.date)}</span>
                  <span className="text-xs text-slate-400">{formatTime12h(match.time)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setIsMapOpen(!isMapOpen)}
                  className="flex items-center gap-3 text-slate-600 w-full text-left group"
                >
                  <span className="bg-slate-100 p-2 rounded-lg text-lg group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">📍</span>
                  <div className="flex-1">
                    <span className="font-medium text-sm block">{location?.name || match.locationSnapshot?.name || "Cancha no disponible"}</span>
                    <span className={`
                      text-xs font-bold px-2.5 py-1 rounded-lg transition-colors mt-1.5 inline-flex items-center gap-1.5
                      ${isMapOpen
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700"}
                    `}>
                      {isMapOpen ? "Ocultar mapa" : "Ver ubicación en mapa"}
                    </span>
                  </div>
                </button>

                {/* MAPA EXPANDIBLE */}
                {isMapOpen && location && (
                  <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-xs text-slate-500 mb-3 ml-11">{location.address}</p>

                    <iframe
                      src={googleMapsEmbedUrl(location.lat, location.lng)}
                      width="100%"
                      height="200"
                      className="rounded-xl border-0 bg-slate-100 mb-3"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />

                    <div className="flex gap-2">
                      <a
                        href={googleMapsLink(location.lat, location.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <img src="/icons/google-maps.svg" alt="G" className="w-4 h-4" />
                        Maps
                      </a>
                      <a
                        href={wazeLink(location.lat, location.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <img src="/icons/waze.svg" alt="W" className="w-4 h-4" />
                        Waze
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD ASISTENCIA - Solo si partido abierto */}
          {!isClosed && (
            <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-4">Tu asistencia</h3>

              {isFull && !existingPlayer && (
                <div className="mb-4 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm font-bold border border-amber-100 text-center">
                  ⚠️ El partido está lleno. ¡Anotate en la lista de espera!
                </div>
              )}
              {isFull && existingPlayer?.isWaitlist && (
                <div className="mb-4 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm font-bold border border-amber-100 text-center">
                  👀 Estás en la lista de espera. Revisa seguido por si se libera un cupo.
                </div>
              )}
              {isFull && existingPlayer && !existingPlayer.confirmed && !existingPlayer.isWaitlist && (
                <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-bold border border-red-100 text-center">
                  ❌ El partido ya está completo y perdiste tu lugar reservado.
                </div>
              )}
              {/* If match is full and user isn't confirmed and isn't waitlisted */}
              {isFull && (!existingPlayer || (!existingPlayer.confirmed && !existingPlayer.isWaitlist)) && (
                <button
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await joinWaitlist(id, {
                        uid: user.uid,
                        name: playerName,
                      });
                      await loadMatch();
                    } catch (e: any) {
                      console.error("Error joining waitlist:", e);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all active:scale-[0.98] ${submitting
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
                    }`}
                >
                  {submitting ? "⏳ Uniendo..." : "📋 Ingresar como Suplente"}
                </button>
              )}

              {/* Botón Salir de lista de espera */}
              {existingPlayer?.isWaitlist && (
                <button
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await leaveWaitlist(id, playerName);
                      await loadMatch();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors mt-2"
                >
                  Salir de la lista de espera
                </button>
              )}

              {/* Mógica Normal (No full, o no confirmado aún) */}
              {!isFull && !existingPlayer && (
                <button
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await joinMatch(id, {
                        uid: user.uid,
                        name: playerName,
                      });
                      await loadMatch();
                    } catch (e: any) {
                      if (e.message === "MATCH_FULL") {
                        alert("El partido se llenó justo ahora 😬");
                      }
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98] ${submitting
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-[#1f7a4f] text-white hover:bg-[#16603c] hover:shadow-xl"
                    }`}
                >
                  {submitting ? "⏳ Confirmando..." : "✅ Confirmar asistencia"}
                </button>
              )}

              {existingPlayer?.confirmed && (
                <>
                  <div className="mb-4 bg-emerald-50 text-[#1f7a4f] px-4 py-3 rounded-xl text-sm font-bold border border-emerald-100 flex items-center justify-center gap-2">
                    ✅ Estás confirmado
                  </div>

                  <button
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        await unconfirmAttendance(id, playerName);
                        await loadMatch();
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="w-full py-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                  >
                    No puedo ir (Liberar Cupo)
                  </button>
                </>
              )}

              {!isFull && existingPlayer && !existingPlayer.confirmed && (
                <>
                  <div className="mb-4 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm font-bold border border-amber-100 text-center">
                    {existingPlayer.isWaitlist
                      ? "¡SE LIBERÓ UN CUPO! Toma tu lugar rápido:"
                      : "⏳ Aún no has confirmado tu asistencia"}
                  </div>

                  {/* Toma el lugar (Ascenso Manual Free For All) */}
                  <button
                    disabled={submitting}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        // Si ya está como suplente, la función confirmAttendance no sabe limpiarle
                        // isWaitlist. Así que preferimos llamar joinMatch que sobreescribe/arregla el estado confirmed
                        // y luego si hace falta, limpiamos isWaitlist
                        await confirmAttendance(id, playerName);
                        // Also clear waitlist flag just in case
                        await leaveWaitlist(id, playerName);
                        await loadMatch();
                      } catch (e: any) {
                        if (e.message === "MATCH_FULL") {
                          alert("Alguien te ganó el cupo 😬");
                          await loadMatch();
                        }
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98] ${submitting
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-[#1f7a4f] text-white hover:bg-[#16603c] hover:shadow-xl"
                      }`}
                  >
                    {submitting ? "⏳ Confirmando..." : (existingPlayer.isWaitlist ? "🏃‍♂️ ¡Tomar Cupo y Confirmar!" : "✅ Confirmar asistencia")}
                  </button>

                  {existingPlayer.isWaitlist && (
                    <button
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await leaveWaitlist(id, playerName);
                          await loadMatch();
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors mt-2"
                    >
                      Salir de la lista de espera
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* AGREGAR INVITADO - Solo para jugadores confirmados */}
          {!isClosed && existingPlayer?.confirmed && (
            <AddGuestForm
              matchId={id}
              playerUid={user.uid}
              existingGuest={
                match.guests?.find((g: Guest) => g.invitedBy === user.uid) || null
              }
              onSuccess={() => loadMatch()}
            />
          )}








          {/* LISTA DE JUGADORES O REPORTE */}
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
                resultMessage = "Perdiste 😔";
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
                resultMessage = "Perdiste 😔";
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
                  <span>🏆 Resultado del Partido</span>
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
                      <span>🔴 Equipo A {userInTeamA && "(Tú)"}</span>
                      <span className="text-red-500 opacity-60 text-xs">{match.teams.A.length} jug.</span>
                    </h4>
                    <div className="space-y-2">
                      {match.teams.A.map((p: Player, i: number) => {
                        const targetId = p.uid || p.name;
                        const isMvp = currentMVPs.includes(targetId);
                        const votes = voteCounts[targetId] || 0;

                        return (
                          <div key={i} className={`flex items-center justify-between p-1.5 rounded-lg ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border border-amber-100" : ""}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-white text-red-700 flex items-center justify-center text-xs font-bold shadow-sm ring-1 ring-red-100">
                                {POSITION_ICONS[(p.positions?.[0] as Position) || "MID"]}
                              </div>
                              <span className={`text-sm font-medium ${p.uid === user.uid ? "text-red-900 font-bold" : "text-slate-700"}`}>{p.name}</span>
                              {isMvp && <span className={`text-lg ${votingClosed ? "" : "animate-pulse"}`} title={`MVP Actual con ${votes} votos`}>👑</span>}
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
                      <span>🔵 Equipo B {userInTeamB && "(Tú)"}</span>
                      <span className="text-blue-500 opacity-60 text-xs">{match.teams.B.length} jug.</span>
                    </h4>
                    <div className="space-y-2">
                      {match.teams.B.map((p: Player, i: number) => {
                        const targetId = p.uid || p.name;
                        const isMvp = currentMVPs.includes(targetId);
                        const votes = voteCounts[targetId] || 0;

                        return (
                          <div key={i} className={`flex items-center justify-between p-1.5 rounded-lg ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border border-amber-100" : ""}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-white text-blue-700 flex items-center justify-center text-xs font-bold shadow-sm ring-1 ring-blue-100">
                                {POSITION_ICONS[(p.positions?.[0] as Position) || "MID"]}
                              </div>
                              <span className={`text-sm font-medium ${p.uid === user.uid ? "text-blue-900 font-bold" : "text-slate-700"}`}>{p.name}</span>
                              {isMvp && <span className={`text-lg ${votingClosed ? "" : "animate-pulse"}`} title={`MVP Actual con ${votes} votos`}>👑</span>}
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
                    <div className="absolute -top-6 -right-6 text-6xl opacity-10">👑</div>
                    <h4 className="font-bold text-amber-900 mb-4 flex items-center gap-2 relative z-10">
                      {votingClosed ? "👑 MVP del Partido" : "🏅 Elige al MVP del Partido"}
                    </h4>

                    {myVote && !votingClosed && (
                      <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded mb-4 relative z-10 border border-emerald-100">
                        ✅ Tu voto ha sido registrado.
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
                              <span>🤝</span> ¡Empate! Hoy se comparte el podio.
                            </div>
                          )}
                          {votingClosed && currentMVPs.length === 1 && (
                            <div className="bg-amber-100/50 flex items-center justify-center gap-2 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium mb-4">
                              <span>⭐</span> ¡Crack, la diste toda manito(a)!
                            </div>
                          )}
                          {sortedMVPLeaderboard.slice(0, 3).map(([targetId, votes], idx) => {
                            const player = eligiblePlayersAndGuests.find(p => p.uid === targetId || p.name === targetId);
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
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shadow-inner
                                      ${isWinner ? 'bg-amber-100/50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-400'}`}>
                                    {isWinner ? <span className={`drop-shadow-sm mt-1 ${votingClosed ? "" : "animate-bounce"}`}>👑</span> : idx + 1}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className={`font-black text-lg tracking-tight ${isWinner ? 'text-amber-900' : 'text-slate-800'}`}>
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
                            { key: "A", title: "🔴 Equipo A", players: match.teams?.A || [] },
                            { key: "B", title: "🔵 Equipo B", players: match.teams?.B || [] }
                          ].map(({ key, title, players }) => {
                            // Convert back to MVP-eligible subset
                            const teamEligible = (players as Player[]).filter(p => p.uid !== user.uid && eligiblePlayersAndGuests.some(e => e.uid === p.uid || e.name === p.name));
                            if (teamEligible.length === 0) return null;

                            return (
                              <div key={key} className="space-y-2">
                                <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                                  {title}
                                </h5>
                                <div className="grid grid-cols-2 gap-2">
                                  {teamEligible.map(p => {
                                    const targetId = p.uid || p.name;
                                    const isSelected = myVote === targetId;

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
                                            await loadMatch();
                                          } catch (err: any) {
                                            alert(err.message);
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
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${isSelected ? "bg-white text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                                          {p.name.charAt(0).toUpperCase()}
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
          })() : (
            <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                👥 Jugadores confirmados
                <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">{confirmedCount} / {match.maxPlayers || "?"}</span>
              </h3>

              {confirmedCount === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Aún no hay jugadores confirmados. ¡Sé el primero!</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* PLAYERS (Titulares) */}
                  {match.players?.filter((p: Player) => p.confirmed).map((p: Player, i: number) => (
                    <div key={`p-${i}`} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm">
                          {POSITION_ICONS[(p.positions?.[0] as Position) || "MID"]}
                        </div>
                        <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600">
                        Confirmado
                      </span>
                    </div>
                  ))}

                  {/* GUESTS */}
                  {match.guests?.map((g: Guest, i: number) => (
                    <div key={`g-${i}`} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm">
                          {POSITION_ICONS[(g.positions?.[0] as Position) || "MID"]}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-sm">{g.name}</span>
                          <span className="text-[10px] text-slate-400">Invitado</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-600">
                        Confirmado
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WAITLIST (SUPLENTES) DISPLAY */}
          {(!isClosed && match.players?.filter((p: Player) => p.isWaitlist && !p.confirmed).length > 0) ? (() => {
            // Ordenar la lista de espera por fecha de ingreso para ser transparentes
            const waitlistPlayers = match.players
              .filter((p: Player) => p.isWaitlist && !p.confirmed)
              .sort((a: Player, b: Player) => {
                const tA = a.waitlistJoinedAt ? new Date(a.waitlistJoinedAt).getTime() : 0;
                const tB = b.waitlistJoinedAt ? new Date(b.waitlistJoinedAt).getTime() : 0;
                return tA - tB;
              });

            return (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6 mt-4 opacity-90">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  📋 Lista de Espera (Suplentes)
                  <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-black">{waitlistPlayers.length}</span>
                </h3>
                <div className="divide-y divide-slate-100">
                  {waitlistPlayers.map((p: Player, i: number) => (
                    <div key={`wl-${i}`} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-bold ring-1 ring-amber-200">
                          #{i + 1}
                        </div>
                        <span className="font-bold text-slate-700 text-sm">{p.name} {p.uid === user.uid && "(Tú)"}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-widest">
                        En espera
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : null}


        </div>
      </div>
    </main >
  );
}
