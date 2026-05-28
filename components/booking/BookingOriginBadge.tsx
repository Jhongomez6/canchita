"use client";

import { Globe, Pencil } from "lucide-react";

type Origin = "player" | "admin";

interface BookingOriginBadgeProps {
    origin: Origin;
    className?: string;
}

export default function BookingOriginBadge({ origin, className }: BookingOriginBadgeProps) {
    const isPlayer = origin === "player";
    const Icon = isPlayer ? Globe : Pencil;
    const label = isPlayer ? "Reserva web" : "Reserva manual";
    const classes = isPlayer
        ? "bg-sky-50 text-sky-700"
        : "bg-violet-50 text-violet-700";

    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${classes} ${className ?? ""}`}>
            <Icon className="w-3 h-3" aria-hidden />
            {label}
        </span>
    );
}
