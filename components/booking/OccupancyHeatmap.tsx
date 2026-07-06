"use client";

import {
    HEATMAP_DAY_ORDER,
    DAY_SHORT_LABELS,
    type OccupancyCell,
} from "@/lib/domain/venue-analytics";

interface OccupancyHeatmapProps {
    cells: OccupancyCell[];
    onCellTap?: (cell: OccupancyCell) => void;
}

/** Etiqueta compacta de hora en 12h: 6→"6a", 12→"12p", 18→"6p", 0→"12a". */
function hour12(h: number): string {
    const suffix = h < 12 || h === 24 ? "a" : "p";
    const h12 = h % 12 || 12;
    return `${h12}${suffix}`;
}

/** Escala secuencial slate-100 → blue-600 según ocupación (0..1). */
function colorForRate(rate: number): string {
    const stops = [
        [241, 245, 249], [219, 234, 254], [147, 197, 253],
        [96, 165, 250], [59, 130, 246], [37, 99, 235],
    ];
    const t = Math.min(1, Math.max(0, rate));
    const pos = t * (stops.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = stops[i];
    const b = stops[Math.min(i + 1, stops.length - 1)];
    const c = a.map((ch, k) => Math.round(ch + (b[k] - ch) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Heatmap de ocupación día × hora. Escala de color + % en texto (accesible: el color
 * no es el único canal). Franjas cerradas con hachurado.
 * Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md
 */
export default function OccupancyHeatmap({ cells, onCellTap }: OccupancyHeatmapProps) {
    if (cells.length === 0) {
        return (
            <p className="text-sm text-slate-400 text-center py-6">
                Configura los horarios de la sede para calcular la ocupación.
            </p>
        );
    }

    const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
    const byKey = new Map(cells.map((c) => [`${c.dayOfWeek}_${c.hour}`, c]));

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <table className="border-separate" style={{ borderSpacing: "3px" }}>
                    <thead>
                        <tr>
                            <th />
                            {hours.map((h) => (
                                <th key={h} className="text-[9px] font-semibold text-slate-400 pb-0.5 text-center whitespace-nowrap">
                                    {hour12(h)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {HEATMAP_DAY_ORDER.map((dow) => (
                            <tr key={dow}>
                                <td className="text-[10.5px] font-semibold text-slate-500 pr-1.5 text-right whitespace-nowrap">
                                    {DAY_SHORT_LABELS[dow]}
                                </td>
                                {hours.map((h) => {
                                    const cell = byKey.get(`${dow}_${h}`);
                                    if (!cell || (!cell.open && cell.reservedHours === 0)) {
                                        return (
                                            <td key={h}>
                                                <div
                                                    className="w-[26px] h-[22px] rounded-[5px]"
                                                    style={{
                                                        background:
                                                            "repeating-linear-gradient(45deg,#f1f5f9 0 4px,#e9edf1 4px 8px)",
                                                    }}
                                                    aria-label={`${DAY_SHORT_LABELS[dow]} ${hour12(h)} cerrado`}
                                                />
                                            </td>
                                        );
                                    }
                                    const pct = Math.round(cell.rate * 100);
                                    return (
                                        <td key={h}>
                                            <button
                                                type="button"
                                                onClick={() => onCellTap?.(cell)}
                                                className="w-[26px] h-[22px] rounded-[5px] grid place-items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f7a4f]"
                                                style={{ background: colorForRate(cell.rate) }}
                                                aria-label={`${DAY_SHORT_LABELS[dow]} ${hour12(h)}: ${pct}% ocupación`}
                                                title={`${pct}% · ${cell.reservedHours}/${cell.availableHours} canchas·h`}
                                            >
                                                <span
                                                    className="text-[8.5px] font-bold tabular-nums"
                                                    style={{ color: cell.rate > 0.55 ? "#fff" : "#334155" }}
                                                >
                                                    {pct}
                                                </span>
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-2 text-[10.5px] text-slate-500">
                <span>Menos</span>
                <span className="flex gap-[3px]">
                    {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                        <span key={v} className="w-[15px] h-3 rounded-[3px]" style={{ background: colorForRate(v) }} />
                    ))}
                </span>
                <span>Más</span>
                <span className="ml-auto flex items-center gap-1.5">
                    <span
                        className="w-[15px] h-3 rounded-[3px]"
                        style={{ background: "repeating-linear-gradient(45deg,#f1f5f9 0 4px,#e9edf1 4px 8px)" }}
                    />
                    Cerrado
                </span>
            </div>
        </div>
    );
}
