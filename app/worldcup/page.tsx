"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, BarChart3, HelpCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasWorldCupAccess } from "@/lib/domain/user";
import { useWorldCupData } from "@/lib/hooks/useWorldCupData";
import { logWorldCupPollOpened } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import WorldCupSkeleton from "@/components/skeletons/WorldCupSkeleton";
import WorldCupDayFilter from "@/components/worldcup/WorldCupDayFilter";
import WorldCupMatchCard from "@/components/worldcup/WorldCupMatchCard";
import BracketPredictor from "@/components/worldcup/BracketPredictor";
import WorldCupRules from "@/components/worldcup/WorldCupRules";
import type { WCPrediction, WCBracketPrediction } from "@/lib/domain/worldcup";

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
    // Datos de la polla con caché en memoria (revisitas no refetchean).
    const { data, loading, error, retry, setPrediction, setBracket } = useWorldCupData(user?.uid ?? null);
    const [selectedDayRaw, setSelectedDay] = useState<string>("");
    const [rulesOpen, setRulesOpen] = useState(false);
    const loggedOpenRef = useRef(false);

    const snapshot = useMemo(
        () => ({ displayName: profile?.name ?? "Jugador", photoURLThumb: profile?.photoURLThumb }),
        [profile?.name, profile?.photoURLThumb],
    );

    const config = data?.config ?? null;
    const matches = useMemo(() => data?.matches ?? [], [data]);
    const predictions = useMemo(() => data?.predictions ?? {}, [data]);
    const bracket = data?.bracket ?? null;

    // Gate de acceso + log de apertura, una vez que la config llega.
    useEffect(() => {
        if (!profile || !config) return;
        if (!hasWorldCupAccess(profile, config.pollEnabled)) {
            // Si el acceso por código está abierto, mandamos a ingresar el código;
            // si no, de vuelta al home.
            router.replace(config.joinByCodeOpen ? "/worldcup/join" : "/");
            return;
        }
        if (!loggedOpenRef.current) {
            loggedOpenRef.current = true;
            logWorldCupPollOpened();
        }
    }, [profile, config, router]);

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

    // Día por defecto (derivado en render, no en effect): el primero con partidos hoy
    // o el más próximo futuro. El usuario lo puede sobrescribir con el filtro.
    const defaultDay = useMemo(() => {
        if (days.length === 0) return "";
        const todayKey = dayKeyFmt.format(new Date());
        return days.find((d) => d.key >= todayKey)?.key ?? days[0].key;
    }, [days]);
    const selectedDay = selectedDayRaw || defaultDay;

    const visibleMatches = useMemo(
        () => matches.filter((m) => dayKeyFmt.format(new Date(m.kickoffMs)) === selectedDay),
        [matches, selectedDay],
    );

    const handlePredictionSaved = useCallback(
        (matchId: string, home: number, away: number) => {
            if (!user) return;
            const prev = predictions[matchId];
            setPrediction(matchId, {
                ...(prev ?? {
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
            } as WCPrediction);
        },
        [user, snapshot, predictions, setPrediction],
    );

    // Carga inicial sin caché.
    if (!data && loading) return <WorldCupSkeleton />;

    // Error sin datos: estado de error con reintentar (no pantalla en blanco ni cuelgue).
    if (!data && error) {
        return (
            <div className="max-w-2xl mx-auto px-4 pt-20 flex justify-center">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center max-w-sm w-full">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <AlertTriangle size={22} className="text-amber-500" />
                    </div>
                    <p className="font-bold text-slate-800">No pudimos cargar la polla</p>
                    <p className="text-sm text-slate-500 mt-1 mb-5">Revisá tu conexión e intentá de nuevo.</p>
                    <button
                        onClick={retry}
                        className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
                    >
                        <RefreshCw size={16} /> Reintentar
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return <WorldCupSkeleton />;

    // Sin acceso (o resolviéndose): el effect de arriba redirige; mostramos skeleton
    // para no parpadear el contenido de la polla antes del redirect.
    if (!profile || !hasWorldCupAccess(profile, data.config.pollEnabled)) return <WorldCupSkeleton />;

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
                            setBracket({
                                ...(bracket ?? {
                                    userId: user!.uid,
                                    displayName: snapshot.displayName,
                                    photoURLThumb: snapshot.photoURLThumb,
                                    createdAt: new Date().toISOString(),
                                }),
                                champion,
                                runnerUp,
                                updatedAt: new Date().toISOString(),
                            } as WCBracketPrediction)
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
