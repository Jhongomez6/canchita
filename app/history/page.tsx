"use client";

import { useAuth } from "@/lib/AuthContext";
import { useCallback, useEffect, useState } from "react";
import { isSuperAdmin, isAdmin } from "@/lib/domain/user";
import { getClosedMatchesPage } from "@/lib/matches";
import { getLocationsByIds } from "@/lib/locations";
import AuthGuard from "@/components/AuthGuard";
import HistoryRow from "@/components/home/HistoryRow";
import { ArrowLeft, Trophy, AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import type { DocumentSnapshot } from "firebase/firestore";

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const isSuperAdminUser = !!(profile && isSuperAdmin(profile));
  const isAdminUser = profile && isAdmin(profile);

  const [matches, setMatches] = useState<Match[]>([]);
  const [locationsMap, setLocationsMap] = useState<Record<string, Location>>({});
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (!user) return;
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const { matches: page, lastDoc: ld, reachedEnd } = await getClosedMatchesPage(
          user.uid,
          isSuperAdminUser,
          PAGE_SIZE,
          reset ? undefined : (lastDoc ?? undefined),
        );
        // Sedes de la página (en lote). Se mergean con las ya cargadas.
        const locs = await getLocationsByIds(page.map((m) => m.locationId));
        setMatches((prev) => (reset ? page : [...prev, ...page]));
        setLocationsMap((prev) => ({ ...prev, ...locs }));
        setLastDoc(ld);
        setHasMore(!reachedEnd && ld !== null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, isSuperAdminUser, lastDoc],
  );

  // Primera carga cuando hay sesión. La key (uid) cambia → reset.
  useEffect(() => {
    if (!user) return;
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, isSuperAdminUser]);

  // Mostrados ordenados por fecha/hora DESC (las páginas vienen por createdAt).
  const sorted = [...matches].sort(
    (a, b) =>
      new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime(),
  );

  const showSkeleton = (authLoading || loading) && matches.length === 0;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
        <div className="max-w-md mx-auto">
          {/* HEADER */}
          <div className="bg-[#1f7a4f] text-white p-5 rounded-b-[2.5rem] shadow-lg pt-safe flex items-center gap-3">
            <Link href="/" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-black">Historial Completo</h1>
              {showSkeleton ? (
                <div className="h-3.5 bg-white/20 rounded w-28 mt-1 animate-pulse"></div>
              ) : (
                <p className="text-sm text-emerald-100/80">
                  {sorted.length}
                  {hasMore ? "+" : ""} partidos jugados
                </p>
              )}
            </div>
          </div>

          <div className="px-5 py-5">
            {showSkeleton ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-100 animate-pulse">
                    <div className="w-14 h-14 bg-slate-200 rounded-lg shrink-0"></div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-200 rounded w-32"></div>
                      <div className="h-2 bg-slate-200 rounded w-20"></div>
                    </div>
                    <div className="w-7 h-7 bg-slate-200 rounded shrink-0"></div>
                  </div>
                ))}
              </div>
            ) : error && matches.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle size={22} className="text-amber-500" />
                </div>
                <p className="text-slate-700 font-semibold mb-1">No pudimos cargar tu historial</p>
                <p className="text-sm text-slate-500 mb-5">Revisá tu conexión e intentá de nuevo.</p>
                <button
                  onClick={() => loadPage(true)}
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-5 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
                >
                  <RefreshCw size={16} />
                  Reintentar
                </button>
              </div>
            ) : matches.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
                <Trophy size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 font-semibold mb-1">Sin historial aún</p>
                <p className="text-sm text-slate-500">Cuando cierres un partido, aparecerá aquí.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sorted.map((m) => {
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

                {/* Ver más */}
                {hasMore && (
                  <button
                    onClick={() => loadPage(false)}
                    disabled={loadingMore}
                    className="w-full mt-2 py-3 text-sm text-emerald-700 font-semibold hover:text-emerald-800 disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? "Cargando..." : "Ver más antiguos"}
                  </button>
                )}

                {/* Error al paginar con datos ya visibles */}
                {error && matches.length > 0 && (
                  <button
                    onClick={() => loadPage(false)}
                    className="w-full flex items-center justify-center gap-2 py-2 mt-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-xs font-semibold active:scale-[0.99] transition-transform"
                  >
                    <RefreshCw size={13} />
                    No se pudo cargar más. Tocá para reintentar.
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
