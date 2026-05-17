"use client";

import type { DimensionValue } from "@/lib/domain/matchReview";

interface DimensionConfig {
    key: "organization" | "levelBalance";
    label: string;
    goodLabel: string;
    badLabel: string;
}

const DIMENSIONS: DimensionConfig[] = [
    {
        key: "organization",
        label: "Organización",
        goodLabel: "Bien organizado",
        badLabel: "Mal organizado",
    },
    {
        key: "levelBalance",
        label: "Nivel de equipos",
        goodLabel: "Parejos",
        badLabel: "Desiguales",
    },
];

interface Props {
    value: { organization: DimensionValue; levelBalance: DimensionValue };
    onChange: (key: "organization" | "levelBalance", val: DimensionValue) => void;
    disabled?: boolean;
}

export default function DimensionChips({ value, onChange, disabled = false }: Props) {
    return (
        <div className="space-y-3">
            {DIMENSIONS.map(({ key, label, goodLabel, badLabel }) => {
                const current = value[key];
                return (
                    <div key={key}>
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">{label}</p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => !disabled && onChange(key, current === "good" ? null : "good")}
                                className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold border transition-all ${
                                    current === "good"
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                        : "bg-slate-50 border-slate-200 text-slate-500"
                                } ${disabled ? "cursor-default" : "active:scale-[0.97]"}`}
                            >
                                👍 {goodLabel}
                            </button>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => !disabled && onChange(key, current === "bad" ? null : "bad")}
                                className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold border transition-all ${
                                    current === "bad"
                                        ? "bg-red-50 border-red-300 text-red-700"
                                        : "bg-slate-50 border-slate-200 text-slate-500"
                                } ${disabled ? "cursor-default" : "active:scale-[0.97]"}`}
                            >
                                👎 {badLabel}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
