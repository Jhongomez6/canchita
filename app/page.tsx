"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getMyMatches } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";
import { getUserProfile } from "@/lib/users";
import Link from "next/link";
import { enablePushNotifications } from "@/lib/push";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Match } from "@/lib/domain/match";
import type { UserProfile } from "@/lib/domain/user";
import type { Location } from "@/lib/domain/location";
import MatchCard from "@/components/MatchCard";

export default function Home() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { justLoggedIn } = useAuth();
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [locationsMap, setLocationsMap] = useState<Record<string, Location>>({});

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile);
  }, [user]);

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
    if (!user) return;

    getMyMatches(user.uid).then(async matches => {
      // Sort matches by date ascending
      const sorted = [...matches].sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
      setMatches(sorted);

      const locationIds = Array.from(
        new Set(
          matches
            .map(m => m.locationId)
            .filter(Boolean)
        )
      );

      const entries: [string, Location][] = (
        await Promise.all(
          locationIds.map(async id => {
            const snap = await getDoc(doc(db, "locations", id));
            if (!snap.exists()) return null;

            return [snap.id, { id: snap.id, ...snap.data() }] as [string, Location];
          })
        )
      ).filter(Boolean) as [string, Location][];

      const map: Record<string, Location> = {};
      entries.forEach(([id, data]) => {
        map[id] = data;
      });

      setLocationsMap(map);
    });
  }, [user]);

  const nextMatch = matches.find(m => m.status === 'open');
  const upcomingMatches = matches.filter(m => m.id !== nextMatch?.id);

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
              <div className="bg-white text-slate-900 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-[#1f7a4f] uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded-md">
                    Próximo Partido
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {formatDateSpanish(nextMatch.date)}
                  </span>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-2xl shadow-sm">
                    ⚽
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">
                      {locationsMap[nextMatch.locationId]?.name || "Ubicación por definir"}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium">
                      {formatTime12h(nextMatch.time)}
                    </p>
                  </div>
                </div>

                <Link
                  href={profile?.roles.includes("admin") ? `/match/${nextMatch.id}` : `/join/${nextMatch.id}`}
                  className="block w-full py-3 bg-[#1f7a4f] text-white text-center rounded-xl font-bold shadow-md hover:bg-[#16603c] transition-all active:scale-[0.98]"
                >
                  Ver detalles
                </Link>
              </div>
            ) : (
              <div className="bg-white/10 rounded-2xl p-6 text-center backdrop-blur-sm border border-white/20">
                <p className="font-medium text-emerald-50">No tienes partidos próximos</p>
                <Link href="/explore" className="text-sm font-bold underline mt-1 block">
                  Buscar partidos
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
                            await enablePushNotifications(user.uid);
                            setShowPushPrompt(false);
                          } finally {
                            setEnablingPush(false);
                          }
                        }}
                        className="flex-1 py-2 bg-[#1f7a4f] text-white text-xs font-bold rounded-lg shadow-sm"
                      >
                        {enablingPush ? "Activando..." : "Activar"}
                      </button>
                      <button
                        onClick={() => setShowPushPrompt(false)}
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
                  <Link href="/admin/users" className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:border-emerald-200 transition-colors">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                    </div>
                    <span className="font-semibold text-sm text-slate-700">Usuarios</span>
                  </Link>
                </div>
              </div>
            )}

            {/* UPCOMING MATCHES LIST */}
            <div>
              <h2 className="text-sm font-bold text-slate-800 mb-3 px-1 flex justify-between items-center">
                <span>Tus Partidos</span>
                {matches.length > 0 && <span className="text-xs font-normal text-slate-500">{matches.length} total</span>}
              </h2>

              <div className="space-y-3">
                {matches.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-300">
                    <p className="text-slate-500 text-sm mb-1">Aún no tienes partidos</p>
                    <p className="text-xs text-slate-400">Cuando te unas, aparecerán aquí.</p>
                  </div>
                ) : (
                  upcomingMatches.map(m => {
                    const href = profile?.roles.includes("admin") ? `/match/${m.id}` : `/join/${m.id}`;
                    return (
                      <MatchCard
                        key={m.id}
                        match={m}
                        location={locationsMap[m.locationId]}
                        href={href}
                      />
                    )
                  })
                )}
                {/* Fallback if nextMatch was the only match */}
                {matches.length === 1 && nextMatch && (
                  <p className="text-center text-xs text-slate-400 py-4">No hay más partidos programados.</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
