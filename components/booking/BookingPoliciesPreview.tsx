"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollText, ChevronDown } from "lucide-react";

interface BookingPoliciesPreviewProps {
    policies: string[];
    onExpand?: (policyCount: number) => void;
}

const PREVIEW_COUNT = 2;

/**
 * Acordeón con las políticas de reserva de la sede, mostrado ANTES de abrir el
 * sheet de confirmación para reducir sorpresas. Muestra las primeras 2 y expande
 * al resto. Si no hay políticas, no renderiza nada.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §1 RN-06.
 */
export default function BookingPoliciesPreview({ policies, onExpand }: BookingPoliciesPreviewProps) {
    const [expanded, setExpanded] = useState(false);

    if (policies.length === 0) return null;

    const hasMore = policies.length > PREVIEW_COUNT;
    const visible = expanded ? policies : policies.slice(0, PREVIEW_COUNT);

    const handleToggle = () => {
        const next = !expanded;
        setExpanded(next);
        if (next) onExpand?.(policies.length);
    };

    return (
        <div className="rounded-2xl bg-white border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2.5">
                <ScrollText className="w-4 h-4 text-[#1f7a4f]" />
                <h2 className="text-sm font-semibold text-slate-700">Antes de reservar</h2>
            </div>

            <ul className="space-y-2">
                {visible.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600 leading-snug">
                        <span className="text-[#1f7a4f] flex-shrink-0">•</span>
                        <span>{p}</span>
                    </li>
                ))}
            </ul>

            <AnimatePresence initial={false}>
                {!expanded && hasMore && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleToggle}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-[#1f7a4f]"
                    >
                        Ver todas ({policies.length})
                        <ChevronDown className="w-3.5 h-3.5" />
                    </motion.button>
                )}
            </AnimatePresence>

            {expanded && hasMore && (
                <button
                    onClick={handleToggle}
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-400"
                >
                    Ver menos
                    <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                </button>
            )}
        </div>
    );
}
