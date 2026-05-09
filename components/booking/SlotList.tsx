"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCOP } from "@/lib/domain/wallet";

type Period = "all" | "day" | "afternoon" | "night";

const PERIOD_LABEL: Record<Period, string> = {
    all: "Todos",
    day: "Día",
    afternoon: "Tarde",
    night: "Noche",
};

export interface OccupantLabel {
    who: string;
    detail: string;
}

export interface SlotItem {
    startTime: string;
    endTime: string;
    priceCOP: number;
    available: boolean;
    occupantLabels?: OccupantLabel[];
    cancelledLabels?: OccupantLabel[];
}

interface SlotListProps {
    slots: SlotItem[];
    selectedStart: string | null;
    selectedEnd: string | null;
    onSelect: (startTime: string, endTime: string) => void;
    onExtend: (endTime: string) => void;
    dateKey: string;
    /** Si true, oculta el precio y la etiqueta "Ocupado". Útil en vistas admin donde el precio no aporta. */
    hidePrice?: boolean;
    /** Si está presente, sobreescribe el flujo de selección/extensión interno y se llama
     * en cualquier slot (libre u ocupado). Permite usar el SlotList como mero selector de "qué hora tocó". */
    onSlotTap?: (slot: SlotItem) => void;
}

function isConsecutive(currentEnd: string, nextStart: string): boolean {
    return currentEnd === nextStart;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

export default function SlotList({
    slots,
    selectedStart,
    selectedEnd,
    onSelect,
    onExtend,
    dateKey,
    hidePrice = false,
    onSlotTap,
}: SlotListProps) {
    const handleTap = (slot: SlotItem) => {
        // Modo "tap libre": el padre decide qué hacer con cualquier slot.
        if (onSlotTap) {
            onSlotTap(slot);
            return;
        }

        if (!slot.available) return;

        if (!selectedStart) {
            onSelect(slot.startTime, slot.endTime);
            return;
        }

        // Si toca el mismo slot, deseleccionar
        if (selectedStart === slot.startTime && selectedEnd === slot.endTime) {
            onSelect(slot.startTime, slot.endTime);
            return;
        }

        // Si es consecutivo al slot actual, extender
        if (selectedEnd && isConsecutive(selectedEnd, slot.startTime)) {
            onExtend(slot.endTime);
            return;
        }

        // Si no, nueva selección
        onSelect(slot.startTime, slot.endTime);
    };

    const isInRange = (slot: SlotItem): boolean => {
        if (!selectedStart || !selectedEnd) return false;
        return slot.startTime >= selectedStart && slot.endTime <= selectedEnd;
    };

    const [period, setPeriod] = useState<Period>("all");

    const filteredSlots = slots.filter((s) => {
        if (period === "all") return true;
        const h = parseInt(s.startTime.split(":")[0], 10);
        if (period === "day") return h < 12;
        if (period === "afternoon") return h >= 12 && h < 18;
        return h >= 18;
    });

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={dateKey}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-2"
            >
                <div className="flex gap-1.5 mb-2 p-1 bg-slate-100 rounded-xl">
                    {(["all", "day", "afternoon", "night"] as Period[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${period === p
                                ? "bg-white text-[#1f7a4f] shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            {PERIOD_LABEL[p]}
                        </button>
                    ))}
                </div>

                {filteredSlots.length === 0 && (
                    <div className="text-center py-10 text-slate-400">
                        <p className="text-base font-medium">No hay horarios disponibles</p>
                        <p className="text-sm mt-1">Intenta con otro día</p>
                    </div>
                )}

                {filteredSlots.map((slot) => {
                    const selected = isInRange(slot);
                    const tappable = slot.available || !!onSlotTap;
                    const activeCount = slot.occupantLabels?.length ?? 0;
                    const cancelledCount = slot.cancelledLabels?.length ?? 0;
                    const hasOccupants = activeCount > 0 || cancelledCount > 0;

                    return (
                        <motion.button
                            key={slot.startTime}
                            whileTap={tappable ? { scale: 0.98 } : undefined}
                            onClick={() => handleTap(slot)}
                            disabled={!tappable}
                            className={`
                                w-full text-left px-4 rounded-xl border transition-all
                                ${hasOccupants ? "py-3" : "py-2"}
                                ${selected
                                    ? "bg-[#1f7a4f]/10 border-[#1f7a4f] ring-1 ring-[#1f7a4f]/20"
                                    : slot.available
                                        ? "bg-white border-slate-200 hover:border-slate-300"
                                        : tappable
                                            ? "bg-slate-50 border-slate-100 hover:border-slate-200"
                                            : "bg-slate-50 border-slate-100 cursor-not-allowed"
                                }
                            `}
                        >
                            {/* Fila de hora */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${slot.available ? "bg-emerald-500" : "bg-red-400"}`} />
                                    <span className={`text-base font-semibold leading-tight ${!slot.available ? (tappable ? "text-slate-500" : "text-slate-400") : selected ? "text-[#1f7a4f]" : "text-slate-700"}`}>
                                        {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                                    </span>
                                </div>
                                {!hidePrice && slot.available && (
                                    <span className={`text-sm font-semibold flex-shrink-0 ${selected ? "text-[#1f7a4f]" : "text-slate-400"}`}>
                                        {formatCOP(slot.priceCOP)}
                                    </span>
                                )}
                                {!hidePrice && !slot.available && (
                                    <span className="text-xs text-slate-400 font-medium flex-shrink-0">Ocupado</span>
                                )}
                            </div>

                            {/* Labels de ocupantes */}
                            {hasOccupants && (
                                <div className="mt-1.5 ml-[18px] space-y-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {activeCount > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                                                {activeCount} reserva{activeCount !== 1 ? "s" : ""}
                                            </span>
                                        )}
                                        {cancelledCount > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
                                                {cancelledCount} cancelada{cancelledCount !== 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>

                                    {activeCount > 0 && (
                                        <ul className="space-y-0.5">
                                            {slot.occupantLabels!.map((label, i) => (
                                                <li key={`o-${i}`} className="flex items-baseline gap-1.5 min-w-0">
                                                    <span className="text-sm font-semibold text-slate-800 truncate min-w-0">{label.who}</span>
                                                    {label.detail && (
                                                        <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0">{label.detail}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {cancelledCount > 0 && (
                                        <ul className="space-y-0.5">
                                            {slot.cancelledLabels!.map((label, i) => (
                                                <li key={`c-${i}`} className="flex items-baseline gap-1.5 min-w-0">
                                                    <span className="text-xs font-medium text-slate-400 line-through truncate min-w-0">{label.who}</span>
                                                    {label.detail && (
                                                        <span className="text-[11px] text-slate-300 whitespace-nowrap flex-shrink-0 line-through">{label.detail}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </motion.button>
                    );
                })}
            </motion.div>
        </AnimatePresence>
    );
}
