"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { UserProfile } from "@/lib/domain/user";
import { getDisplayedWeeklyStreak } from "@/lib/domain/user";

/**
 * SDD: docs/PLAYER_CARD_DRAWER_SECTIONS_SDD.md
 *
 * Pills de rachas activas para mostrar inline junto a los kudos en el drawer.
 * Renderiza solo las rachas con valor > 0. Sin header propio — pensado para
 * ir dentro de un container compartido con los KudosBadges.
 */

interface Props {
    profile: Pick<UserProfile, "weeklyStreak" | "lastPlayedWeek" | "commitmentStreak">;
}

interface StreakPillProps {
    value: number;
    label: string;
    tooltipText: string;
    delay: number;
}

function StreakPill({ value, label, tooltipText, delay }: StreakPillProps) {
    return (
        <motion.button
            type="button"
            tabIndex={0}
            aria-label={tooltipText}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, type: "spring", stiffness: 300 }}
            className="group relative flex items-center gap-1 rounded-full px-2.5 py-1.5 border border-red-400/40 focus:outline-none focus:ring-2 focus:ring-rose-300/40"
            style={{
                background: "linear-gradient(135deg, rgba(159,18,57,0.45), rgba(120,20,15,0.35))",
                boxShadow: "0 0 14px rgba(248,113,113,0.25), inset 0 1px 0 rgba(252,165,165,0.25)",
            }}
        >
            <Flame size={15} className="text-orange-300 fill-orange-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.7)]" />
            <span className="text-[13px] font-bold text-rose-50 tabular-nums tracking-wide">{value}</span>
            <span className="text-[11px] font-semibold text-rose-200/80 uppercase tracking-wider">
                {label}
            </span>

            {/* Tooltip explicativo */}
            <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-rose-400/30 text-[11px] font-medium text-rose-100 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all z-10 shadow-lg"
            >
                {tooltipText}
                <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900/95" />
            </span>
        </motion.button>
    );
}

export default function DrawerStreaks({ profile }: Props) {
    const weekly = getDisplayedWeeklyStreak({
        weeklyStreak: profile.weeklyStreak,
        lastPlayedWeek: profile.lastPlayedWeek,
    });
    const commitment = profile.commitmentStreak ?? 0;

    if (weekly <= 0 && commitment <= 0) return null;

    return (
        <div className="flex flex-wrap justify-center gap-1">
            {weekly > 0 && (
                <StreakPill
                    value={weekly}
                    label="Sem"
                    tooltipText={`${weekly} ${weekly === 1 ? "semana seguida" : "semanas seguidas"} jugando`}
                    delay={0}
                />
            )}
            {commitment > 0 && (
                <StreakPill
                    value={commitment}
                    label="Com"
                    tooltipText={`${commitment} ${commitment === 1 ? "partido" : "partidos"} llegando a tiempo`}
                    delay={0.05}
                />
            )}
        </div>
    );
}
