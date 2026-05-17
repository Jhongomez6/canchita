"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, ChevronRight } from "lucide-react";
import { shouldShowMvpBanner } from "@/lib/domain/matchReview";

interface Props {
    matchId: string;
    closedAt: string;
    hasVotedMvp: boolean;
}

export default function MvpBanner({ matchId, closedAt, hasVotedMvp }: Props) {
    const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

    useEffect(() => {
        const compute = () => {
            if (!shouldShowMvpBanner(closedAt, hasVotedMvp)) {
                setMinutesLeft(null);
                return;
            }
            const windowEnd = new Date(closedAt).getTime() + 2 * 60 * 60 * 1000;
            const diff = Math.max(0, Math.floor((windowEnd - Date.now()) / 60000));
            setMinutesLeft(diff);
        };

        compute();
        const id = setInterval(compute, 30_000);
        return () => clearInterval(id);
    }, [closedAt, hasVotedMvp]);

    if (minutesLeft === null) return null;

    const timeLabel = minutesLeft < 60
        ? `${minutesLeft} min`
        : `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}min`;

    return (
        <Link
            href={`/join/${matchId}`}
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-4 active:scale-[0.98] transition-transform"
        >
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Crown size={18} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800 leading-tight">¿Ya votaste el MVP?</p>
                <p className="text-xs text-amber-600 mt-0.5">
                    Quedan <span className="font-semibold">{timeLabel}</span> para votar
                </p>
            </div>
            <ChevronRight size={16} className="text-amber-400 shrink-0" />
        </Link>
    );
}
