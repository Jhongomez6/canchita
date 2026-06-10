"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, BarChart3, HelpCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasWorldCupAccess } from "@/lib/domain/user";
import { getWorldCupConfig, getWorldCupMatches, getUserPredictions, getUserBracketPrediction } from "@/lib/worldcup";
import { logWorldCupPollOpened } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import WorldCupSkeleton from "@/components/skeletons/WorldCupSkeleton";
import WorldCupDayFilter from "@/components/worldcup/WorldCupDayFilter";
import WorldCupMatchCard from "@/components/worldcup/WorldCupMatchCard";
import BracketPredictor from "@/components/worldcup/BracketPredictor";
import WorldCupRules from "@/components/worldcup/WorldCupRules";
import type { WCMatch, WCPrediction, WCConfig, WCBracketPrediction } from "@/lib/domain/worldcup";

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
    const [config, setConfig] = useState<WCConfig | null>(null);
    const [bracket, setBracket] = useState<WCBracketPrediction | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<string>("");
    const [rulesOpen, setRulesOpen] = useState(false);

    const snapshot = useMemo(
        () => ({ displayName: profile?.name ?? "Jugador", photoURLThumb: profile?.photoURLThumb }),
        [profile?.name, profile?.photoURLThumb],
    );

    useEffect(() => {
        if (!user || !profile) return;

        (async () => {
            try {
                const cfg = await getWorldCupConfig();
                if (!hasWorldCupAccess(profile, cfg.pollEnabled)) {
                    router.replace("/");
                    return;
                }
                logWorldCupPollOpened();
                setConfig(cfg);

                const [ms, preds, br] = await Promise.all([
                    getWorldCupMatches(),
                    getUserPredictions(user.uid),
                    getUserBracketPrediction(user.uid),
                ]);
                setMatches(ms);
                setBracket(br);
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
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setRulesOpen(true)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full"
                    >
                        <HelpCircle className="w-4 h-4" /> Reglas
                    </button>
                    <Link
                        href="/worldcup/leaderboard"
                        className="flex items-center gap-1.5 text-sm font-semibold text-[#1f7a4f] bg-[#1f7a4f]/10 px-3 py-1.5 rounded-full"
                    >
                        <BarChart3 className="w-4 h-4" /> Tabla
                    </Link>
                </div>
            </header>

            <WorldCupRules open={rulesOpen} onClose={() => setRulesOpen(false)} />

            {config && matches.length > 0 && (
                <div className="mb-4">
                    <BracketPredictor
                        matches={matches}
                        userId={user!.uid}
                        snapshot={snapshot}
                        config={config}
                        existing={bracket}
                        onSaved={(champion, runnerUp) =>
                            setBracket((prev) => ({
                                ...(prev ?? {
                                    userId: user!.uid,
                                    displayName: snapshot.displayName,
                                    photoURLThumb: snapshot.photoURLThumb,
                                    createdAt: new Date().toISOString(),
                                }),
                                champion,
                                runnerUp,
                                updatedAt: new Date().toISOString(),
                            } as WCBracketPrediction))
                        }
                    />
                </div>
            )}

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
