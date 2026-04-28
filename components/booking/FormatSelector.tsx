"use client";

import { motion } from "framer-motion";
import { formatCOP } from "@/lib/domain/wallet";
import type { CourtFormat } from "@/lib/domain/venue";
import { formatLabel } from "@/lib/domain/venue";

interface FormatOption {
    format: CourtFormat;
    priceCOP: number;
    available: boolean;
}

interface FormatSelectorProps {
    formats: FormatOption[];
    selected: CourtFormat | null;
    onSelect: (format: CourtFormat) => void;
}

export default function FormatSelector({ formats, selected, onSelect }: FormatSelectorProps) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {formats.map(({ format, priceCOP, available }) => {
                const isSelected = selected === format;
                const label = formatLabel(format);
                const [firstWord, ...rest] = label.split(" ");
                return (
                    <motion.button
                        key={format}
                        whileTap={available ? { scale: 0.95 } : undefined}
                        onClick={() => available && onSelect(format)}
                        disabled={!available}
                        className={`
                            flex flex-col items-center justify-center text-center
                            px-2 py-3 rounded-2xl border-2 transition-colors
                            ${isSelected
                                ? "bg-[#1f7a4f] border-[#1f7a4f] text-white"
                                : available
                                    ? "bg-white border-slate-200 text-slate-700 hover:border-[#1f7a4f]/40"
                                    : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                            }
                        `}
                    >
                        <span className="text-sm font-bold leading-tight">
                            {firstWord}
                            {rest.length > 0 && (
                                <>
                                    <br />
                                    {rest.join(" ")}
                                </>
                            )}
                        </span>
                        <span className={`text-xs mt-1 ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                            {formatCOP(priceCOP)}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
