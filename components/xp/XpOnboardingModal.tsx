"use client";

/**
 * Modal educativo one-shot del sistema de XP.
 *
 * Se muestra automáticamente al primer load post-despliegue si `xpOnboardingSeenAt`
 * está vacío. Se persiste el flag al cerrar con el CTA.
 *
 * No dismissable por tap fuera / ESC — solo por el CTA principal. Esto garantiza
 * que el user lo lea al menos una vez (puede cerrarlo rápido, pero conscientemente).
 *
 * Reabrible manualmente desde el botón "¿Cómo funciona?" en XpStatsSection.
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Clock } from "lucide-react";
import XpBadge from "./XpBadge";
import XpTierIcon from "./XpTierIcon";
import {
    XP_AMOUNTS,
    TIER_ORDER,
    TIER_META,
    type XpTier,
} from "@/lib/domain/xp";
import {
    logXpOnboardingShown,
    logXpOnboardingCompleted,
} from "@/lib/analytics";

interface XpOnboardingModalProps {
    open: boolean;
    onClose: () => void;
    currentTier?: XpTier;
    currentLevel?: number;
    currentXp?: number;
}

const POSITIVE_RULES: Array<{ icon: string; label: string; amount: number }> = [
    { icon: "⚽", label: "Jugar un partido", amount: XP_AMOUNTS.MATCH_PLAYED },
    { icon: "🏆", label: "Ganar el partido (bonus)", amount: XP_AMOUNTS.MATCH_WON_BONUS },
    { icon: "👑", label: "Ser MVP del partido", amount: XP_AMOUNTS.MATCH_MVP },
    { icon: "👏", label: "Recibir un kudo", amount: XP_AMOUNTS.KUDO_RECEIVED },
    { icon: "🔥", label: "Mantener racha semanal", amount: XP_AMOUNTS.WEEKLY_STREAK_MILESTONE },
    { icon: "📝", label: "Calificar el partido", amount: XP_AMOUNTS.POST_MATCH_REVIEW },
];

const NEGATIVE_RULES: Array<{ icon: string; label: string; amount: number }> = [
    { icon: "🐢", label: "Llegar tarde", amount: XP_AMOUNTS.MATCH_LATE },
    { icon: "❌", label: "Faltar sin avisar", amount: XP_AMOUNTS.MATCH_NO_SHOW },
];

export default function XpOnboardingModal({
    open, onClose, currentTier, currentLevel, currentXp,
}: XpOnboardingModalProps) {
    const openedAtRef = useRef<number | null>(null);

    useEffect(() => {
        if (open) {
            openedAtRef.current = Date.now();
            logXpOnboardingShown(currentTier ?? "suplente", currentLevel ?? 1);
        } else {
            openedAtRef.current = null;
        }
    }, [open, currentTier, currentLevel]);

    const handleConfirm = () => {
        const seconds = openedAtRef.current
            ? Math.floor((Date.now() - openedAtRef.current) / 1000)
            : 0;
        logXpOnboardingCompleted(seconds);
        onClose();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", stiffness: 280, damping: 30 }}
                    >
                        {/* Header con gradiente emerald (identidad Canchita) */}
                        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 px-6 pt-6 pb-5 text-center">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-400 mb-3 shadow-lg">
                                <Zap size={28} className="text-amber-950" fill="currentColor" />
                            </div>
                            <h1 className="text-2xl font-black text-white mb-1">
                                Tu historia en Canchita
                            </h1>
                            <p className="text-sm text-emerald-100">
                                Cada partido suma a tu progreso
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* Tu posición actual */}
                            {currentTier && currentLevel != null && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100"
                                >
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Tu lugar ahora
                                    </p>
                                    <div className="flex justify-center mb-2">
                                        <XpBadge tier={currentTier} level={currentLevel} size="lg" pulse />
                                    </div>
                                    {typeof currentXp === "number" && (
                                        <p className="text-xs text-slate-600">
                                            <span className="font-bold tabular-nums">
                                                {currentXp.toLocaleString("es-AR")}
                                            </span> XP acumulados
                                        </p>
                                    )}
                                </motion.div>
                            )}

                            {/* Los 5 tiers */}
                            <section>
                                <h2 className="text-sm font-bold text-slate-900 mb-2.5">
                                    Los 5 tiers
                                </h2>
                                <div className="flex justify-between gap-1.5">
                                    {TIER_ORDER.map((tier, i) => {
                                        const meta = TIER_META[tier];
                                        const isCurrent = tier === currentTier;
                                        return (
                                            <motion.div
                                                key={tier}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.3 + i * 0.08 }}
                                                className={`flex-1 rounded-xl p-2 text-center bg-gradient-to-br ${meta.badgeGradient} ${
                                                    isCurrent ? "ring-2 ring-emerald-500 ring-offset-2" : ""
                                                }`}
                                            >
                                                <div className="text-white drop-shadow mb-1 flex justify-center">
                                                    <XpTierIcon tier={tier} size={18} />
                                                </div>
                                                <p className="text-[9px] font-bold text-white uppercase tracking-wider leading-tight">
                                                    {meta.label}
                                                </p>
                                                <p className="text-[9px] text-white/80 tabular-nums">
                                                    OVR {meta.minOvr}+
                                                </p>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-2.5 text-center">
                                    Cada tier desbloquea una rarity nueva de tu FIFA Card.
                                </p>
                            </section>

                            {/* Cómo ganás XP */}
                            <section>
                                <h2 className="text-sm font-bold text-slate-900 mb-2.5">
                                    Cómo ganás XP
                                </h2>
                                <ul className="space-y-1.5">
                                    {POSITIVE_RULES.map((r) => (
                                        <li
                                            key={r.label}
                                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100"
                                        >
                                            <span className="text-base">{r.icon}</span>
                                            <span className="flex-1 text-xs text-slate-800">{r.label}</span>
                                            <span className="text-xs font-bold text-emerald-700 tabular-nums">
                                                +{r.amount}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {/* Y cuidado */}
                            <section>
                                <h2 className="text-sm font-bold text-slate-900 mb-2.5 flex items-center gap-1.5">
                                    <Clock size={14} className="text-rose-500" />
                                    Y cuidado:
                                </h2>
                                <ul className="space-y-1.5">
                                    {NEGATIVE_RULES.map((r) => (
                                        <li
                                            key={r.label}
                                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100"
                                        >
                                            <span className="text-base">{r.icon}</span>
                                            <span className="flex-1 text-xs text-slate-800">{r.label}</span>
                                            <span className="text-xs font-bold text-rose-600 tabular-nums">
                                                {r.amount}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <p className="text-[11px] text-center text-slate-500 italic">
                                Las rachas (🔥) ya muestran tu actividad reciente. El XP es perpetuo —
                                tu progreso nunca se borra.
                            </p>
                        </div>

                        {/* CTA */}
                        <div className="border-t border-slate-100 p-4 bg-slate-50">
                            <button
                                onClick={handleConfirm}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                            >
                                <Zap size={18} fill="currentColor" />
                                ¡Entendido, a jugar!
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
