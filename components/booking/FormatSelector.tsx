"use client";

import { motion } from "framer-motion";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, clientFormatLabel } from "@/lib/domain/venue";
import type { VenueFormat } from "@/lib/domain/venue";

interface FormatOption {
    /** VenueFormat.id o legacy CourtFormat string. */
    format: string;
    priceCOP: number;
    available: boolean;
}

interface FormatSelectorProps {
    formats: FormatOption[];
    selected: string | null;
    onSelect: (format: string) => void;
    /** Si true, oculta el precio bajo cada formato. */
    hidePrice?: boolean;
    /** Si true, renderiza como segmented control compacto en lugar de cards grandes. */
    compact?: boolean;
    /** Catálogo multi-deporte de la sede (para resolver labels). */
    venueFormats?: VenueFormat[];
    /**
     * Estilo del label del formato:
     *  - `"raw"` (default): label configurado por el admin (`formatLabel`).
     *  - `"client"`: label estandarizado para el jugador (`clientFormatLabel`),
     *    ej. "Doble (9vs9)".
     */
    labelStyle?: "raw" | "client";
}

export default function FormatSelector({ formats, selected, onSelect, hidePrice = false, compact = false, venueFormats, labelStyle = "raw" }: FormatSelectorProps) {
    const resolveLabel = (format: string) =>
        labelStyle === "client"
            ? clientFormatLabel(format, venueFormats)
            : formatLabel(format, venueFormats);
    if (compact) {
        return (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {formats.map(({ format, available }) => {
                    const isSelected = selected === format;
                    return (
                        <motion.button
                            key={format}
                            whileTap={available ? { scale: 0.97 } : undefined}
                            onClick={() => available && onSelect(format)}
                            disabled={!available}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                                isSelected
                                    ? "bg-[#1f7a4f] text-white shadow-sm"
                                    : available
                                        ? "bg-white text-slate-500"
                                        : "text-slate-300 cursor-not-allowed"
                            }`}
                        >
                            {resolveLabel(format)}
                        </motion.button>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-3 gap-2">
            {formats.map(({ format, priceCOP, available }) => {
                const isSelected = selected === format;
                const label = resolveLabel(format);
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
                        {!hidePrice && (
                            <span className={`text-xs mt-1 ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                                {formatCOP(priceCOP)}
                            </span>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
}
