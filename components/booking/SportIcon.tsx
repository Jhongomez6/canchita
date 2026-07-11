"use client";

import { Volleyball, Target } from "lucide-react";
import type { SportType } from "@/lib/domain/venue";

interface SportIconProps {
    sport: SportType;
    /** Clases de tamaño/color. Usa currentColor (hereda el color del texto). */
    className?: string;
    /** Si se pasa, el ícono es accesible con ese label; si no, queda decorativo. */
    label?: string;
}

/**
 * Ícono vectorial monocromático por deporte, al estilo lucide (trazo,
 * `currentColor`, viewBox 24). Reemplaza los emoji (⚽/🏐…), que se veían
 * inconsistentes entre plataformas. Vóley y "otro" reutilizan lucide; fútbol,
 * básquet, tenis y pádel son SVGs propios en el mismo estilo.
 */
export default function SportIcon({ sport, className = "w-4 h-4", label }: SportIconProps) {
    const a11y = label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const };

    if (sport === "volleyball") return <Volleyball className={className} {...a11y} />;
    if (sport === "other") return <Target className={className} {...a11y} />;

    const stroke = {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        className,
        ...a11y,
    };

    switch (sport) {
        case "football":
            // Cancha de fútbol (elegido sobre el balón para diferenciarlo del vóley).
            return (
                <svg {...stroke}>
                    <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
                    <path d="M12 4.5V19.5" />
                    <circle cx="12" cy="12" r="2.6" />
                    <path d="M2.5 8.7H5.4V15.3H2.5" />
                    <path d="M21.5 8.7H18.6V15.3H21.5" />
                </svg>
            );
        case "basketball":
            return (
                <svg {...stroke}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3 V21" />
                    <path d="M3 12 H21" />
                    <path d="M5.3 5.3 C9 9 9 15 5.3 18.7" />
                    <path d="M18.7 5.3 C15 9 15 15 18.7 18.7" />
                </svg>
            );
        case "tennis":
            return (
                <svg {...stroke}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M5.2 5.5 C10 9 10 15 5.2 18.5" />
                    <path d="M18.8 5.5 C14 9 14 15 18.8 18.5" />
                </svg>
            );
        case "padel":
            return (
                <svg {...stroke}>
                    <path d="M12 3 C7.6 3 4.5 6 4.5 9.8 C4.5 13.2 7.6 15.2 12 15.2 C16.4 15.2 19.5 13.2 19.5 9.8 C19.5 6 16.4 3 12 3 Z" />
                    <path d="M12 15.2 V21" />
                    <path d="M9.6 21 H14.4" />
                </svg>
            );
        default:
            return <Target className={className} {...a11y} />;
    }
}
