"use client";

import { formatCOP } from "@/lib/domain/wallet";
import type { BreakdownItem } from "@/lib/domain/venue-analytics";

interface RevenueBreakdownListProps {
    items: BreakdownItem[];
    tone?: "green" | "blue";
    emptyLabel?: string;
}

/**
 * Lista rankeada con barra proporcional. Reutilizable para "por cancha" y "por formato".
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export default function RevenueBreakdownList({
    items,
    tone = "green",
    emptyLabel = "Sin datos en este período.",
}: RevenueBreakdownListProps) {
    if (items.length === 0) {
        return <p className="text-sm text-slate-400 text-center py-4">{emptyLabel}</p>;
    }

    const max = Math.max(1, ...items.map((i) => i.totalCOP));
    const fill = tone === "blue"
        ? "bg-gradient-to-r from-[#3b82f6] to-[#2563eb]"
        : "bg-gradient-to-r from-[#2f9d67] to-[#1f7a4f]";

    return (
        <div className="space-y-3">
            {items.map((item) => (
                <div key={item.key} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span className="font-semibold text-slate-700 truncate">{item.label}</span>
                        <span className="font-bold text-slate-900 tabular-nums shrink-0">
                            {formatCOP(item.totalCOP)}
                        </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${fill}`}
                            style={{ width: `${Math.max(Math.round((item.totalCOP / max) * 100), 2)}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
