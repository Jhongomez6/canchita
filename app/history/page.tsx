"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getMyMatches, getAllMatches } from "@/lib/matches";
import { isSuperAdmin, isAdmin } from "@/lib/domain/user";
import AuthGuard from "@/components/AuthGuard";
import { documentId, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import HistoryRow from "@/components/home/HistoryRow";
import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [locationsMap, setLocationsMap] = useState<Record<string, Location>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchMatches = profile && isSuperAdmin(profile)
      ? getAllMatches()
      : getMyMatches(user.uid);

    fetchMatches
      .then(async (matchesData) => {
        try {
          // Filter only closed matches and sort by date descending
          const closed = matchesData
            .filter(m => m.status === "closed")
            .sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

          setMatches(closed);

          // Fetch locations
          const locationIds = Array.from(
            new Set(
              closed
                .map(m => m.locationId)
                .filter(Boolean)
            )
          );

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
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Error fetching matches:", error);
        setLoading(false);
      });
  }, [user, authLoading, profile]);

  const isAdminUser = profile && isAdmin(profile);

  // Para el fallback de MVP

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
              {loading ? (
                <div className="h-3.5 bg-white/20 rounded w-28 mt-1 animate-pulse"></div>
              ) : (
                <p className="text-sm text-emerald-100/80">{matches.length} partidos jugados</p>
              )}
            </div>
          </div>

          <div className="px-5 py-5">
            {loading ? (
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
            ) : matches.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
                <Trophy size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 font-semibold mb-1">Sin historial aún</p>
                <p className="text-sm text-slate-500">Cuando cierres un partido, aparecerá aquí.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {matches.map(m => {
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
              </div>
            )}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
