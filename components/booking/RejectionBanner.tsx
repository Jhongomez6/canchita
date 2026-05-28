"use client";

import { AlertCircle } from "lucide-react";

interface RejectionBannerProps {
    reason: string;
    rejectedAt?: string;
    attemptsRemaining: number;
}

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60 * 1000) return "hace un momento";
    if (ms < 60 * 60 * 1000) return `hace ${Math.round(ms / 60000)} min`;
    if (ms < 24 * 60 * 60 * 1000) return `hace ${Math.round(ms / (60 * 60 * 1000))} h`;
    return `hace ${Math.round(ms / (24 * 60 * 60 * 1000))} d`;
}

export default function RejectionBanner({ reason, rejectedAt, attemptsRemaining }: RejectionBannerProps) {
    return (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-700">Comprobante rechazado</p>
                <p className="text-sm text-rose-700 mt-0.5">{reason}</p>
                <p className="text-[11px] text-rose-500 mt-1">
                    {rejectedAt ? `Rechazado ${timeAgo(rejectedAt)}` : "Rechazado por el admin"}
                    {attemptsRemaining > 0
                        ? ` · Te quedan ${attemptsRemaining} ${attemptsRemaining === 1 ? "intento" : "intentos"}`
                        : " · No quedan más intentos"}
                </p>
            </div>
        </div>
    );
}
