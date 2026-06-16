"use client";

import { useEffect, useState, useMemo } from "react";
import { Star, ThumbsUp, ThumbsDown, Inbox } from "lucide-react";
import { getReviewsForMatch } from "@/lib/matchReview";
import type { MatchReview, DimensionValue } from "@/lib/domain/matchReview";
import type { Player } from "@/lib/domain/player";
import PlayerAvatar from "@/components/PlayerAvatar";

interface Props {
    matchId: string;
    /** Jugadores del partido — fuente para mostrar nombre + avatar del autor de cada review. */
    players?: Player[];
}

interface ReviewerInfo {
    name: string;
    photoURL?: string;
}

/** Construye un lookup uid → {name, photoURL} desde los jugadores del partido. */
function buildReviewerLookup(players: Player[] | undefined): Map<string, ReviewerInfo> {
    const map = new Map<string, ReviewerInfo>();
    for (const p of players ?? []) {
        if (p.uid) map.set(p.uid, { name: p.name, photoURL: p.photoURLThumb ?? p.photoURL });
    }
    return map;
}

interface DimensionStats {
    good: number;
    bad: number;
    skipped: number;
}

function calcDimensionStats(
    reviews: MatchReview[],
    key: "organization" | "levelBalance",
): DimensionStats {
    return reviews.reduce<DimensionStats>(
        (acc, r) => {
            const v: DimensionValue = r.dimensions?.[key] ?? null;
            if (v === "good") acc.good += 1;
            else if (v === "bad") acc.bad += 1;
            else acc.skipped += 1;
            return acc;
        },
        { good: 0, bad: 0, skipped: 0 },
    );
}

export default function ReviewsTab({ matchId, players }: Props) {
    const [reviews, setReviews] = useState<MatchReview[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reviewerLookup = useMemo(() => buildReviewerLookup(players), [players]);

    // matchId no cambia durante la vida del tab (es el partido del path), pero por
    // seguridad invalidamos resultados pasados con `cancelled`. El reset visual al
    // cambiar de partido lo provoca el unmount del componente.
    useEffect(() => {
        let cancelled = false;
        getReviewsForMatch(matchId)
            .then((data) => { if (!cancelled) setReviews(data); })
            .catch(() => { if (!cancelled) setError("No se pudieron cargar las calificaciones."); });
        return () => { cancelled = true; };
    }, [matchId]);

    const avgRating = useMemo(() => {
        if (!reviews || reviews.length === 0) return 0;
        return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    }, [reviews]);

    const distribution = useMemo(() => {
        const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
        if (reviews) {
            for (const r of reviews) {
                if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1] += 1;
            }
        }
        return counts;
    }, [reviews]);

    const orgStats = useMemo(() => calcDimensionStats(reviews ?? [], "organization"), [reviews]);
    const balanceStats = useMemo(() => calcDimensionStats(reviews ?? [], "levelBalance"), [reviews]);

    const withComment = useMemo(
        () => (reviews ?? []).filter((r) => r.comment && r.comment.trim().length > 0).length,
        [reviews],
    );

    if (error) {
        return (
            <div className="p-6 text-center">
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }

    if (!reviews) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (reviews.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Inbox size={28} className="text-slate-400" />
                </div>
                <p className="text-base font-bold text-slate-700">Sin calificaciones aún</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[260px]">
                    Los jugadores tienen 2 días desde el cierre para calificar el partido.
                </p>
            </div>
        );
    }

    const max = Math.max(...distribution);

    return (
        <div className="space-y-4" role="tabpanel" id="panel-reviews">
            {/* Overall rating card */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className="flex items-center gap-5">
                    <div className="flex flex-col items-center">
                        <p className="text-4xl font-black text-slate-800 leading-none">
                            {avgRating.toFixed(1)}
                        </p>
                        <div className="flex gap-0.5 mt-2">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                    key={n}
                                    size={14}
                                    className={n <= Math.round(avgRating) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}
                                />
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium uppercase tracking-wide">
                            {reviews.length} calificación{reviews.length !== 1 ? "es" : ""}
                        </p>
                    </div>

                    {/* Distribution */}
                    <div className="flex-1 space-y-1">
                        {[5, 4, 3, 2, 1].map((star) => {
                            const count = distribution[star - 1];
                            const pct = max > 0 ? (count / max) * 100 : 0;
                            return (
                                <div key={star} className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-500 font-bold w-3">{star}</span>
                                    <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-amber-400 h-full rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 w-4 text-right tabular-nums">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-3">
                <DimensionCard label="Organización" stats={orgStats} />
                <DimensionCard label="Nivel parejo" stats={balanceStats} />
            </div>

            {/* Calificaciones individuales (con autor) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                    <Star size={14} className="text-amber-400 fill-amber-400" />
                    <h3 className="text-sm font-bold text-slate-700">Calificaciones</h3>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                        {reviews.length}
                    </span>
                    {withComment > 0 && (
                        <span className="text-[10px] font-medium text-slate-400 ml-auto">
                            {withComment} con comentario
                        </span>
                    )}
                </div>
                <ul className="divide-y divide-slate-100">
                    {reviews.map((r) => {
                        const reviewer = reviewerLookup.get(r.userUid);
                        const name = reviewer?.name ?? "Jugador";
                        const photoURL = reviewer?.photoURL;
                        return (
                            <li key={r.id} className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                    {photoURL ? (
                                        <PlayerAvatar
                                            src={photoURL}
                                            alt={name}
                                            className="w-8 h-8 rounded-full overflow-hidden relative border border-slate-200 shrink-0"
                                            sizes="32px"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                                            {name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-700 truncate">{name}</p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <Star
                                                    key={n}
                                                    size={10}
                                                    className={n <= r.rating ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}
                                                />
                                            ))}
                                            <span className="text-[10px] text-slate-400 ml-1">
                                                {new Date(r.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {r.comment && r.comment.trim().length > 0 && (
                                    <p className="text-sm text-slate-600 leading-relaxed mt-2 pl-[42px]">
                                        &quot;{r.comment}&quot;
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

function DimensionCard({ label, stats }: { label: string; stats: DimensionStats }) {
    const positive = stats.good;
    const negative = stats.bad;
    const totalVotes = positive + negative;
    const positivePct = totalVotes > 0 ? Math.round((positive / totalVotes) * 100) : 0;

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{label}</p>
            <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                    <p className="text-2xl font-black text-slate-800 leading-none tabular-nums">
                        {positivePct}<span className="text-sm">%</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1 font-medium uppercase tracking-wide">positivo</p>
                </div>
                <div className="flex-1 space-y-1.5">
                    <Bar icon={<ThumbsUp size={11} className="text-emerald-500" />} value={positive} total={totalVotes} color="bg-emerald-400" />
                    <Bar icon={<ThumbsDown size={11} className="text-rose-500" />} value={negative} total={totalVotes} color="bg-rose-400" />
                    {stats.skipped > 0 && (
                        <p className="text-[9px] text-slate-300 pt-0.5">{stats.skipped} sin opinión</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function Bar({ icon, value, total, color }: { icon: React.ReactNode; value: number; total: number; color: string }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="flex items-center gap-1.5 text-xs">
            {icon}
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums w-4 text-right">{value}</span>
        </div>
    );
}
