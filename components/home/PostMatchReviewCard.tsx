"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Star, X } from "lucide-react";
import { reviewCardDismissKey } from "@/lib/domain/matchReview";
import { logPostMatchReviewCardShown, logPostMatchReviewCardDismissed } from "@/lib/analytics";
import type { Match } from "@/lib/domain/match";

interface Props {
    match: Match;
    userUid: string;
    onDismiss?: () => void;
}

export default function PostMatchReviewCard({ match, userUid, onDismiss }: Props) {
    useEffect(() => {
        if (match.id) logPostMatchReviewCardShown(match.id);
    }, [match.id]);

    const dateLabel = match.date
        ? new Date(match.date + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" })
        : "partido reciente";

    function handleDismiss(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!match.id) return;
        localStorage.setItem(reviewCardDismissKey(match.id, userUid), new Date().toISOString());
        logPostMatchReviewCardDismissed(match.id);
        onDismiss?.();
    }

    return (
        <Link
            href={`/match/${match.id}/review?source=home_card`}
            className="relative flex items-center gap-3 bg-white border border-amber-100 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform mb-1"
        >
            {/* Dismiss in top-right corner */}
            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Descartar"
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
                <X size={14} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Star size={20} className="text-amber-400 fill-amber-400" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0 pr-6">
                <p className="text-sm font-bold text-slate-800 leading-tight">¿Cómo estuvo el partido?</p>
                <p className="text-xs text-slate-400 mt-0.5 capitalize truncate">{dateLabel}</p>
            </div>
        </Link>
    );
}
