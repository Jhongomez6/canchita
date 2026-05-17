"use client";

import { AlertTriangle } from "lucide-react";
import type { ModerationAlert } from "@/lib/domain/matchReview";

interface Props {
    alert: ModerationAlert;
    onViewReports: () => void;
    onResolve: () => void;
}

export default function ModerationAlertBanner({ alert, onViewReports, onResolve }: Props) {
    const date = new Date(alert.createdAt).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
    });

    return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-red-800 leading-tight">
                                Alerta de moderación
                            </p>
                            <p className="text-sm font-semibold text-red-700 mt-0.5 truncate">
                                {alert.reportedName}
                            </p>
                            <p className="text-xs text-red-400 mt-0.5">
                                {alert.triggerCount} reportes en 30 días · {date}
                            </p>
                        </div>
                        <span className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                            URGENTE
                        </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={onViewReports}
                            className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-bold active:scale-[0.98] transition-transform"
                        >
                            Ver reportes
                        </button>
                        <button
                            onClick={onResolve}
                            className="flex-1 py-2 rounded-xl bg-red-100 text-red-700 text-xs font-bold border border-red-200 active:scale-[0.98] transition-transform"
                        >
                            Resolver alerta
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
