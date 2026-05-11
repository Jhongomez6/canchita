"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import type { VenueFormatDurationTier } from "@/lib/domain/venue";

interface DurationTiersEditorProps {
    tiers: VenueFormatDurationTier[];
    /** Si está, se usa para warning visual si un flat es mayor a `slotBasePriceHint × (minMinutes/60)`. */
    slotBasePriceHint?: number;
    onChange: (tiers: VenueFormatDurationTier[]) => void;
}

type TierMode = "percent" | "flat";

interface DraftTier {
    minMinutes: number;
    mode: TierMode;
    percentOff: string;       // string para input controlado
    flatPriceCOP: string;     // string para input controlado (en pesos, no centavos)
}

function tierToDraft(t: VenueFormatDurationTier): DraftTier {
    if (t.percentOff !== undefined) {
        return {
            minMinutes: t.minMinutes,
            mode: "percent",
            percentOff: String(t.percentOff),
            flatPriceCOP: "",
        };
    }
    return {
        minMinutes: t.minMinutes,
        mode: "flat",
        percentOff: "",
        flatPriceCOP: String(Math.round(t.flatPriceCOP / 100)),
    };
}

function draftToTier(d: DraftTier): VenueFormatDurationTier | null {
    if (!Number.isInteger(d.minMinutes) || d.minMinutes <= 0 || d.minMinutes > 1440) return null;
    if (d.mode === "percent") {
        const n = Number(d.percentOff);
        if (!Number.isFinite(n) || n < 0.01 || n > 99.99) return null;
        if (Math.round(n * 100) / 100 !== n) return null;
        return { minMinutes: d.minMinutes, percentOff: n };
    }
    const pesos = Number(d.flatPriceCOP);
    if (!Number.isFinite(pesos) || pesos < 0) return null;
    return { minMinutes: d.minMinutes, flatPriceCOP: Math.round(pesos * 100) };
}

function formatTierDesc(t: VenueFormatDurationTier): string {
    if (t.percentOff !== undefined) {
        return `−${t.percentOff}%`;
    }
    return formatCOP(t.flatPriceCOP);
}

export default function DurationTiersEditor({
    tiers,
    slotBasePriceHint,
    onChange,
}: DurationTiersEditorProps) {
    const [drafts, setDrafts] = useState<DraftTier[]>(() => tiers.map(tierToDraft));

    // Sync prop changes (cuando el padre re-render con nuevos tiers tras importLegacy, etc.)
    // Sin re-renderizar mientras el user edita activamente, usamos un signature simple.
    // Para mantener simple, no sincronizamos automáticamente; el caller siempre crea/edita via este editor.

    const commit = (next: DraftTier[]) => {
        setDrafts(next);
        // Solo pasar al parent las que son válidas (las inválidas se quedan en el draft local)
        const valid: VenueFormatDurationTier[] = [];
        for (const d of next) {
            const t = draftToTier(d);
            if (t) valid.push(t);
        }
        // Ordenar por minMinutes ascendente
        valid.sort((a, b) => a.minMinutes - b.minMinutes);
        onChange(valid);
    };

    const addTier = () => {
        commit([...drafts, { minMinutes: 120, mode: "percent", percentOff: "10", flatPriceCOP: "" }]);
    };

    const removeTier = (idx: number) => {
        commit(drafts.filter((_, i) => i !== idx));
    };

    const updateDraft = (idx: number, patch: Partial<DraftTier>) => {
        commit(drafts.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
    };

    const isDraftInvalid = (d: DraftTier): string | null => {
        if (!Number.isInteger(d.minMinutes) || d.minMinutes <= 0 || d.minMinutes > 1440) {
            return "1–1440";
        }
        if (d.mode === "percent") {
            const n = Number(d.percentOff);
            if (!Number.isFinite(n) || n < 0.01 || n > 99.99) return "0.01–99.99";
            if (Math.round(n * 100) / 100 !== n) return "máx 2 decimales";
        } else {
            const p = Number(d.flatPriceCOP);
            if (!Number.isFinite(p) || p < 0) return "≥ 0";
        }
        return null;
    };

    const showWarning = (d: DraftTier): boolean => {
        if (d.mode !== "flat" || !slotBasePriceHint) return false;
        const flat = Number(d.flatPriceCOP) * 100;
        if (!Number.isFinite(flat) || flat <= 0) return false;
        const projectedSubtotal = slotBasePriceHint * (d.minMinutes / 60);
        return flat > projectedSubtotal;
    };

    return (
        <div className="space-y-2">
            <AnimatePresence>
                {drafts.map((d, idx) => {
                    const error = isDraftInvalid(d);
                    const warn = showWarning(d);
                    return (
                        <motion.div
                            key={idx}
                            layout
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            className="bg-white rounded-xl border border-slate-200 p-3 space-y-2"
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-0.5">
                                        Desde (min)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={1440}
                                        step={1}
                                        value={d.minMinutes}
                                        onChange={(e) => updateDraft(idx, { minMinutes: parseInt(e.target.value, 10) || 0 })}
                                        className="w-full px-2 py-1.5 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                    />
                                </div>
                                <div className="flex-shrink-0">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-0.5">
                                        Tipo
                                    </label>
                                    <div className="flex bg-slate-100 rounded-lg p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => updateDraft(idx, { mode: "percent", flatPriceCOP: "" })}
                                            className={`px-3 py-1 text-xs font-bold rounded ${d.mode === "percent" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}
                                        >
                                            %
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateDraft(idx, { mode: "flat", percentOff: "" })}
                                            className={`px-3 py-1 text-xs font-bold rounded ${d.mode === "flat" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}
                                        >
                                            $
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-0.5">
                                        {d.mode === "percent" ? "Descuento" : "Precio total"}
                                    </label>
                                    {d.mode === "percent" ? (
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={0.01}
                                                max={99.99}
                                                step={0.01}
                                                value={d.percentOff}
                                                onChange={(e) => updateDraft(idx, { percentOff: e.target.value })}
                                                className="w-full px-2 py-1.5 text-base border border-slate-200 rounded-lg pr-7 focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                                            <input
                                                type="number"
                                                min={0}
                                                step={1000}
                                                value={d.flatPriceCOP}
                                                onChange={(e) => updateDraft(idx, { flatPriceCOP: e.target.value })}
                                                placeholder="140000"
                                                className="w-full pl-5 pr-2 py-1.5 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                            />
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeTier(idx)}
                                    className="flex-shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors self-end"
                                    aria-label="Eliminar tier"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {error && (
                                <p className="text-[10px] text-red-500">Valor fuera de rango: {error}</p>
                            )}
                            {!error && warn && (
                                <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                    <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-amber-800">
                                        El precio flat parece mayor al subtotal por slots. ¿Es correcto?
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>

            <button
                type="button"
                onClick={addTier}
                className="w-full py-2 text-xs font-semibold text-[#1f7a4f] bg-[#1f7a4f]/5 hover:bg-[#1f7a4f]/10 border border-dashed border-[#1f7a4f]/30 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
                <Plus className="w-3.5 h-3.5" />
                Agregar tarifa
            </button>

            {drafts.length > 0 && (
                <p className="text-[10px] text-slate-400">
                    Tarifas configuradas: {tiers.map((t) => `${t.minMinutes}min → ${formatTierDesc(t)}`).join(" · ")}
                </p>
            )}
        </div>
    );
}
