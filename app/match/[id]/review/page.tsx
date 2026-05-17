"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import toast from "react-hot-toast";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";

import type { Match } from "@/lib/domain/match";
import type { KudoType, ReportReason, DimensionValue, MatchReview } from "@/lib/domain/matchReview";
import {
    wasUserInMatch,
    isReviewWindowExpired,
    getReviewWindowEnd,
} from "@/lib/domain/matchReview";
import { submitMatchReview, getMyReview, getKudosGivenInMatch } from "@/lib/matchReview";
import { handleError } from "@/lib/utils/error";

import MatchReviewSkeleton from "@/components/skeletons/MatchReviewSkeleton";
import ExperienceRatingSection from "@/components/match-review/ExperienceRatingSection";
import MvpBanner from "@/components/match-review/MvpBanner";
import TeammateFeedbackList, { type Teammate } from "@/components/match-review/TeammateFeedbackList";
import KudosSheet from "@/components/match-review/KudosSheet";
import ReportSheet from "@/components/match-review/ReportSheet";
import PlayerCardDrawer from "@/components/PlayerCardDrawer";
import {
    logPostMatchReviewStarted,
    logPostMatchReviewSubmitted,
    logPostMatchReviewAbandoned,
    logKudoGiven,
    logReportSubmitted,
} from "@/lib/analytics";

interface ReportPayload {
    reason: ReportReason;
    comment: string;
}

interface DraftState {
    rating: number | null;
    dimensions: { organization: DimensionValue; levelBalance: DimensionValue };
    comment: string;
    kudos: Record<string, KudoType | null>;
    reports: Record<string, ReportPayload | null>;
}

function draftKey(matchId: string, uid: string) {
    return `review_draft_${matchId}_${uid}`;
}

