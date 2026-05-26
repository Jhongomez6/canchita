"use client";

/**
 * Sección en el perfil propio que muestra:
 *  - Badge del tier actual + nivel
 *  - Barra de progreso al siguiente nivel
 *  - XP actual / XP del siguiente nivel
 *  - CTA "Ver historial" → abre XpHistoryDrawer
 *  - CTA "¿Cómo funciona?" → re-abre el onboarding modal
 *
 * Si el user no tiene XP (pre-backfill o nuevo), muestra empty state amigable.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { History, HelpCircle } from "lucide-react";
import XpBadge from "@/components/xp/XpBadge";
import XpProgressBar from "@/components/xp/XpProgressBar";
import XpHistoryDrawer from "@/components/xp/XpHistoryDrawer";
import {
    calcLevelFromXp,
    calcTierFromLevel,
    ovrFromLevel,
    xpToNextLevel,
    type XpTier,
} from "@/lib/domain/xp";

interface XpStatsSectionProps {
    uid: string;
    xp: number | undefined;
    xpLevel: number | undefined;
    xpTier: XpTier | undefined;
    onOpenOnboarding: () => void;
}

export default function XpStatsSection({
    uid, xp, xpLevel, xpTier, onOpenOnboarding,
}: XpStatsSectionProps) {
    const [historyOpen, setHistoryOpen] = useState(false);

    // Si no hay datos, mostramos placeholder amigable
    if (typeof xp !== "number") {
        return (
            <section id="xp" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-bold text-slate-900">⚡ Tu XP</h2>
                </div>
                <p className="text-sm text-slate-600">
                    Tu nivel de Canchita aparecerá acá una vez que juegues tu primer partido.
                </p>
            </section>
        );
    }

    // Defaults derivados si el doc viene sin cachear
    const effectiveLevel = xpLevel ?? calcLevelFromXp(xp);
    const effectiveTier = xpTier ?? calcTierFromLevel(effectiveLevel);
    const ovr = ovrFromLevel(effectiveLevel);
    const progress = xpToNextLevel(xp);

    return (
        <>
            <section id="xp" className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {/* Header */}
                <header className="px-5 pt-4 pb-3 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">⚡ Tu progreso</h2>
                    <button
                        onClick={onOpenOnboarding}
                        className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-semibold"
                        aria-label="Cómo funciona el sistema de XP"
                    >
                        <HelpCircle size={14} />
                        ¿Cómo funciona?
                    </button>
                </header>

                {/* Tier + Badge + OVR */}
                <div className="px-5 pb-3 flex items-center justify-between">
                    <div>
                        <XpBadge tier={effectiveTier} level={effectiveLevel} size="md" />
                        <p className="text-xs text-slate-500 mt-1.5">
                            <span className="font-bold text-slate-700 tabular-nums">{xp.toLocaleString("es-AR")}</span>{" "}
                            XP totales
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">OVR</p>
                        <p className="text-4xl font-black text-emerald-600 leading-none">{ovr}</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="px-5 pb-4">
                    <XpProgressBar
                        tier={effectiveTier}
                        current={progress.current}
                        nextLevelXp={progress.nextLevelXp}
                        isMax={progress.isMax}
                        height={10}
                    />
                    <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[11px] text-slate-500 tabular-nums">
                            {progress.current.toLocaleString("es-AR")} / {progress.nextLevelXp.toLocaleString("es-AR")}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                            {progress.isMax
                                ? "Nivel máximo alcanzado 🏆"
                                : (
                                    <>
                                        <span className="tabular-nums font-bold text-emerald-600">
                                            {progress.needed.toLocaleString("es-AR")}
                                        </span>{" "}
                                        XP al nivel {effectiveLevel + 1}
                                    </>
                                )}
                        </p>
                    </div>
                </div>

                {/* CTA historial */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setHistoryOpen(true)}
                    className="w-full px-5 py-3 bg-slate-50 hover:bg-slate-100 border-t border-slate-100 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 transition-colors"
                >
                    <History size={16} />
                    Ver historial de XP
                </motion.button>
            </section>

            <XpHistoryDrawer
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                uid={uid}
            />
        </>
    );
}
