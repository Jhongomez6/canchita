"use client";

import { formatCOP } from "@/lib/domain/wallet";
import type { ClientStat } from "@/lib/domain/venue-analytics";

interface ClientRankListProps {
    items: ClientStat[];
    /** Qué valor destacar a la derecha de cada cliente. */
    metric: "revenue" | "reservations" | "cancellations" | "noShows";
    emptyLabel?: string;
    /** Color del número destacado. */
    tone?: "slate" | "rose";
}

function valueOf(s: ClientStat, metric: ClientRankListProps["metric"]): string {
    switch (metric) {
        case "revenue": return formatCOP(s.revenueCOP);
        case "reservations": return `${s.reservations} ${s.reservations === 1 ? "reserva" : "reservas"}`;
        case "cancellations": return `${s.cancellations}`;
        case "noShows": return `${s.noShows}`;
    }
}

/**
 * Lista rankeada de clientes (top ingresos / frecuencia / cancelaciones / inasistencias).
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export default function ClientRankList({ items, metric, emptyLabel = "Sin datos en este período.", tone = "slate" }: ClientRankListProps) {
    if (items.length === 0) {
        return <p className="text-sm text-slate-400 text-center py-4">{emptyLabel}</p>;
    }
    const valueColor = tone === "rose" ? "text-rose-600" : "text-slate-900";

    return (
        <div className="divide-y divide-slate-50">
            {items.map((s, i) => (
                <div key={s.key} className="flex items-center gap-3 py-2">
                    <span className="w-5 h-5 shrink-0 grid place-items-center rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold tabular-nums">
                        {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] font-semibold text-slate-700 truncate">{s.name}</span>
                    <span className={`text-[13px] font-bold tabular-nums shrink-0 ${valueColor}`}>
                        {valueOf(s, metric)}
                    </span>
                </div>
            ))}
        </div>
    );
}
