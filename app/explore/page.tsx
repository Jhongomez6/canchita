"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { collection, doc, getDoc, onSnapshot, query, where, QuerySnapshot, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import MatchCard from "@/components/MatchCard";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import MatchListSkeleton from "@/components/skeletons/MatchListSkeleton";
import { handleError } from "@/lib/utils/error";
import { sanitizeMatchCode } from "@/lib/matchCode";
import { logMatchJoinedViaExplore, logJoinByCodeClicked } from "@/lib/analytics";
import { Search, Lock, Trophy, ArrowRight, Sparkles } from "lucide-react";

export default function ExplorePage() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();

    const [matches, setMatches] = useState<Match[]>([]);
    const [locationsMap, setLocationsMap] = useState<Record<string, Location>>({});
    const [loading, setLoading] = useState(true);

    // Invite code state
    const [inviteCode, setInviteCode] = useState("");
    const [isSubmittingCode, setIsSubmittingCode] = useState(false);

    useEffect(() => {
        // Wait until auth is resolved and the profile is loaded. Unauthenticated users shouldn't read matches.
        if (authLoading || !profile) return;

        // 🔴 Real-time listener — updates when any match opens or closes
        const isSuperAdmin = profile?.adminType === "super_admin";
        const q = query(
            collection(db, "matches"),
            where("status", "==", "open")
        );

        const unsubscribe = onSnapshot(q, async (snapshot: QuerySnapshot) => {
            const allOpenMatches = snapshot.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() } as Match));
            const visibleMatches = isSuperAdmin ? allOpenMatches : allOpenMatches.filter(m => !m.isPrivate);
            setMatches(visibleMatches);

            // Fetch locations for these matches
            const locationIds: string[] = Array.from(
                new Set(
                    visibleMatches
                        .map((m: Match) => m.locationId as string)
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
            setLoading(false);
        }, (err: Error) => {
            handleError(err, "Error al buscar partidos abiertos");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile, authLoading]);

    const handleInviteCodeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        logJoinByCodeClicked("explore");
        const code = sanitizeMatchCode(inviteCode);
        if (!code) return;

        setIsSubmittingCode(true);
        // Let the join page handle existence/validation
        router.push(`/join/${code}`);
    };

    return (
        <AuthGuard>
            <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
                <div className="max-w-md mx-auto">

                    {/* HEADER */}
                    <div className="bg-[#1f7a4f] text-white p-6 rounded-b-[2.5rem] shadow-lg mb-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-1">Buscar Partidos</h1>
                                <p className="text-emerald-100 text-sm">Encuentra dónde jugar hoy</p>
                            </div>
                            <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-sm border border-white/10">
                                <Search className="w-6 h-6 text-white" />
                            </div>
                        </div>
                    </div>

                    <div className="px-5 space-y-6">

                        {/* PRIVATE INVITE CODE SECTION */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                            <h2 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-emerald-600" />
                                <span>Código o link de invitación</span>
                            </h2>
                            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                ¿Te pasaron un código o link por WhatsApp para un partido? Pégalo aquí.
                            </p>

                            <form onSubmit={handleInviteCodeSubmit} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="ABC123XYZ o https://lacanchita.app/join/ABC123XYZ"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value)}
                                    // Cambiado de text-sm a text-base para prevenir auto-zoom en iOS Safari
                                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent transition-all"
                                />
                                <button
                                    type="submit"
                                    disabled={!inviteCode.trim() || isSubmittingCode}
                                    className={`px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${!inviteCode.trim() || isSubmittingCode
                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-[#1f7a4f] text-white hover:bg-[#16603c] active:scale-95 shadow-lg shadow-emerald-900/10"
                                        }`}
                                >
                                    {isSubmittingCode ? "..." : (
                                        <>
                                            Ir
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* OPEN MATCHES LIST */}
                        <div>
                            <h2 className="text-sm font-bold text-slate-800 mb-4 px-1 flex justify-between items-center min-h-[22px]">
                                <span>Partidos Abiertos{profile?.adminType === "super_admin" ? " (todos)" : ""}</span>
                                {loading && (
                                    <div className="h-[20px] w-[85px] bg-slate-200 rounded-full animate-pulse"></div>
                                )}
                                {!loading && matches.length > 0 && (
                                    <span className="bg-emerald-100 text-emerald-700 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        {matches.length} Disponibles
                                    </span>
                                )}
                            </h2>

                            {loading ? (
                                <MatchListSkeleton />
                            ) : matches.length === 0 ? (
                                <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-300">
                                    <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-inner overflow-hidden relative">
                                    <Trophy className="w-10 h-10 text-slate-300 relative z-10" />
                                    <Sparkles className="absolute top-4 right-4 w-3 h-3 text-emerald-400 opacity-40" />
                                </div>
                                    <p className="text-slate-800 font-bold text-sm mb-1">No hay partidos públicos</p>
                                    <p className="text-xs text-slate-500 leading-relaxed max-w-[200px] mx-auto">
                                        Actualmente no hay partidos abiertos programados. Vuelve pronto o contacta al administrador.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {matches.map(m => {
                                        const href = profile?.roles.includes("admin") ? `/match/${m.id}` : `/join/${m.id}`;

                                        // Count spots logic (Optional enhancement)
                                        const isClosed = m.status === 'closed';
                                        const maxPlayers = m.maxPlayers ?? Infinity;
                                        const confirmedCount = (m.players?.filter(p => p.confirmed).length || 0) + (m.guests?.filter(g => !g.isWaitlist).length || 0);
                                        const waitlistCount = (m.players?.filter(p => p.isWaitlist && !p.confirmed).length || 0) + (m.guests?.filter(g => g.isWaitlist && !g.confirmed).length || 0);
                                        const spotsLeft = maxPlayers !== Infinity ? Math.max(0, maxPlayers - confirmedCount) : null;
                                        const isFull = spotsLeft === 0;

                                        return (
                                            <div key={m.id} className="relative group" onClick={() => logMatchJoinedViaExplore(m.id)}>
                                                <MatchCard
                                                    match={m}
                                                    location={locationsMap[m.locationId]}
                                                    href={href}
                                                />

                                                {/* Status overlays over the default MatchCard visual limits */}
                                                {spotsLeft !== null && !isClosed && (
                                                    <div className={`absolute -top-2 -right-2 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm border border-white z-10 ${isFull
                                                        ? "bg-red-500 text-white"
                                                        : spotsLeft <= 2
                                                            ? "bg-amber-400 text-amber-900"
                                                            : "bg-emerald-400 text-emerald-900"
                                                        }`}>
                                                        {isFull ? (waitlistCount > 0 ? `Lleno (+${waitlistCount} espera)` : "Lleno") : `${spotsLeft} cupos`}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}
