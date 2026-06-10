"use client";

import { Minus, Plus } from "lucide-react";
import { WC_MAX_GOALS } from "@/lib/domain/worldcup";

/**
 * Stepper de goles con botones +/-. Touch targets de 44×44px (mobile-first).
 * El número usa text-2xl (>16px) — sin riesgo de zoom en iOS.
 */
export default function GoalStepper({
    label,
    value,
    onChange,
    disabled = false,
}: {
    label: string;
    value: number;
    onChange: (next: number) => void;
    disabled?: boolean;
}) {
    const dec = () => onChange(Math.max(0, value - 1));
    const inc = () => onChange(Math.min(WC_MAX_GOALS, value + 1));

    return (
        <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 text-center max-w-[100px] truncate">
                {label}
            </span>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={dec}
                    disabled={disabled || value <= 0}
                    aria-label={`Quitar gol a ${label}`}
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 disabled:opacity-30 active:scale-95 transition"
                >
                    <Minus className="w-5 h-5" />
                </button>
                <span className="w-10 text-center text-2xl font-bold tabular-nums text-gray-900">
                    {value}
                </span>
                <button
                    type="button"
                    onClick={inc}
                    disabled={disabled || value >= WC_MAX_GOALS}
                    aria-label={`Sumar gol a ${label}`}
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-[#1f7a4f]/10 text-[#1f7a4f] disabled:opacity-30 active:scale-95 transition"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
