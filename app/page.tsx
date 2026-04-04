"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getMyMatches, getAllMatches } from "@/lib/matches";
import { isSuperAdmin } from "@/lib/domain/user";
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
import { logPushEnabled, logPushPromptDismissed } from "@/lib/analytics";
import { Clock, Users, LandPlot, MapPin } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { user, profile, justLoggedIn, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [locationsMap, setLocationsMap] = useState<Record<string, Location>>({});
  const [quickCode, setQuickCode] = useState("");
  const [loadingMatches, setLoadingMatches] = useState(true);

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
  }, [user, authLoading]);

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

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
        <div className="max-w-md mx-auto">

          {/* HEADER / GREETING */}
          <div className="bg-[#1f7a4f] text-white p-6 rounded-b-[2.5rem] shadow-lg mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Hola,</p>
                <h1 className="text-2xl font-bold">{profile?.name || "Jugador"} 👋</h1>
              </div>
              {profile?.roles.includes("admin") && (
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                  Admin
                </span>
              )}
            </div>

            {/* NEXT MATCH HERO CARD */}
            {nextMatch ? (
              <div className="relative bg-white text-slate-900 rounded-3xl p-5 shadow-[0_8px_40px_-8px_rgba(31,122,79,0.15)] overflow-hidden">
                  {/* Líneas de cancha sutiles de fondo */}
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
                    <div className="mb-4">
                      <span className="text-xs font-bold text-white uppercase tracking-wider bg-[#1f7a4f] px-2.5 py-1 rounded-md">
                        Próximo Partido
                      </span>
                    </div>

                    <div className="flex items-start gap-4 mb-4">
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
                        <p className="flex items-center gap-1 text-base text-slate-500 font-medium mt-1 truncate">
                          <MapPin size={15} className="shrink-0" />
                          {heroLocationName}
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

                    {/* Player avatars */}
                    <PlayerAvatars
                      players={nextMatch.players?.filter((p: { confirmed?: boolean }) => p.confirmed) ?? []}
                      guestCount={nextMatch.guests?.filter((g: { isWaitlist?: boolean }) => !g.isWaitlist).length ?? 0}
                    />

                    <Link
                      href={profile?.roles.includes("admin") ? `/match/${nextMatch.id}` : `/join/${nextMatch.id}`}
                      className="block w-full py-3 bg-[#1f7a4f] text-white text-center rounded-xl font-bold shadow-md hover:bg-[#16603c] transition-all active:scale-[0.98]"
                    >
                      Ver detalles
                    </Link>
                  </div>
                </div>
            ) : (
              <div className="bg-white/10 rounded-3xl p-6 text-center shadow-inner border border-white/20">
                <div className="mb-5">
                  <p className="font-bold text-lg text-white mb-0.5">Empieza a jugar</p>
                  <p className="text-sm text-emerald-100/90 font-medium">No tienes partidos próximos programados.</p>
                </div>

                <div className="relative max-w-[260px] mx-auto mb-6">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <span className="text-lg opacity-60">🔑</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Código o link de invitación"
                    value={quickCode}
                    onChange={(e) => setQuickCode(e.target.value)}
                    // text-base previene auto-zoom en iOS Safari
                    className="w-full pl-11 pr-16 py-3.5 bg-white text-slate-800 text-base font-bold placeholder:font-medium placeholder:text-slate-400 rounded-2xl border-none focus:outline-none focus:ring-4 focus:ring-emerald-400/30 transition-all shadow-md"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && quickCode.trim()) {
                        const sanitized = sanitizeMatchCode(quickCode);
                        router.push(`/join/${sanitized}`);
                      }
                    }}
                  />
                  <div className="absolute inset-y-1.5 right-1.5">
                    <button
                      onClick={() => {
                        if (quickCode.trim()) {
                          const sanitized = sanitizeMatchCode(quickCode);
                          router.push(`/join/${sanitized}`);
                        }
                      }}
                      disabled={!quickCode.trim()}
                      className="h-full px-4 bg-[#1f7a4f] text-white rounded-xl font-bold text-sm shadow hover:bg-[#16603c] disabled:opacity-50 transition-colors flex items-center"
                    >
                      Ir
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 mb-5">
                  <div className="h-px w-8 bg-white/20"></div>
                  <span className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest">O explora</span>
                  <div className="h-px w-8 bg-white/20"></div>
                </div>

                <Link href="/explore" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold shadow-sm transition-colors border border-white/10 w-full justify-center max-w-[260px] mx-auto">
                  <span className="text-base">🔍</span> Partidos Abiertos
                </Link>
              </div>
            )}
          </div>

          <div className="px-5">
            {/* PUSH NOTIFICATIONS PROMPT */}
            {showPushPrompt && (
              <div className="bg-white p-4 rounded-2xl shadow-md mb-6 border border-emerald-100">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🔔</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-sm mb-1">Activa las notificaciones</h3>
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                      Recibe recordatorios antes de tus partidos para confirmar asistencia.
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
                              toast.error("Permisos denegados. Reactívalos en la configuración del navegador.");
                              setShowPushPrompt(false);
                            } else {
                              toast.error("No se pudieron activar. Intenta de nuevo más tarde.");
                            }
                          } finally {
                            setEnablingPush(false);
                          }
                        }}
                        className="flex-1 py-2 bg-[#1f7a4f] text-white text-xs font-bold rounded-lg shadow-sm"
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

            {/* QUICK ACTIONS (ADMIN) */}
            {profile?.roles.includes("admin") && (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-800 mb-3 px-1">Gestión Rápida</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/new-match" className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:border-emerald-200 transition-colors">
                    <div className="bg-emerald-100 p-2 rounded-lg text-[#1f7a4f]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="font-semibold text-sm text-slate-700">Nuevo Partido</span>
                  </Link>
                  {profile?.adminType === "super_admin" && (
                    <Link href="/admin/users" className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:border-emerald-200 transition-colors">
                      <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                      </div>
                      <span className="font-semibold text-sm text-slate-700">Usuarios</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVE MATCHES */}
            {loadingMatches ? (
              <div>
                <div className="flex justify-between items-center mb-3 px-1">
                  <div className="h-5 bg-slate-200 rounded w-28 animate-pulse"></div>
                  <div className="h-6 w-6 bg-slate-200 rounded-full animate-pulse"></div>
                </div>
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-pulse">
                      <div className="bg-slate-50 rounded-lg w-[4.5rem] h-[4.5rem] shrink-0 mr-4 border border-slate-100 flex flex-col items-center justify-center gap-1.5">
                        <div className="h-[9px] bg-slate-200 rounded w-10"></div>
                        <div className="h-[22px] bg-slate-200 rounded w-7"></div>
                        <div className="h-[9px] bg-slate-200 rounded w-6"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="h-[14px] bg-slate-200 rounded w-28"></div>
                        <div className="h-[12px] bg-slate-200 rounded w-4/5 mt-1.5"></div>
                        <div className="flex gap-3 mt-1.5">
                          <div className="h-[11px] bg-slate-200 rounded w-12"></div>
                          <div className="h-[11px] bg-slate-200 rounded w-16"></div>
                        </div>
                      </div>
                      <div className="h-4 w-4 bg-slate-200 rounded shrink-0 ml-2"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : matches.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-300">
                <p className="text-slate-500 text-sm mb-1">Aún no tienes partidos</p>
                <p className="text-xs text-slate-400">Cuando te unas, aparecerán aquí.</p>
              </div>
            ) : (
              <>
                {activeMatches.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 mb-3 px-1 flex items-center gap-2">
                      <span>Partidos Activos</span>
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-px rounded-full leading-4">{activeMatches.length}</span>
                    </h2>
                    <div className="space-y-3">
                      {activeMatches.map(m => {
                        const href = profile?.roles.includes("admin") ? `/match/${m.id}` : `/join/${m.id}`;
                        return (
                          <MatchCard
                            key={m.id}
                            match={m}
                            location={locationsMap[m.locationId]}
                            href={href}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeMatches.length === 0 && !nextMatch && (
                  <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-300">
                    <p className="text-slate-500 text-sm mb-1">No tienes partidos activos</p>
                    <p className="text-xs text-slate-400">Únete a un partido para verlo aquí.</p>
                  </div>
                )}

                {closedMatches.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-bold text-slate-800 mb-3 px-1 flex items-center gap-2">
                      <span>Historial</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-px rounded-full leading-4">{closedMatches.length}</span>
                    </h2>
                    <div className="space-y-3">
                      {closedMatches.map(m => {
                        const href = profile?.roles.includes("admin") ? `/match/${m.id}` : `/join/${m.id}`;
                        return (
                          <MatchCard
                            key={m.id}
                            match={m}
                            location={locationsMap[m.locationId]}
                            href={href}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
