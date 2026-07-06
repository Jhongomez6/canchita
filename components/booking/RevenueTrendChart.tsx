"use client";

import { motion } from "framer-motion";
import { formatCOP } from "@/lib/domain/wallet";
import type { RevenueBucket } from "@/lib/domain/venue-analytics";

interface RevenueTrendChartProps {
    buckets: RevenueBucket[];
}

/**
 * Barras verticales de ingresos por bucket (día o semana). SVG/divs inline, sin librería.
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export default function RevenueTrendChart({ buckets }: RevenueTrendChartProps) {
    const max = Math.max(1, ...buckets.map((b) => b.totalCOP));
    const peakIdx = buckets.reduce((best, b, i) => (b.totalCOP > buckets[best].totalCOP ? i : best), 0);

    if (buckets.every((b) => b.totalCOP === 0)) {
        return (
            <p className="text-sm text-slate-400 text-center py-6">
                Sin ingresos registrados en este período.
            </p>
        );
    }

    // Con muchos buckets (ej. un mes en vista diaria) las barras quedan diminutas en el
    // cel: se les da ancho mínimo y el contenedor scrollea horizontal.
    const many = buckets.length > 12;

    return (
        <div
            className={`flex items-end gap-2 h-32 pt-1 ${
                many ? "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""
            }`}
            role="img"
            aria-label="Tendencia de ingresos"
        >
            {buckets.map((b, i) => {
                const pct = Math.round((b.totalCOP / max) * 100);
                const isPeak = i === peakIdx && b.totalCOP > 0;
                return (
                    <div
                        key={i}
                        className={`flex flex-col items-center justify-end gap-1.5 h-full ${
                            many ? "shrink-0 w-[22px]" : "flex-1 min-w-0"
                        }`}
                    >
                        <motion.div
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: 0.5, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                            style={{ height: `${Math.max(pct, 2)}%`, transformOrigin: "bottom" }}
                            title={`${b.label}: ${formatCOP(b.totalCOP)}`}
                            className={`w-full ${many ? "" : "max-w-[34px]"} rounded-t-md ${
                                isPeak
                                    ? "bg-gradient-to-b from-[#2f9d67] to-[#155e3c]"
                                    : "bg-gradient-to-b from-[#34b47a] to-[#1f7a4f]"
                            }`}
                        />
                        <span className="text-[10px] text-slate-400 tabular-nums truncate max-w-full">
                            {b.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
