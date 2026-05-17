"use client";

import { motion } from "framer-motion";
import type { UserKudosSummary } from "@/lib/domain/matchReview";
import { KUDO_META, KUDO_TYPES } from "@/lib/domain/matchReview";

interface Props {
    summary?: UserKudosSummary;
    /** Modo compacto: solo emoji + count, sin label de texto. Usado en el FIFA drawer. */
    compact?: boolean;
}

export default function KudosBadges({ summary, compact = false }: Props) {
    const activeBadges = summary
        ? KUDO_TYPES.filter((type) => (summary[type] ?? 0) > 0)
        : [];

    if (activeBadges.length === 0) {
        return (
            <div className="text-center py-3">
                <p className="text-xs text-slate-400">Sin reconocimientos aún</p>
            </div>
        );
    }

    return (
        <div className={compact ? "flex flex-wrap justify-center gap-1" : "flex flex-wrap gap-2"}>
            {activeBadges.map((type, i) => {
                const { emoji, label } = KUDO_META[type];
                const count = summary![type];

                if (compact) {
                    // Premium emerald vitrine — dark glass pill con glow ámbar sutil + tooltip social proof
                    const tooltipText = count === 1
                        ? `1 compañero lo eligió ${label}`
                        : `${count} compañeros lo eligieron ${label}`;
                    return (
                        <motion.button
                            type="button"
                            key={type}
                            tabIndex={0}
                            aria-label={tooltipText}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.15 + i * 0.05, type: "spring", stiffness: 300 }}
                            className="group relative flex items-center gap-1 rounded-full px-2.5 py-1.5 border border-amber-400/30 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                            style={{
                                background: "linear-gradient(135deg, rgba(120,53,15,0.35), rgba(60,30,5,0.25))",
                                boxShadow: "0 0 12px rgba(251,191,36,0.12), inset 0 1px 0 rgba(251,191,36,0.18)",
                            }}
                        >
                            <span className="text-[18px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{emoji}</span>
                            <span className="text-[13px] font-bold text-amber-200 tabular-nums tracking-wide">
                                {count}
                            </span>

                            {/* Tooltip explicativo */}
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-amber-400/30 text-[11px] font-medium text-amber-100 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all z-10 shadow-lg"
                            >
                                {tooltipText}
                                <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900/95" />
                            </span>
                        </motion.button>
                    );
                }

                // Modo regular (profile propio) — pills sutiles con label de texto y count inline
                return (
                    <motion.div
                        key={type}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05, type: "spring", stiffness: 300 }}
                        className="flex items-center gap-1.5 bg-amber-50/50 border border-amber-100 rounded-full px-2.5 py-1"
                        title={label}
                    >
                        <span className="text-[15px] leading-none">{emoji}</span>
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                        <span className="text-[11px] font-bold text-amber-500 tabular-nums">
                            · {count}
                        </span>
                    </motion.div>
                );
            })}
        </div>
    );
}
