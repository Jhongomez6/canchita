"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, BarChart3 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasWorldCupAccess } from "@/lib/domain/user";
import { getWorldCupConfig, getWorldCupMatches, getUserPredictions } from "@/lib/worldcup";
import { logWorldCupPollOpened } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import WorldCupSkeleton from "@/components/skeletons/WorldCupSkeleton";
import WorldCupDayFilter from "@/components/worldcup/WorldCupDayFilter";
import WorldCupMatchCard from "@/components/worldcup/WorldCupMatchCard";
import type { WCMatch, WCPrediction } from "@/lib/domain/worldcup";

// Clave de día (YYYY-MM-DD) y label corto en TZ Colombia
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
const dayLabelFmt = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "numeric",
    month: "short",
});

function WorldCupContent() {
    const { user, profile } = useAuth();
    const router = useRouter();
    const [matches, setMatches] = useState<WCMatch[]>([]);
    const [predictions, setPredictions] = useState<Record<string, WCPrediction>>({});
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<string>("");

    const snapshot = useMemo(
        () => ({ displayName: profile?.name ?? "Jugador", photoURLThumb: profile?.photoURLThumb }),
        [profile?.name, profile?.photoURLThumb],
    );

    useEffect(() => {
        if (!user || !profile) return;

        (async () => {
            try {
                const config = await getWorldCupConfig();
                if (!hasWorldCupAccess(profile, config.pollEnabled)) {
                    router.replace("/");
                    return;
                }
                logWorldCupPollOpened();

                const [ms, preds] = await Promise.all([
                    getWorldCupMatches(),
                    getUserPredictions(user.uid),
                ]);
                setMatches(ms);
                const map: Record<string, WCPrediction> = {};
                for (const p of preds) map[p.matchId] = p;
                setPredictions(map);
            } catch (err) {
                handleError(err, "Error al cargar la polla");
            } finally {
                setLoading(false);
            }
        })();
    }, [user, profile, router]);

    // Agrupar partidos por día (TZ Colombia)
    const days = useMemo(() => {
        const seen = new Map<string, string>();
        for (const m of matches) {
            const d = new Date(m.kickoffMs);
            const key = dayKeyFmt.format(d);
            if (!seen.has(key)) seen.set(key, dayLabelFmt.format(d));
        }
        return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
    }, [matches]);

    // Día por defecto: el primero con partidos hoy o el más próximo futuro
    useEffect(() => {
        if (selectedDay || days.length === 0) return;
        const todayKey = dayKeyFmt.format(new Date());
        const upcoming = days.find((d) => d.key >= todayKey);
        setSelectedDay(upcoming?.key ?? days[0].key);
    }, [days, selectedDay]);

    const visibleMatches = useMemo(
        () => matches.filter((m) => dayKeyFmt.format(new Date(m.kickoffMs)) === selectedDay),
        [matches, selectedDay],
    );

    const handlePredictionSaved = useCallback(
        (matchId: string, home: number, away: number) => {
            if (!user) return;
            setPredictions((prev) => ({
                ...prev,
                [matchId]: {
                    ...(prev[matchId] ?? {
                        id: `${user.uid}_${matchId}`,
                        userId: user.uid,
                        matchId,
                        displayName: snapshot.displayName,
                        photoURLThumb: snapshot.photoURLThumb,
                        createdAt: new Date().toISOString(),
                    }),
                    homeGoals: home,
                    awayGoals: away,
                    updatedAt: new Date().toISOString(),
                } as WCPrediction,
            }));
        },
        [user, snapshot],
    );

    if (loading) return <WorldCupSkeleton />;

    return (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 md:pb-8">
            <header className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-[#1f7a4f]" />
                    <h1 className="text-xl font-bold text-gray-900">Polla Mundial</h1>
                </div>
                <Link
                    href="/worldcup/leaderboard"
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#1f7a4f] bg-[#1f7a4f]/10 px-3 py-1.5 rounded-full"
                >
                    <BarChart3 className="w-4 h-4" /> Tabla
                </Link>
            </header>

            {days.length === 0 ? (
                <p className="text-center text-gray-400 bg-gray-50 rounded-xl p-8 mt-8">
                    Partidos próximamente.
                </p>
            ) : (
                <>
                    <WorldCupDayFilter days={days} selected={selectedDay} onSelect={setSelectedDay} />
                    <div className="space-y-3 mt-3">
                        {visibleMatches.map((m) => (
                            <WorldCupMatchCard
                                key={m.id}
                                match={m}
                                userId={user!.uid}
                                snapshot={snapshot}
                                userPrediction={predictions[m.id]}
                                onPredictionSaved={handlePredictionSaved}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function WorldCupPage() {
    return (
        <AuthGuard>
            <WorldCupContent />
        </AuthGuard>
    );
}
