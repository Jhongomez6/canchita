"use client";

/**
 * Modal pequeño que aparece al desbloquear un achievement.
 * Auto-dismiss a 3s + dismissable manual.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Award } from "lucide-react";
import { logXpModalDismissed } from "@/lib/analytics";

export interface AchievementUnlockData {
    id: string;
    label: string;
    description: string;
    icon: string;
    xpBonus: number;
    tier: "bronze" | "silver" | "gold" | "platinum";
}

const TIER_GRADIENT: Record<AchievementUnlockData["tier"], string> = {
    bronze: "from-amber-700 to-orange-900",
    silver: "from-slate-300 to-slate-500",
    gold: "from-amber-400 to-amber-600",
    platinum: "from-cyan-300 via-blue-400 to-purple-500",
};

interface AchievementUnlockedModalProps {
    open: boolean;
    onClose: () => void;
    achievement: AchievementUnlockData | null;
    autoDismissMs?: number;
}

export default function AchievementUnlockedModal({
    open, onClose, achievement, autoDismissMs = 3500,
}: AchievementUnlockedModalProps) {
    useEffect(() => {
        if (!open || !autoDismissMs) return;
        const t = setTimeout(() => {
            logXpModalDismissed("achievement", "auto");
            onClose();
        }, autoDismissMs);
        return () => clearTimeout(t);
    }, [open, autoDismissMs, onClose]);

    return (
        <AnimatePresence>
            {open && achievement && (
                <motion.div
                    className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                        logXpModalDismissed("achievement", "tap_outside");
                        onClose();
                    }}
                >
                    <motion.div
                        className={`bg-gradient-to-br ${TIER_GRADIENT[achievement.tier]} rounded-3xl p-6 max-w-xs w-full shadow-2xl text-center border-2 border-white/40`}
                        initial={{ scale: 0.5, rotateY: -90 }}
                        animate={{ scale: 1, rotateY: 0 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-white/80 uppercase tracking-widest mb-3">
                            <Award size={14} />
                            <span>Logro desbloqueado</span>
                        </div>

                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="text-6xl mb-3"
                        >
                            {achievement.icon}
                        </motion.div>

                        <h3 className="text-xl font-black text-white mb-1">
                            {achievement.label}
                        </h3>
                        <p className="text-xs text-white/90 mb-4">
                            {achievement.description}
                        </p>

                        <div className="bg-black/25 rounded-full py-2 px-4 mb-4 inline-block">
                            <span className="text-white font-bold">⚡ +{achievement.xpBonus} XP</span>
                        </div>

                        <button
                            onClick={() => {
                                logXpModalDismissed("achievement", "cta");
                                onClose();
                            }}
                            className="w-full bg-white/95 hover:bg-white text-slate-900 font-bold py-2.5 rounded-xl transition-colors text-sm"
                        >
                            ¡Sigamos!
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
