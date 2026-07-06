"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import ReservationDetailList from "./ReservationDetailList";
import type { ReservationDetail } from "@/lib/domain/venue-analytics";
import type { Court } from "@/lib/domain/venue";

interface ReservationDetailSheetProps {
    title: string;
    items: ReservationDetail[];
    courts: Court[];
    onClose: () => void;
}

/**
 * Bottom sheet con el historial COMPLETO de inasistencias / cancelaciones del período,
 * scrolleable. Mantiene el dashboard compacto (solo top N inline + "Ver todas").
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export default function ReservationDetailSheet({ title, items, courts, onClose }: ReservationDetailSheetProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
                className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[85vh] flex flex-col shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
                    <h4 className="text-base font-bold text-slate-900">
                        {title} <span className="text-slate-400 font-semibold tabular-nums">({items.length})</span>
                    </h4>
                    <button onClick={onClose} className="text-slate-400 p-1" aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </header>
                <div className="overflow-y-auto px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
                    <ReservationDetailList items={items} courts={courts} maxRows={items.length} />
                </div>
            </motion.div>
        </motion.div>
    );
}
