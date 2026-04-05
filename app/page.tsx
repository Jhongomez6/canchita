"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getMyMatches, getAllMatches } from "@/lib/matches";
import { isSuperAdmin, isAdmin } from "@/lib/domain/user";
import AuthGuard from "@/components/AuthGuard";

import Link from "next/link";
import { enablePushNotifications } from "@/lib/push";
import toast from "react-hot-toast";
import {formatTime12h } from "@/lib/date";
import { sanitizeMatchCode } from "@/lib/matchCode";
import { documentId, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import MatchCard from "@/components/MatchCard";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/domain/match";

import type { Location } from "@/lib/domain/location";
import HomeSkeleton from "@/components/skeletons/HomeSkeleton";
import PlayerAvatars from "@/components/PlayerAvatars";
import { logPushEnabled, logPushPromptDismissed, logApplyCTAShown, logApplyCTAClicked, logApplyCTADismissed, logHeroCardClicked, logJoinByCodeClicked, logFullHistoryClicked } from "@/lib/analytics";
import { dismissApplyCTA } from "@/lib/users";
import { getPendingApplicationsCount } from "@/lib/teamAdminApplications";
import { Clock, Users, LandPlot, MapPin, Trophy, Plus, ChevronRight, Search, ArrowRight, X } from "lucide-react";
import IdentityHeader from "@/components/home/IdentityHeader";
import QuickStats from "@/components/home/QuickStats";
import HistoryRow from "@/components/home/HistoryRow";

export default function Home() {
  const router = useRouter();
  const { user, profile, justLoggedIn, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [locationsMap, setLocationsMap] = useState<Record<string, Location>>({});
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [pendingApps, setPendingApps] = useState(0);

  useEffect(() => {
    if (
      justLoggedIn &&
      profile &&
      !profile.notificationsEnabled &&
      "Notification" in window
    ) {
      setShowPushPrompt(true);
    }
  }, [justLoggedIn, profile]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoadingMatches(false);
      return;
    }

    setLoadingMatches(true);
    
    const fetchMatches = profile && isSuperAdmin(profile)
      ? getAllMatches()
      : getMyMatches(user.uid);

    fetchMatches
      .then(async matchesData => {
        try {
          // Sort matches by date DESCENDING (most recent first)
          const sorted = [...matchesData].sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());
          setMatches(sorted);

          const locationIds = Array.from(
            new Set(
              matchesData
                .map(m => m.locationId)
                .filter(Boolean)
            )
          );

          // Batch fetch locations (Firestore 'in' supports up to 30 items per query)
          const map: Record<string, Location> = {};
          for (let i = 0; i < locationIds.length; i += 30) {
            const batch = locationIds.slice(i, i + 30);
            const snap = await getDocs(
              query(collection(db, "locations"), where(documentId(), "in", batch))
            );
            snap.docs.forEach(d => {
              map[d.id] = { id: d.id, ...d.data() } as Location;
            });
          }

          setLocationsMap(map);
        } catch (error) {
          console.error("Error processing matches or locations:", error);
        } finally {
          setLoadingMatches(false);
        }
      })
      .catch((error) => {
        console.error("Error fetching matches:", error);
        setLoadingMatches(false);
      });
    // Fetch pending apps count if super admin
    if (profile && isSuperAdmin(profile)) {
      getPendingApplicationsCount()
        .then(count => setPendingApps(count))
        .catch(() => {/* silence */});
    }

  }, [user, authLoading, profile]);

  if (loadingMatches) {
    return <HomeSkeleton />;
  }

  const now = new Date().getTime();
  const openMatches = matches.filter(m => m.status === 'open');

  // Future open matches (including from the last 4 hours)
  const futureOpenMatches = openMatches.filter(m => new Date(`${m.date}T${m.time}`).getTime() >= now - 1000 * 60 * 60 * 4);

  // The next match is the closest future open match (sort ascending).
  // If no future matches exist, pick the most recent past open match (first item of descending openMatches array).
  const nextMatch = futureOpenMatches.length > 0
    ? [...futureOpenMatches].sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())[0]
    : openMatches[0];

  const upcomingMatches = matches.filter(m => m.id !== nextMatch?.id);
  const activeMatches = upcomingMatches.filter(m => m.status === 'open');
  const closedMatches = upcomingMatches.filter(m => m.status === 'closed');

  // Hero card computed values
  const heroDate = nextMatch ? new Date(`${nextMatch.date}T12:00:00`) : null;
  const heroWeekDay = heroDate ? heroDate.toLocaleDateString('es-CO', { weekday: 'long' }).toUpperCase() : '';
  const heroDay = heroDate ? heroDate.getDate() : null;
  const heroMonth = heroDate ? heroDate.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '').toUpperCase() : '';
  const heroLocation = nextMatch ? locationsMap[nextMatch.locationId] : null;
  const heroLocationName = heroLocation?.name
    ? heroLocation.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : "Ubicación por definir";
  const heroConfirmed = nextMatch
    ? (nextMatch.players?.filter((p: { confirmed?: boolean }) => p.confirmed).length ?? 0)
      + (nextMatch.guests?.filter((g: { isWaitlist?: boolean }) => !g.isWaitlist).length ?? 0)
    : 0;
  const heroFormat = nextMatch ? `Fútbol ${Math.floor(nextMatch.maxPlayers / 2)}` : '';

  // Compute admin context
  const isAdminUser = profile && isAdmin(profile);
  const pendingConfirmations = activeMatches.filter(m => {
    const currentPlayer = m.players?.find(p => p.uid === user?.uid);
    return currentPlayer && !currentPlayer.confirmed;
  }).length;

  // Hero card personal status
  const userInNextMatch = nextMatch?.players?.find(p => p.uid === user?.uid);
  const userConfirmed = userInNextMatch?.confirmed ?? false;
  const nextMatchHref = isAdminUser ? `/match/${nextMatch?.id}` : `/join/${nextMatch?.id}`;

  // Compute "last played" for empty state
  const lastClosedMatch = closedMatches[0];
  const lastPlayedDaysAgo = lastClosedMatch
    ? Math.floor((Date.now() - new Date(`${lastClosedMatch.date}T${lastClosedMatch.time}`).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
        <div className="max-w-md mx-auto">

          {/* HEADER / IDENTITY */}
          <div className="bg-[#1f7a4f] text-white p-5 rounded-b-[2.5rem] shadow-lg pt-safe">
            {profile && (
              <IdentityHeader
                profile={profile}
                isAdmin={isAdminUser ?? false}
                pendingConfirmations={pendingConfirmations}
                activeMatchesCount={activeMatches.length}
              />
            )}
          </div>

          <div className="px-5">
            {/* ADMIN ACTION BAR */}
            {isAdminUser && (
              <div className="mb-6 mt-5 flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 snap-x snap-mandatory">
                <Link
                  href="/new-match"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1f7a4f] text-white rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm active:scale-[0.95] transition-transform shrink-0 snap-center"
                >
                  <Plus size={16} />
                  Nuevo Partido
                </Link>
                {profile?.adminType === "super_admin" && (
                  <Link
                    href="/admin/users"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm active:scale-[0.95] transition-transform shrink-0 snap-center"
                  >
                    Ver Usuarios
                  </Link>
                )}
                {profile?.adminType === "super_admin" && (
                  <Link
                    href="/admin/applications"
                    className="relative inline-flex items-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200 rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm active:scale-[0.95] transition-transform shrink-0 snap-center"
                  >
                    <Users size={16} />
                    Solicitudes
                    {pendingApps > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                        {pendingApps > 9 ? "9+" : pendingApps}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm active:scale-[0.95] transition-transform shrink-0 snap-center"
                >
                  Explorar
                </Link>
              </div>
            )}

            {/* TEAM ADMIN CTA BANNER */}
            {profile && !isAdminUser && profile.initialRatingCalculated && !profile.applyCTADismissed && (
              <div className="relative mt-5 mb-4 bg-white border border-emerald-100 rounded-2xl p-4 pr-10 shadow-sm flex items-center gap-3" ref={(el) => { if (el) logApplyCTAShown(); }}>
                <button
                  onClick={async () => {
                    if (!user) return;
                    logApplyCTADismissed();
                    await dismissApplyCTA(user.uid);
                  }}
                  className="absolute top-2.5 right-2.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-lg p-1 transition-colors"
                  aria-label="Descartar"
                >
                  <X size={18} />
                </button>
                <span className="text-2xl flex-shrink-0">🎽</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">¿Organizas partidos?</p>
                  <p className="text-xs text-slate-500">Aplica para ser Team Admin y gestiona tu grupo desde la app</p>
                  <Link
                    href="/apply"
                    onClick={() => logApplyCTAClicked()}
                    className="inline-block mt-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-500 transition-colors"
                  >
                    Ver más →
                  </Link>
                </div>
              </div>
            )}

            {/* HERO CARD — NEXT MATCH */}
            {nextMatch ? (
              <div className="relative bg-white text-slate-900 rounded-3xl p-5 shadow-[0_8px_40px_-8px_rgba(31,122,79,0.15)] overflow-hidden mb-5">
                {/* Pitch SVG background */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none" viewBox="0 0 400 250" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                  <rect x="10" y="10" width="380" height="230" rx="4" stroke="#1f7a4f" strokeWidth="3" />
                  <line x1="200" y1="10" x2="200" y2="240" stroke="#1f7a4f" strokeWidth="3" />
                  <circle cx="200" cy="125" r="40" stroke="#1f7a4f" strokeWidth="3" />
                  <circle cx="200" cy="125" r="4" fill="#1f7a4f" />
                  <rect x="10" y="75" width="60" height="100" rx="2" stroke="#1f7a4f" strokeWidth="3" />
                  <rect x="330" y="75" width="60" height="100" rx="2" stroke="#1f7a4f" strokeWidth="3" />
                  <path d="M 10 75 A 25 25 0 0 1 35 100" stroke="#1f7a4f" strokeWidth="3" fill="none" />
                  <path d="M 10 175 A 25 25 0 0 0 35 150" stroke="#1f7a4f" strokeWidth="3" fill="none" />
                  <path d="M 390 75 A 25 25 0 0 0 365 100" stroke="#1f7a4f" strokeWidth="3" fill="none" />
                  <path d="M 390 175 A 25 25 0 0 1 365 150" stroke="#1f7a4f" strokeWidth="3" fill="none" />
                </svg>

                <div className="relative">
                  {/* Urgency badge */}
                  <div className="mb-3">
                    <span className="text-xs font-bold text-white uppercase tracking-wider bg-[#1f7a4f] px-2.5 py-1 rounded-md">
                      Próximo Partido
                    </span>
                  </div>

                  {/* Date + Info */}
                  <div className="flex items-start gap-4 mb-3">
                    {/* Date Box */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 w-24 h-24 shrink-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-emerald-700 font-black uppercase tracking-widest">{heroWeekDay}</span>
                      <span className="text-4xl font-black text-slate-800 leading-none mt-0.5">{heroDay}</span>
                      <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">{heroMonth}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xl font-black text-slate-800">
                        <Clock size={18} />
                        {formatTime12h(nextMatch.time)}
                      </div>
                      <p className="flex items-center gap-1 text-sm text-slate-500 font-medium mt-1 min-w-0">
                        <MapPin size={14} className="shrink-0" />
                        <span className="truncate">{heroLocationName}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                        <span className={`flex items-center gap-1 ${heroConfirmed >= nextMatch.maxPlayers ? 'text-emerald-600 font-semibold' : ''}`}>
                          <Users size={14} />
                          {heroConfirmed}/{nextMatch.maxPlayers}
                        </span>
                        <span className="flex items-center gap-1">
                          <LandPlot size={14} />
                          {heroFormat}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Capacity bar */}
                  <div className="mb-3">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${heroConfirmed >= nextMatch.maxPlayers ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(100, (heroConfirmed / nextMatch.maxPlayers) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Player status chip */}
                  {userInNextMatch && (
                    <div className="mb-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        userConfirmed
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {userConfirmed ? '✓ Confirmado' : 'Falta tu confirmación'}
                      </span>
                    </div>
                  )}

                  {/* Avatars */}
                  <PlayerAvatars
                    players={nextMatch.players?.filter((p: { confirmed?: boolean }) => p.confirmed) ?? []}
                    guestCount={nextMatch.guests?.filter((g: { isWaitlist?: boolean }) => !g.isWaitlist).length ?? 0}
                  />

                  {/* CTA */}
                  <Link
                    href={nextMatchHref}
                    onClick={() => logHeroCardClicked(nextMatch.id, userConfirmed ? "details" : "confirm")}
                    className={`block w-full py-3 text-center rounded-xl font-bold shadow-md transition-all active:scale-[0.98] ${
                      !userConfirmed && !isAdminUser
                        ? 'bg-[#1f7a4f] text-white hover:bg-[#16603c]'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {!userConfirmed && !isAdminUser ? 'Confirmar asistencia' : 'Ver detalles'}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-5">
                {/* Empty state header */}
                <div className="text-center mb-5">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Trophy size={22} className="text-slate-400" />
                  </div>
                  <p className="font-bold text-slate-800">Sin partidos próximos</p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {lastPlayedDaysAgo !== null
                      ? `Tu último partido fue hace ${lastPlayedDaysAgo} ${lastPlayedDaysAgo === 1 ? 'día' : 'días'}`
                      : 'Aún no has jugado ningún partido'}
                  </p>
                </div>

                {/* Buscar */}
                <Link
                  href="/explore"
                  className="flex items-center justify-between px-4 py-3 bg-[#1f7a4f] text-white rounded-xl font-semibold active:scale-[0.98] transition-transform mb-3"
                >
                  <div className="flex items-center gap-2">
                    <Search size={16} />
                    <span>Buscar partidos</span>
                  </div>
                  <ChevronRight size={16} className="opacity-70" />
                </Link>

                {/* Unirse con código */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Unirme con código</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      logJoinByCodeClicked("home");
                      if (joinCode.trim()) {
                        const sanitized = sanitizeMatchCode(joinCode);
                        router.push(`/join/${sanitized}`);
                      }
                    }}
                    className="flex items-center gap-2 px-3 pb-3"
                  >
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="Pega el código o link"
                      className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!joinCode.trim()}
                      className="p-2 bg-[#1f7a4f] text-white rounded-lg disabled:opacity-40 active:scale-[0.97] transition-all"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* PUSH PROMPT — CONTEXTUAL */}
            {showPushPrompt && nextMatch && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100 mb-5">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🔔</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-sm mb-0.5">Activa notificaciones</h3>
                    <p className="text-xs text-slate-500 mb-3">
                      Te recordaremos antes del partido del {heroWeekDay.toLowerCase()}.
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={enablingPush}
                        onClick={async () => {
                          if (!user) return;
                          setEnablingPush(true);
                          try {
                            const token = await enablePushNotifications(user.uid);
                            if (token) {
                              logPushEnabled();
                              setShowPushPrompt(false);
                            } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
                              toast.error("Permisos denegados.");
                              setShowPushPrompt(false);
                            } else {
                              toast.error("No se pudieron activar.");
                            }
                          } finally {
                            setEnablingPush(false);
                          }
                        }}
                        className="flex-1 py-2 bg-[#1f7a4f] text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50"
                      >
                        {enablingPush ? "Activando..." : "Activar"}
                      </button>
                      <button
                        onClick={() => { logPushPromptDismissed(); setShowPushPrompt(false); }}
                        className="px-3 py-2 text-slate-400 text-xs font-medium hover:text-slate-600"
                      >
                        Ahora no
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* QUICK STATS (player only, ≥3 matches) */}
            {!isAdminUser && profile?.stats && (
              <div className="mb-5">
                <QuickStats
                  stats={profile.stats}
                  weeklyStreak={profile.weeklyStreak}
                  commitmentStreak={profile.commitmentStreak}
                />
              </div>
            )}

            {/* ACTIVE MATCHES (non-hero matches) */}
            {loadingMatches ? (
              <div className="space-y-3 mb-5">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-20 bg-slate-200 rounded-lg shrink-0"></div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeMatches.length > 0 ? (
              <div className="mb-5">
                <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span>Partidos Activos</span>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{activeMatches.length}</span>
                </h2>
                <div className="space-y-3">
                  {activeMatches.map(m => {
                    const href = isAdminUser ? `/match/${m.id}` : `/join/${m.id}`;
                    const isUserConfirmed = m.players?.some(p => p.uid === user?.uid && p.confirmed) ?? false;
                    return (
                      <MatchCard
                        key={m.id}
                        match={m}
                        location={locationsMap[m.locationId]}
                        href={href}
                        userConfirmed={!isAdminUser && isUserConfirmed}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* HISTORY — TROPHY SHELF */}
            {closedMatches.length > 0 && (
              <div className="mt-6 pb-3">
                <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span>Historial</span>
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{closedMatches.length}</span>
                </h2>
                <div className="space-y-2">
                  {closedMatches.slice(0, 5).map(m => {
                    const href = isAdminUser ? `/match/${m.id}` : `/join/${m.id}`;
                    return (
                      <HistoryRow
                        key={m.id}
                        match={m}
                        location={locationsMap[m.locationId]}
                        href={href}
                        userId={user?.uid}
                      />
                    );
                  })}
                  {closedMatches.length > 5 && (
                    <Link 
                      href="/history" 
                      onClick={() => logFullHistoryClicked()}
                      className="flex items-center justify-center gap-1 py-2 text-sm text-emerald-600 font-semibold hover:text-emerald-700"
                    >
                      Ver historial completo <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
