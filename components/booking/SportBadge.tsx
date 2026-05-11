"use client";

import type { SportType } from "@/lib/domain/venue";
import { SPORT_LABELS } from "@/lib/domain/venue";

interface SportBadgeProps {
    sport: SportType;
    /** Si true, renderiza solo el emoji sin label (compacto). */
    iconOnly?: boolean;
    /** Tamaño: "sm" (default) o "md". */
    size?: "sm" | "md";
}

const SPORT_EMOJI: Record<SportType, string> = {
    football: "⚽",
    volleyball: "🏐",
    basketball: "🏀",
    tennis: "🎾",
    padel: "🏸",
    other: "🎯",
};

const SPORT_CLASSES: Record<SportType, string> = {
    football: "bg-emerald-50 text-emerald-700 border-emerald-100",
    volleyball: "bg-amber-50 text-amber-700 border-amber-100",
    basketball: "bg-orange-50 text-orange-700 border-orange-100",
    tennis: "bg-lime-50 text-lime-700 border-lime-100",
    padel: "bg-sky-50 text-sky-700 border-sky-100",
    other: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function SportBadge({ sport, iconOnly = false, size = "sm" }: SportBadgeProps) {
    const emoji = SPORT_EMOJI[sport];
    const classes = SPORT_CLASSES[sport];
    const sizeClasses = size === "md" ? "text-sm px-2.5 py-1" : "text-[11px] px-2 py-0.5";

    if (iconOnly) {
        return <span className="text-base leading-none" aria-label={SPORT_LABELS[sport]}>{emoji}</span>;
    }

    return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full border ${classes} ${sizeClasses}`}>
            <span className="leading-none">{emoji}</span>
            <span>{SPORT_LABELS[sport]}</span>
        </span>
    );
}
