"use client";

/**
 * Modal premium para cambio de tier (evento especial — máximo 4 veces en la vida del user).
 * Full-screen overlay con gradiente animado y animación celebrativa de mayor impacto que LevelUpModal.
 *
 * Auto-dismiss a 4s + dismissable manual con CTA.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import XpBadge from "./XpBadge";
import XpTierIcon from "./XpTierIcon";
import { ovrFromLevel, type XpTier } from "@/lib/domain/xp";
import { logXpModalDismissed } from "@/lib/analytics";

const TIER_BG_GRADIENT: Record<XpTier, string> = {
    suplente: "from-amber-700 via-orange-800 to-amber-900",
    titular: "from-slate-400 via-slate-500 to-slate-700",
    estrella: "from-amber-400 via-amber-500 to-amber-700",
    capitan: "from-emerald-500 via-emerald-700 to-emerald-900",
    leyenda: "from-purple-600 via-pink-500 to-amber-400",
};

const TIER_LABEL: Record<XpTier, string> = {
    suplente: "Suplente",
    titular: "Titular",
    estrella: "Estrella",
    capitan: "Capitán",
    leyenda: "Leyenda",
};

const TIER_TAGLINE: Record<XpTier, string> = {
    suplente: "El camino recién empieza.",
    titular: "Sos parte fundamental del equipo.",
    estrella: "Tu nombre brilla en la cancha.",
    capitan: "Llevás el brazalete con orgullo.",
    leyenda: "Tu historia es Canchita.",
};

interface TierUpModalProps {
    open: boolean;
    onClose: () => void;
    fromTier: XpTier;
    toTier: XpTier;
    level: number;
    autoDismissMs?: number;
}

export default function TierUpModal({
    open, onClose, fromTier, toTier, level, autoDismissMs = 5000,
}: TierUpModalProps) {
    useEffect(() => {
        if (!open || !autoDismissMs) return;
        const t = setTimeout(() => {
            logXpModalDismissed("tier", "auto");
            onClose();
        }, autoDismissMs);
        return () => clearTimeout(t);
    }, [open, autoDismissMs, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    {/* Backdrop con gradiente del nuevo tier */}
                    <motion.div
                        className={`absolute inset-0 bg-gradient-to-br ${TIER_BG_GRADIENT[toTier]}`}
                        animate={{
                            background: [
                                `linear-gradient(135deg, var(--tw-gradient-stops))`,
                            ],
                        }}
                        onClick={() => {
                            logXpModalDismissed("tier", "tap_outside");
                            onClose();
                        }}
                    >
                        <div className="absolute inset-0 bg-black/40" />
                    </motion.div>

                    {/* Contenido */}
                    <motion.div
                        className="relative z-10 text-center max-w-md w-full px-6"
                        initial={{ scale: 0.5, y: 50, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.5, y: 50, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    >
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-white/15 backdrop-blur-md border-4 border-white/40 mb-6 shadow-2xl"
                        >
                            <XpTierIcon tier={toTier} size={56} className="text-white drop-shadow-lg" />
                        </motion.div>

                        <p className="text-sm font-bold text-white/80 uppercase tracking-[0.3em] mb-1">
                            Nuevo Tier
                        </p>
                        <h1 className="text-5xl font-black text-white drop-shadow-2xl mb-3 uppercase tracking-wide">
                            {TIER_LABEL[toTier]}
                        </h1>
                        <p className="text-base text-white/90 italic mb-5">
                            &ldquo;{TIER_TAGLINE[toTier]}&rdquo;
                        </p>

                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 mb-5 border border-white/20">
                            <p className="text-xs text-white/70 uppercase tracking-wider mb-1">
                                {TIER_LABEL[fromTier]} → {TIER_LABEL[toTier]}
                            </p>
                            <p className="text-2xl font-black text-white mb-2">
                                Nivel {level} · OVR {ovrFromLevel(level)}
                            </p>
                            <div className="flex justify-center">
                                <XpBadge tier={toTier} level={level} size="md" pulse />
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                logXpModalDismissed("tier", "cta");
                                onClose();
                            }}
                            className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl hover:bg-white/90 active:bg-white/80 transition-colors shadow-lg"
                        >
                            ¡Genial, a seguir!
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
