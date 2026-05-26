"use client";

/**
 * Modal celebrativo cuando el user sube de nivel (dentro del mismo tier).
 * Auto-dismiss a 3s + dismissable manual con CTA o tap fuera.
 *
 * Para cambio de tier ver TierUpModal (más premium, full-screen).
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Zap } from "lucide-react";
import XpBadge from "./XpBadge";
import { ovrFromLevel, type XpTier } from "@/lib/domain/xp";
import { logXpModalDismissed } from "@/lib/analytics";

interface LevelUpModalProps {
    open: boolean;
    onClose: () => void;
    fromLevel: number;
    toLevel: number;
    tier: XpTier;
    autoDismissMs?: number;
}

export default function LevelUpModal({
    open, onClose, fromLevel, toLevel, tier, autoDismissMs = 3500,
}: LevelUpModalProps) {
    useEffect(() => {
        if (!open || !autoDismissMs) return;
        const t = setTimeout(() => {
            logXpModalDismissed("level", "auto");
            onClose();
        }, autoDismissMs);
        return () => clearTimeout(t);
    }, [open, autoDismissMs, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                        logXpModalDismissed("level", "tap_outside");
                        onClose();
                    }}
                >
                    <motion.div
                        className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 border-2 border-emerald-400/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center"
                        initial={{ scale: 0.85, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.85, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 22 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <motion.div
                            initial={{ rotate: -30, scale: 0.5 }}
                            animate={{ rotate: 0, scale: 1 }}
                            transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
                            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-400 mb-3 shadow-lg shadow-amber-500/50"
                        >
                            <Zap size={36} className="text-amber-950" fill="currentColor" />
                        </motion.div>

                        <h2 className="text-2xl font-black text-amber-300 mb-1 tracking-wide uppercase">
                            ¡Subiste de Nivel!
                        </h2>
                        <p className="text-xs text-emerald-200/80 mb-4">
                            Nivel {fromLevel} → Nivel {toLevel}
                        </p>

                        <div className="flex justify-center mb-4">
                            <XpBadge tier={tier} level={toLevel} size="lg" pulse />
                        </div>

                        <p className="text-sm text-emerald-50 mb-1">
                            Tu OVR ahora es
                        </p>
                        <p className="text-5xl font-black text-amber-300 leading-none mb-4">
                            {ovrFromLevel(toLevel)}
                        </p>

                        <button
                            onClick={() => {
                                logXpModalDismissed("level", "cta");
                                onClose();
                            }}
                            className="w-full bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-amber-950 font-bold py-3 rounded-xl transition-colors"
                        >
                            ¡A jugar!
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
