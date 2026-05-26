"use client";

/**
 * Pill compacta con icon del tier + nombre del tier + número del nivel.
 * Usado en perfil, drawer ajeno, onboarding modal.
 *
 * Soporta 3 tamaños:
 *  - sm:  pill chica para listas o headers (ideal drawer)
 *  - md:  default
 *  - lg:  hero (perfil propio)
 */

import { motion } from "framer-motion";
import XpTierIcon from "./XpTierIcon";
import type { XpTier } from "@/lib/domain/xp";

const TIER_GRADIENT: Record<XpTier, string> = {
    suplente: "from-amber-700 to-orange-900",
    titular: "from-slate-300 to-slate-500",
    estrella: "from-amber-400 to-amber-600",
    capitan: "from-emerald-500 to-emerald-700",
    leyenda: "from-purple-500 via-pink-500 to-amber-400",
};

const TIER_LABEL: Record<XpTier, string> = {
    suplente: "Suplente",
    titular: "Titular",
    estrella: "Estrella",
    capitan: "Capitán",
    leyenda: "Leyenda",
};

const TIER_TEXT_COLOR: Record<XpTier, string> = {
    suplente: "text-amber-50",
    titular: "text-slate-900",
    estrella: "text-amber-950",
    capitan: "text-emerald-50",
    leyenda: "text-white",
};

interface XpBadgeProps {
    tier: XpTier;
    level: number;
    size?: "sm" | "md" | "lg";
    pulse?: boolean;
    className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md" | "lg", { wrap: string; icon: number; text: string }> = {
    sm: { wrap: "px-2 py-0.5 gap-1 text-[10px]", icon: 12, text: "text-[10px]" },
    md: { wrap: "px-2.5 py-1 gap-1.5 text-xs", icon: 14, text: "text-xs" },
    lg: { wrap: "px-3 py-1.5 gap-2 text-sm", icon: 16, text: "text-sm" },
};

export default function XpBadge({ tier, level, size = "md", pulse = false, className = "" }: XpBadgeProps) {
    const sz = SIZE_CLASSES[size];

    return (
        <motion.div
            animate={pulse ? {
                scale: [1, 1.05, 1],
                transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
            } : undefined}
            className={`inline-flex items-center rounded-full bg-gradient-to-r ${TIER_GRADIENT[tier]} ${TIER_TEXT_COLOR[tier]} font-bold shadow-sm ${sz.wrap} ${className}`}
        >
            <XpTierIcon tier={tier} size={sz.icon} className="drop-shadow" />
            <span className="leading-none">
                {TIER_LABEL[tier]} · Nivel {level}
            </span>
        </motion.div>
    );
}
