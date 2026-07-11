"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Layers, Home, CloudSun } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import {
    clientFormatLabel, sportOfFormat, courtsForFormat, venueSurfaces, venueCoverage,
    SPORT_LABELS, SURFACE_LABELS,
} from "@/lib/domain/venue";
import type { VenueFormat, Court, CourtCombo, SportType } from "@/lib/domain/venue";
import { SPORT_EMOJI } from "./SportBadge";

interface FormatOption {
    format: string;
    priceCOP: number;
    available: boolean;
}

interface VenueFormatPickerProps {
    formats: FormatOption[];
    selected: string | null;
    onSelect: (format: string) => void;
    venueFormats?: VenueFormat[];
    courts: Court[];
    combos: CourtCombo[];
}

/**
 * Picker de formato de la vista de jugador: filas de ancho completo con tamaño,
 * superficie/condición y precio DENTRO de cada opción (patrón de apps de reserva
 * tipo Playtomic). Si la sede tiene más de un deporte, antepone pestañas por
 * deporte; con un solo deporte, las pestañas se ocultan y quedan solo las filas.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §7.
 */
export default function VenueFormatPicker({
    formats, selected, onSelect, venueFormats, courts, combos,
}: VenueFormatPickerProps) {
    // Deporte de un formato (legacy sin catálogo ⇒ football).
    const sportOf = (f: string): SportType => sportOfFormat(f, venueFormats) ?? "football";

    // Deportes presentes, en el orden de aparición de los formatos.
    const distinctSports: SportType[] = [];
    for (const f of formats) {
        const s = sportOf(f.format);
        if (!distinctSports.includes(s)) distinctSports.push(s);
    }
    const showTabs = distinctSports.length > 1;

    const [activeSport, setActiveSport] = useState<SportType>(
        selected ? sportOf(selected) : (distinctSports[0] ?? "football"),
    );

    // Mantén visible el formato seleccionado: si cambia a otro deporte, sigue su pestaña.
    useEffect(() => {
        if (selected) {
            const s = sportOf(selected);
            setActiveSport((prev) => (prev !== s ? s : prev));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    const visibleFormats = showTabs
        ? formats.filter((f) => sportOf(f.format) === activeSport)
        : formats;

    // Nombre + tamaño separados a partir de clientFormatLabel ("Doble (9vs9)").
    const splitLabel = (f: string): { name: string; size: string } => {
        const full = clientFormatLabel(f, venueFormats);
        const m = full.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        return m ? { name: m[1], size: m[2] } : { name: full, size: "" };
    };

    return (
        <div>
            {/* Pestañas por deporte (solo si hay más de uno) */}
            {showTabs && (
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-2.5">
                    {distinctSports.map((s) => {
                        const on = s === activeSport;
                        return (
                            <button
                                key={s}
                                onClick={() => setActiveSport(s)}
                                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                                    on ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                <span className="leading-none" aria-hidden>{SPORT_EMOJI[s]}</span>
                                {SPORT_LABELS[s]}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Filas de formato */}
            <div className="space-y-2">
                {visibleFormats.map(({ format, priceCOP, available }) => {
                    const { name, size } = splitLabel(format);
                    const fCourts = courtsForFormat(courts, combos, format);
                    const surfaces = venueSurfaces(fCourts);
                    const { anyCovered, anyUncovered } = venueCoverage(fCourts);
                    const isSelected = selected === format;

                    return (
                        <motion.button
                            key={format}
                            whileTap={available ? { scale: 0.99 } : undefined}
                            onClick={() => available && onSelect(format)}
                            disabled={!available}
                            className={`w-full flex items-center gap-3 text-left px-3.5 py-3 rounded-2xl border-2 transition-colors ${
                                isSelected
                                    ? "border-[#1f7a4f] bg-[#1f7a4f]/[0.07]"
                                    : available
                                        ? "border-slate-200 bg-white hover:border-[#1f7a4f]/40"
                                        : "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                            }`}
                        >
                            {/* Radio */}
                            <span
                                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 grid place-items-center ${
                                    isSelected ? "border-[#1f7a4f] bg-[#1f7a4f]" : "border-slate-300"
                                }`}
                            >
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>

                            {/* Nombre + tamaño + tags */}
                            <span className="flex-1 min-w-0">
                                <span className="flex items-baseline gap-1.5">
                                    <span className="text-base font-bold text-slate-800">{name}</span>
                                    {size && <span className="text-xs font-semibold text-slate-400">{size}</span>}
                                </span>
                                {(surfaces.length > 0 || anyCovered || anyUncovered) && (
                                    <span className="flex flex-wrap gap-1.5 mt-1">
                                        {surfaces.map((s) => (
                                            <span key={s} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                                                <Layers className="w-3 h-3 text-[#1f7a4f]" />
                                                {SURFACE_LABELS[s]}
                                            </span>
                                        ))}
                                        {anyCovered && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                                                <Home className="w-3 h-3 text-[#1f7a4f]" />
                                                Techada
                                            </span>
                                        )}
                                        {anyUncovered && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                                                <CloudSun className="w-3 h-3 text-[#1f7a4f]" />
                                                Descubierta
                                            </span>
                                        )}
                                    </span>
                                )}
                            </span>

                            {/* Precio */}
                            <span className="flex-shrink-0 text-right">
                                <span className={`text-base font-extrabold tabular-nums ${isSelected ? "text-[#145c3a]" : "text-slate-800"}`}>
                                    {formatCOP(priceCOP)}
                                </span>
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
