"use client";

/**
 * Barra horizontal con XP actual / XP necesario para el próximo nivel.
 * Anima fluidamente al actualizarse.
 *
 * Acepta el estado completo del progreso (current/needed/nextLevelXp) y
 * pinta el color según el tier actual.
 */

import { motion } from "framer-motion";
import type { XpTier } from "@/lib/domain/xp";

const TIER_BAR_GRADIENT: Record<XpTier, string> = {
    suplente: "from-amber-600 to-orange-800",
    titular: "from-slate-200 to-slate-400",
    estrella: "from-amber-300 to-amber-500",
    capitan: "from-emerald-400 to-emerald-600",
    leyenda: "from-purple-400 via-pink-400 to-amber-300",
};

interface XpProgressBarProps {
    tier: XpTier;
    current: number;
    nextLevelXp: number;
    isMax?: boolean;
    height?: number;
}

export default function XpProgressBar({
    tier,
    current,
    nextLevelXp,
    isMax = false,
    height = 12,
}: XpProgressBarProps) {
    const pct = isMax
        ? 100
        : nextLevelXp > 0
            ? Math.min(100, Math.max(0, (current / nextLevelXp) * 100))
            : 0;

    return (
        <div
            className="w-full bg-slate-200 rounded-full overflow-hidden"
            style={{ height }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <motion.div
                className={`h-full bg-gradient-to-r ${TIER_BAR_GRADIENT[tier]} rounded-full`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 100, damping: 20, duration: 0.6 }}
            />
        </div>
    );
}
