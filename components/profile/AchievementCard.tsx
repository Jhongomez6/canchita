"use client";

/**
 * Card individual de un achievement.
 * Desbloqueado: color tier + icon + label + XP bonus
 * Bloqueado: gris desaturado + icon en blanco y negro + "Bloqueado"
 */

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import type { AchievementDef } from "@/lib/domain/xp";

const TIER_BG: Record<"bronze" | "silver" | "gold" | "platinum", string> = {
    bronze: "bg-gradient-to-br from-amber-700 to-orange-900",
    silver: "bg-gradient-to-br from-slate-300 to-slate-500",
    gold: "bg-gradient-to-br from-amber-400 to-amber-600",
    platinum: "bg-gradient-to-br from-cyan-300 via-blue-400 to-purple-500",
};

const TIER_TEXT: Record<"bronze" | "silver" | "gold" | "platinum", string> = {
    bronze: "text-amber-50",
    silver: "text-slate-900",
    gold: "text-amber-950",
    platinum: "text-white",
};

interface AchievementCardProps {
    achievement: AchievementDef;
    unlocked: boolean;
    unlockedAt?: string;
}

export default function AchievementCard({ achievement, unlocked, unlockedAt }: AchievementCardProps) {
    return (
        <motion.div
            whileHover={{ scale: unlocked ? 1.03 : 1 }}
            className={`relative rounded-2xl p-3 aspect-[3/4] flex flex-col items-center justify-between text-center overflow-hidden ${
                unlocked
                    ? `${TIER_BG[achievement.tier]} ${TIER_TEXT[achievement.tier]} shadow-md`
                    : "bg-slate-100 text-slate-400"
            }`}
        >
            {!unlocked && (
                <Lock size={14} className="absolute top-2 right-2 text-slate-400" />
            )}

            <div className={`text-4xl ${unlocked ? "" : "grayscale opacity-40"}`}>
                {achievement.icon}
            </div>

            <div>
                <p className={`text-[11px] font-bold leading-tight ${unlocked ? "" : "text-slate-500"}`}>
                    {achievement.label}
                </p>
                <p className={`text-[9px] leading-tight mt-0.5 ${unlocked ? "opacity-80" : "text-slate-400"}`}>
                    {achievement.description}
                </p>
            </div>

            <div className={`text-[10px] font-bold tabular-nums ${unlocked ? "" : "text-slate-400"}`}>
                {unlocked ? `+${achievement.xpBonus} XP` : "Bloqueado"}
            </div>

            {unlocked && unlockedAt && (
                <div className="absolute top-1 left-1 text-[8px] opacity-60">
                    ✓
                </div>
            )}
        </motion.div>
    );
}
