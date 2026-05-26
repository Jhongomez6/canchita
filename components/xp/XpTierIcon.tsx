"use client";

/**
 * Icon del tier de XP. Mapea cada tier a un icon de lucide-react.
 * Reusable en XpBadge, XpStatsSection, modales, onboarding.
 */

import { Sprout, Shirt, Star, Trophy, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { XpTier } from "@/lib/domain/xp";

const TIER_ICON: Record<XpTier, LucideIcon> = {
    suplente: Sprout,
    titular: Shirt,
    estrella: Star,
    capitan: Trophy,
    leyenda: Crown,
};

interface XpTierIconProps {
    tier: XpTier;
    size?: number;
    className?: string;
}

export default function XpTierIcon({ tier, size = 16, className = "" }: XpTierIconProps) {
    const Icon = TIER_ICON[tier];
    return <Icon size={size} className={className} />;
}
