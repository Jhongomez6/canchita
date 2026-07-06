"use client";

import { User, MapPin } from "lucide-react";
import { formatDateShort, formatTime12h } from "@/lib/date";
import type { ReservationDetail } from "@/lib/domain/venue-analytics";
import type { Court } from "@/lib/domain/venue";

interface ReservationDetailListProps {
    items: ReservationDetail[];
    courts: Court[];
    /** Máximo de filas a mostrar antes de "+N más". */
    maxRows?: number;
    emptyLabel?: string;
}

/**
 * Lista de reservas (inasistencias / cancelaciones) con fecha, hora, cancha, cliente y
 * motivo (si aplica). Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export default function ReservationDetailList({
    items, courts, maxRows = 10, emptyLabel = "Sin registros en este período.",
}: ReservationDetailListProps) {
    if (items.length === 0) {
        return <p className="text-sm text-slate-400 text-center py-4">{emptyLabel}</p>;
    }

    const nameById = new Map(courts.map((c) => [c.id, c.name]));
    const courtNames = (ids: string[]) =>
        ids.map((id) => nameById.get(id) ?? id).join(" + ") || "—";

    const shown = items.slice(0, maxRows);
    const rest = items.length - shown.length;

    return (
        <div className="space-y-2">
            {shown.map((r) => (
                <div key={`${r.reservationId}_${r.date}`} className="rounded-xl border border-slate-100 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-slate-800">
                            {formatDateShort(r.date)}
                        </span>
                        <span className="text-[11.5px] text-slate-500 tabular-nums shrink-0">
                            {formatTime12h(r.startTime)}–{formatTime12h(r.endTime)}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11.5px] text-slate-500">
                        <span className="inline-flex items-center gap-1 min-w-0">
                            <User className="w-3 h-3 shrink-0" />
                            <span className="truncate">{r.clientName}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 min-w-0">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{courtNames(r.courtIds)}</span>
                        </span>
                    </div>
                    {r.reason && (
                        <p className="text-[11.5px] text-rose-600 bg-rose-50 rounded-lg px-2 py-1 mt-1.5">
                            {r.reason}
                        </p>
                    )}
                </div>
            ))}
            {rest > 0 && (
                <p className="text-[11.5px] text-slate-400 text-center pt-1">
                    y {rest} {rest === 1 ? "más" : "más"}…
                </p>
            )}
        </div>
    );
}
