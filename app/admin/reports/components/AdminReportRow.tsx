"use client";

import { Flag, ChevronRight } from "lucide-react";
import type { PlayerReport } from "@/lib/domain/matchReview";
import { REPORT_REASON_META } from "@/lib/domain/matchReview";

interface Props {
    report: PlayerReport;
    onTap: () => void;
}

export default function AdminReportRow({ report, onTap }: Props) {
    const date = new Date(report.createdAt).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
    });
    const reasonLabel = REPORT_REASON_META[report.reason].label;

    return (
        <button
            onClick={onTap}
            className="w-full flex items-center gap-3 bg-white border border-slate-100 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform shadow-sm"
        >
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                <Flag size={18} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 leading-tight truncate">
                    {report.reportedName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{reasonLabel}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                    {date} · por {report.reporterName ?? "—"}
                </p>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
        </button>
    );
}
