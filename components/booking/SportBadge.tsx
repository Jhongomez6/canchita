"use client";

import type { SportType } from "@/lib/domain/venue";
import { SPORT_LABELS } from "@/lib/domain/venue";
import SportIcon from "./SportIcon";

interface SportBadgeProps {
    sport: SportType;
    /** Si true, renderiza solo el ícono sin label (compacto). */
    iconOnly?: boolean;
    /** Tamaño: "sm" (default) o "md". */
    size?: "sm" | "md";
}

const SPORT_CLASSES: Record<SportType, string> = {
    football: "bg-emerald-50 text-emerald-700 border-emerald-100",
    volleyball: "bg-amber-50 text-amber-700 border-amber-100",
    basketball: "bg-orange-50 text-orange-700 border-orange-100",
    tennis: "bg-lime-50 text-lime-700 border-lime-100",
    padel: "bg-sky-50 text-sky-700 border-sky-100",
    other: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function SportBadge({ sport, iconOnly = false, size = "sm" }: SportBadgeProps) {
    const classes = SPORT_CLASSES[sport];
    const sizeClasses = size === "md" ? "text-sm px-2.5 py-1" : "text-[11px] px-2 py-0.5";
    const iconSize = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";

    if (iconOnly) {
        return <SportIcon sport={sport} className={iconSize} label={SPORT_LABELS[sport]} />;
    }

    return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full border ${classes} ${sizeClasses}`}>
            <SportIcon sport={sport} className={iconSize} />
            <span>{SPORT_LABELS[sport]}</span>
        </span>
    );
}