export default function MatchReviewPage() {
    const { id: matchId } = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const { user, profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [match, setMatch] = useState<Match | null>(null);
    const [existingReview, setExistingReview] = useState<MatchReview | null | undefined>(undefined);
    const [hasVotedMvp, setHasVotedMvp] = useState(false);

    // Form state
    const [rating, setRating] = useState<number | null>(null);
    const [dimensions, setDimensions] = useState<{ organization: DimensionValue; levelBalance: DimensionValue }>({
        organization: null,
        levelBalance: null,
    });
    const [comment, setComment] = useState("");
    const [kudos, setKudos] = useState<Record<string, KudoType | null>>({});
    const [reports, setReports] = useState<Record<string, ReportPayload | null>>({});

    // Sheet state
    const [kudosTarget, setKudosTarget] = useState<Teammate | null>(null);
    const [reportTarget, setReportTarget] = useState<Teammate | null>(null);
    const [profileCardUid, setProfileCardUid] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const abandonedRef = useRef(false);

    // Load match + existing review + MVP vote status
    useEffect(() => {
        if (!user || !matchId) return;
        let cancelled = false;

        (async () => {
            try {
                const [matchSnap, review, kudosGiven] = await Promise.all([
                    getDoc(doc(db, "matches", matchId)),
                    getMyReview(matchId, user.uid),
                    getKudosGivenInMatch(matchId, user.uid),
                ]);

                if (cancelled) return;

                const matchData = matchSnap.exists() ? ({ id: matchSnap.id, ...matchSnap.data() } as Match) : null;
                setMatch(matchData);
                setExistingReview(review);

                if (matchData) {
                    // Check MVP vote
                    const mvpVotes = (matchData as Match & { mvpVotes?: Record<string, string> }).mvpVotes ?? {};
                    setHasVotedMvp(user.uid in mvpVotes);
                }

                // Restore draft or pre-fill kudos from existing
                if (!review) {
                    const savedDraft = localStorage.getItem(draftKey(matchId, user.uid));
                    if (savedDraft) {
                        try {
                            const draft: DraftState = JSON.parse(savedDraft);
                            setRating(draft.rating);
                            setDimensions(draft.dimensions);
                            setComment(draft.comment);
                            setKudos(draft.kudos);
                            setReports(draft.reports);
                        } catch { /* corrupt draft, ignore */ }
                    }
                } else {
                    // Pre-fill kudos already given in this match
                    const kudosMap: Record<string, KudoType> = {};
                    kudosGiven.forEach((k) => { kudosMap[k.recipientUid] = k.type; });
                    setKudos(kudosMap);
                }

                // Log analytics source
                const source = searchParams.get("source") as "home_card" | "in_app_notif" | "direct" | null;
                logPostMatchReviewStarted(matchId, source ?? "direct");
            } catch (e) {
                toast.error("No se pudo cargar la información del partido.");
                console.error(e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [matchId, user, searchParams]);

    // Persist draft to localStorage
    useEffect(() => {
        if (!user || !matchId || existingReview || submitted) return;
        const draft: DraftState = { rating, dimensions, comment, kudos, reports };
        localStorage.setItem(draftKey(matchId, user.uid), JSON.stringify(draft));
    }, [rating, dimensions, comment, kudos, reports, matchId, user, existingReview, submitted]);

    // Log abandoned on unmount
    useEffect(() => {
        return () => {
            if (!abandonedRef.current && matchId && !submitted) {
                logPostMatchReviewAbandoned(matchId);
            }
        };
    }, [matchId, submitted]);

    const teammates = useCallback((): Teammate[] => {
        if (!match || !user) return [];
        const seen = new Set<string>();
        const result: Teammate[] = [];
        const addTeam = (team: Teammate[]) => {
            team.forEach((p) => {
                if (!p.uid || p.uid.startsWith("guest_") || p.uid === user.uid || seen.has(p.uid)) return;
                seen.add(p.uid);
                result.push(p);
            });
        };
        addTeam((match.teams?.A ?? []) as Teammate[]);
        addTeam((match.teams?.B ?? []) as Teammate[]);
        if (result.length === 0) {
            // Fallback: use confirmed players array
            (match.players ?? []).forEach((p) => {
                if (!p.uid || p.uid.startsWith("guest_") || p.uid === user.uid || !p.confirmed || seen.has(p.uid)) return;
                seen.add(p.uid);
                result.push({ uid: p.uid, name: p.name, photoURL: p.photoURL, primaryPosition: p.primaryPosition });
            });
        }
        return result;
    }, [match, user]);

    async function handleSubmit() {
        if (!match || !user || !profile || !rating) return;
        setSubmitting(true);
        abandonedRef.current = true;

        try {
            const tm = teammates();
            const kudoEntries = Object.entries(kudos).filter(([, type]) => type !== null) as [string, KudoType][];
            const reportEntries = Object.entries(reports).filter(([, r]) => r !== null) as [string, ReportPayload][];

            // Una sola callable atómica: review + todos los kudos + todos los reportes en una transacción server-side
            await submitMatchReview(matchId, {
                userName: profile.name,
                rating,
                dimensions,
                comment,
                kudos: kudoEntries.flatMap(([recipientUid, type]) => {
                    const recipient = tm.find((t) => t.uid === recipientUid);
                    return recipient ? [{ recipientUid, recipientName: recipient.name, type }] : [];
                }),
                reports: reportEntries.flatMap(([reportedUid, payload]) => {
                    const target = tm.find((t) => t.uid === reportedUid);
                    return target ? [{ reportedUid, reportedName: target.name, reason: payload.reason, comment: payload.comment }] : [];
                }),
            });

            // Analytics post-success
            kudoEntries.forEach(([, type]) => logKudoGiven(matchId, type));
            reportEntries.forEach(([, payload]) => logReportSubmitted(matchId, payload.reason));
            logPostMatchReviewSubmitted({
                matchId,
                rating,
                kudosGivenCount: kudoEntries.length,
                reportsGivenCount: reportEntries.length,
                hasComment: comment.trim().length > 0,
            });

            localStorage.removeItem(draftKey(matchId, user.uid));
            setSubmitted(true);
            toast.success("¡Gracias! Tu calificación fue enviada.");
        } catch (e) {
            handleError(e, "Error al enviar");
            setSubmitting(false);
            abandonedRef.current = false;
        }
    }

    if (loading || !user) return <MatchReviewSkeleton />;

    if (!match) {
        return (
            <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center pb-24">
                <p className="text-slate-500">Partido no encontrado.</p>
                <Link href="/" className="mt-3 text-sm text-emerald-600 font-semibold">Volver al inicio</Link>
            </main>
        );
    }

    // Guard: user not in match
    if (!wasUserInMatch(match, user.uid)) {
        return (
            <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center pb-24 px-5 text-center">
                <p className="text-slate-700 font-semibold">No participaste en este partido</p>
                <p className="text-sm text-slate-400 mt-1">Solo los jugadores que estuvieron en el partido pueden calificar.</p>
                <Link href="/" className="mt-4 text-sm text-emerald-600 font-semibold">Volver al inicio</Link>
            </main>
        );
    }

    // Guard: match reopened
    if (match.status !== "closed") {
        return (
            <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center pb-24 px-5 text-center">
                <p className="text-slate-700 font-semibold">El partido fue reabierto</p>
                <p className="text-sm text-slate-400 mt-1">Las calificaciones están congeladas hasta que se cierre nuevamente.</p>
                <Link href={`/join/${matchId}`} className="mt-4 text-sm text-emerald-600 font-semibold">Ver el partido</Link>
            </main>
        );
    }

    // Guard: window expired
    if (match.closedAt && isReviewWindowExpired(match.closedAt)) {
        const expiredOn = getReviewWindowEnd(match.closedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long" });
        return (
            <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center pb-24 px-5 text-center">
                <Clock size={40} className="text-slate-300 mb-3" />
                <p className="text-slate-700 font-semibold">La ventana de calificación cerró</p>
                <p className="text-sm text-slate-400 mt-1">Venció el {expiredOn}.</p>
                <Link href="/" className="mt-4 text-sm text-emerald-600 font-semibold">Volver al inicio</Link>
            </main>
        );
    }

    const tm = teammates();

    // Already submitted state
    if (submitted || existingReview) {
        return (
            <main className="min-h-screen bg-slate-50 pb-24">
                <div className="max-w-md mx-auto">
                    <div className="bg-[#1f7a4f] text-white p-5 rounded-b-[2.5rem] shadow-lg pt-safe flex items-center gap-3">
                        <Link href="/" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                            <ArrowLeft size={20} />
                        </Link>
                        <h1 className="text-xl font-black">Califica partido</h1>
                    </div>
                    <div className="px-5 py-10 flex flex-col items-center text-center">
                        <CheckCircle2 size={56} className="text-emerald-500 mb-4" />
                        <h2 className="text-lg font-bold text-slate-800">Ya calificaste este partido</h2>
                        <p className="text-sm text-slate-400 mt-1">Gracias por tu calificación. Las reviews son definitivas.</p>
                        <Link
                            href={`/join/${matchId}`}
                            className="mt-5 px-6 py-3 bg-[#1f7a4f] text-white rounded-xl font-bold text-sm active:scale-[0.97] transition-transform"
                        >
                            Ver el partido
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 pb-44">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-[#1f7a4f] text-white p-5 rounded-b-[2.5rem] shadow-lg pt-safe flex items-center gap-3">
                    <Link href="/" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-black">Califica el partido</h1>
                        <p className="text-sm text-emerald-100/80 truncate">
                            {match.locationSnapshot?.name ?? "Partido"}
                        </p>
                    </div>
                </div>

                <div className="px-4 pt-4 space-y-4">
                    {/* MVP Banner */}
                    {match.closedAt && (
                        <MvpBanner
                            matchId={matchId}
                            closedAt={match.closedAt}
                            hasVotedMvp={hasVotedMvp}
                        />
                    )}

                    {/* Experience rating */}
                    <ExperienceRatingSection
                        rating={rating}
                        dimensions={dimensions}
                        comment={comment}
                        onRatingChange={setRating}
                        onDimensionChange={(key, val) => setDimensions((prev) => ({ ...prev, [key]: val }))}
                        onCommentChange={setComment}
                    />

                    {/* Teammates */}
                    <TeammateFeedbackList
                        teammates={tm}
                        kudos={kudos}
                        reports={reports}
                        onKudoTap={setKudosTarget}
                        onReportTap={setReportTarget}
                        onPlayerTap={(p) => setProfileCardUid(p.uid)}
                    />

                    {/* Espacio para que el contenido no quede tapado por el submit sticky */}
                    <div className="h-4" />
                </div>
            </div>

            {/* Sticky submit bar */}
            <div
                className="fixed left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
                style={{
                    bottom: 'calc(52px + max(env(safe-area-inset-bottom), 4px))',
                }}
            >
                <div className="max-w-md mx-auto">
                    <button
                        type="button"
                        disabled={!rating || submitting}
                        onClick={handleSubmit}
                        className="w-full py-4 rounded-2xl font-bold text-sm bg-[#1f7a4f] text-white disabled:opacity-40 active:scale-[0.98] transition-all shadow-md"
                    >
                        {submitting ? "Enviando..." : "Enviar"}
                    </button>
                </div>
            </div>

            {/* Kudos sheet */}
            <KudosSheet
                open={kudosTarget !== null}
                recipientName={kudosTarget?.name ?? ""}
                currentKudo={kudosTarget ? (kudos[kudosTarget.uid] ?? null) : null}
                onSelect={(type) => {
                    if (!kudosTarget) return;
                    setKudos((prev) => ({ ...prev, [kudosTarget.uid]: type }));
                }}
                onClose={() => setKudosTarget(null)}
            />

            {/* Report sheet */}
            <ReportSheet
                open={reportTarget !== null}
                reportedName={reportTarget?.name ?? ""}
                currentReport={reportTarget ? (reports[reportTarget.uid] ?? null) : null}
                onConfirm={(payload) => {
                    if (!reportTarget) return;
                    setReports((prev) => ({ ...prev, [reportTarget.uid]: payload }));
                }}
                onClose={() => setReportTarget(null)}
            />

            {/* FIFA player card drawer */}
            <PlayerCardDrawer
                isOpen={profileCardUid !== null}
                playerUid={profileCardUid}
                onClose={() => setProfileCardUid(null)}
            />
        </main>
    );
}
