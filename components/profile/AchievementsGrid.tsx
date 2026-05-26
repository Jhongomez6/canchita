"use client";

/**
 * Grid de achievements del usuario.
 * 3 columnas en mobile, 4 en tablet.
 * Filtra por categoría con tabs simples.
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import AchievementCard from "./AchievementCard";
import {
    ACHIEVEMENT_DEFS,
    ACHIEVEMENT_IDS,
    type AchievementId,
    type AchievementCategory,
    type AchievementUnlock,
} from "@/lib/domain/xp";

const CATEGORIES: Array<{ id: AchievementCategory | "all"; label: string; emoji: string }> = [
    { id: "all", label: "Todos", emoji: "🏅" },
    { id: "matches", label: "Partidos", emoji: "⚽" },
    { id: "wins", label: "Victorias", emoji: "🏆" },
    { id: "mvp", label: "MVP", emoji: "👑" },
    { id: "streaks", label: "Rachas", emoji: "🔥" },
    { id: "social", label: "Social", emoji: "👏" },
    { id: "commitment", label: "Compromiso", emoji: "⏰" },
    { id: "special", label: "Especiales", emoji: "✨" },
];

interface AchievementsGridProps {
    unlocked: Partial<Record<AchievementId, AchievementUnlock>>;
}

export default function AchievementsGrid({ unlocked }: AchievementsGridProps) {
    const [activeCategory, setActiveCategory] = useState<AchievementCategory | "all">("all");

    const visibleIds = useMemo(() => {
        if (activeCategory === "all") return ACHIEVEMENT_IDS;
        return ACHIEVEMENT_IDS.filter((id) => ACHIEVEMENT_DEFS[id].category === activeCategory);
    }, [activeCategory]);

    const unlockedCount = Object.keys(unlocked ?? {}).length;
    const totalCount = ACHIEVEMENT_IDS.length;

    return (
        <section id="achievements" className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <header className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">🏅 Logros</h2>
                    <span className="text-xs font-bold text-emerald-600 tabular-nums">
                        {unlockedCount} / {totalCount}
                    </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                    Desbloqueá medallas y ganá XP bonus
                </p>
            </header>

            {/* Tabs categoría */}
            <div className="overflow-x-auto border-b border-slate-100">
                <div className="flex gap-1 px-3 py-2 min-w-max">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                                activeCategory === cat.id
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                        >
                            <span className="mr-1">{cat.emoji}</span>
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <motion.div
                key={activeCategory}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3"
            >
                {visibleIds.map((id) => {
                    const def = ACHIEVEMENT_DEFS[id];
                    const u = unlocked?.[id];
                    return (
                        <AchievementCard
                            key={id}
                            achievement={def}
                            unlocked={!!u}
                            unlockedAt={u?.unlockedAt}
                        />
                    );
                })}
            </motion.div>
        </section>
    );
}
