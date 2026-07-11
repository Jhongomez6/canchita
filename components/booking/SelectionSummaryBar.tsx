"use client";

import { motion } from "framer-motion";
import { CalendarDays, Clock } from "lucide-react";
import { formatSelectionSummary } from "@/lib/domain/venue";

interface SelectionSummaryBarProps {
    date: string;
    startTime: string;
    endTime: string;
}

/**
 * Resumen compacto de la selección actual, mostrado sobre el botón sticky de
 * confirmar. Da control al usuario que encadena varias horas.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §1 RN-10.
 */
export default function SelectionSummaryBar({ date, startTime, endTime }: SelectionSummaryBarProps) {
    const { dateLabel, timeRange, durationLabel } = formatSelectionSummary(date, startTime, endTime);

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-sm px-3.5 py-2 mb-2"
        >
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <CalendarDays className="w-4 h-4 text-[#1f7a4f]" />
                {dateLabel}
            </span>
            <span className="w-px h-4 bg-slate-200" />
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 min-w-0">
                <Clock className="w-4 h-4 text-[#1f7a4f] flex-shrink-0" />
                <span className="truncate">{timeRange}</span>
            </span>
            <span className="ml-auto text-xs font-bold text-[#1f7a4f] bg-[#1f7a4f]/10 rounded-full px-2 py-0.5 flex-shrink-0">
                {durationLabel}
            </span>
        </motion.div>
    );
}
