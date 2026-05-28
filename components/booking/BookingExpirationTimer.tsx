"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface BookingExpirationTimerProps {
    expiresAt: string;
    /** Callback opcional cuando llega a 0. */
    onExpired?: () => void;
}

function formatRemaining(ms: number): string {
    if (ms <= 0) return "Expirada";
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}min`;
    }
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
}

export default function BookingExpirationTimer({ expiresAt, onExpired }: BookingExpirationTimerProps) {
    const [now, setNow] = useState(Date.now());
    const expiresMs = new Date(expiresAt).getTime();
    const remaining = Math.max(0, expiresMs - now);

    useEffect(() => {
        if (remaining <= 0) return;
        // Tick más rápido cuando queda < 1h, más lento cuando queda más
        const interval = remaining > 60 * 60 * 1000 ? 30000 : 1000;
        const id = setInterval(() => setNow(Date.now()), interval);
        return () => clearInterval(id);
    }, [remaining]);

    useEffect(() => {
        if (remaining <= 0 && onExpired) {
            onExpired();
        }
    }, [remaining, onExpired]);

    const isUrgent = remaining > 0 && remaining < 60 * 60 * 1000;

    return (
        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            remaining <= 0 ? "text-slate-400" : isUrgent ? "text-rose-600" : "text-amber-600"
        }`}>
            <Clock className="w-3.5 h-3.5" />
            <span>
                {remaining <= 0 ? "Expirada" : `Quedan ${formatRemaining(remaining)}`}
            </span>
        </div>
    );
}
