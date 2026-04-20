"use client";

import { ArrowRight, Flame, Sparkles } from "lucide-react";
import type { UserStats } from "@/lib/domain/user";
import { getDisplayedWeeklyStreak } from "@/lib/domain/user";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { logQuickStatsDetailedClicked, logTooltipOpened } from "@/lib/analytics";

const pulseAnimation = {
    rotate: [-10, 10, -8, 8, -5, 5, -2, 2, 0],
    transition: {
        duration: 2,
        repeat: 0,
        ease: "easeInOut" as const,
    },
};

interface QuickStatsProps {
    stats: UserStats;
    weeklyStreak?: number;
    lastPlayedWeek?: string;
    commitmentStreak?: number;
}

export default function QuickStats({ stats, weeklyStreak, lastPlayedWeek, commitmentStreak }: QuickStatsProps) {
    const [tooltip, setTooltip] = useState<string | null>(null);
    const router = useRouter();

    if ((stats.played ?? 0) < 3) return null;

    const weekly = getDisplayedWeeklyStreak({ weeklyStreak, lastPlayedWeek });
    const commitment = commitmentStreak ?? 0;

    const handleNavigate = () => {
        logQuickStatsDetailedClicked();
        router.push("/profile");
        // Intenta hacer scroll múltiples veces para asegurar que el elemento está renderizado
        const scrollToStats = () => {
            const element = document.getElementById("statistics");
            if (element) {
                const elementTop = element.getBoundingClientRect().top + window.scrollY;
                const offset = 80; // Ajusta este valor según necesites
                window.scrollTo({ top: elementTop - offset, behavior: "smooth" });
            }
        };
        setTimeout(scrollToStats, 300);
        setTimeout(scrollToStats, 600);
        setTimeout(scrollToStats, 1000);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <button onClick={handleNavigate} className="w-full block active:scale-[0.99] transition-transform text-left">
                <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-emerald-600" />
                        <h3 className="text-sm font-bold text-slate-800">Rachas</h3>
                    </div>
                    <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 hover:gap-1.5 transition-all">
                        Ver estadísticas
                        <ArrowRight size={14} />
                    </span>
                </div>
            </button>
            <div className="flex divide-x divide-slate-100 items-end">
                {/* Racha Semanal (principal) */}
                <div
                    className="flex-1 py-3 text-center relative group cursor-help"
                    onMouseEnter={() => {
                        setTooltip("semanal");
                        logTooltipOpened("streak_semanal");
                    }}
                    onMouseLeave={() => setTooltip(null)}
                >
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                        <motion.div animate={weekly > 0 ? pulseAnimation : {}} style={{ originY: 1 }}>
                            <Flame size={28} className={weekly > 0 ? "text-orange-400 fill-orange-400" : "text-slate-300"} />
                        </motion.div>
                        <motion.p
                            animate={weekly > 0 ? pulseAnimation : {}}
                            className={`text-3xl font-semibold leading-none ${weekly > 0 ? "text-orange-400" : "text-slate-300"}`}
                        >
                            {weekly}
                        </motion.p>
                    </div>
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                        Semanal
                    </p>
                    {tooltip === "semanal" && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-slate-800 text-white text-[11px] rounded-lg z-10 w-44 text-center shadow-lg">
                            {weekly > 0 ? (
                                <>
                                    <p className="font-bold text-orange-400">🔥 {weekly} {weekly === 1 ? "semana" : "semanas"} seguidas</p>
                                    <p className="text-slate-300 mt-0.5">Racha de semanas consecutivas jugando sin falta. La constancia es el secreto de los grandes jugadores</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-bold text-slate-200">¡Empieza tu racha!</p>
                                    <p className="text-slate-300 mt-0.5">Racha de semanas consecutivas jugando sin falta. Juega esta semana y consigue la primera 💪</p>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Commitment Streak */}
                <div
                    className="flex-1 py-3 text-center relative group cursor-help"
                    onMouseEnter={() => {
                        setTooltip("commitment");
                        logTooltipOpened("streak_commitment");
                    }}
                    onMouseLeave={() => setTooltip(null)}
                >
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                        <motion.div animate={commitment > 0 ? pulseAnimation : {}} style={{ originY: 1 }}>
                            <Flame size={28} className={commitment > 0 ? "text-orange-400 fill-orange-400" : "text-slate-300"} />
                        </motion.div>
                        <motion.p
                            animate={commitment > 0 ? pulseAnimation : {}}
                            className={`text-3xl font-semibold leading-none ${commitment > 0 ? "text-orange-400" : "text-slate-300"}`}
                        >
                            {commitment}
                        </motion.p>
                    </div>
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                        Compromiso
                    </p>
                    {tooltip === "commitment" && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-slate-800 text-white text-[11px] rounded-lg z-10 w-44 text-center shadow-lg">
                            {commitment > 0 ? (
                                <>
                                    <p className="font-bold text-orange-400">🔥 {commitment} {commitment === 1 ? "partido" : "partidos"} puntual</p>
                                    <p className="text-slate-300 mt-0.5">Racha de partidos consecutivos llegando a tiempo</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-bold text-slate-200">¡Sé el primero en la cancha!</p>
                                    <p className="text-slate-300 mt-0.5">Llega a tiempo al próximo partido y arranca tu racha 🎯</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
