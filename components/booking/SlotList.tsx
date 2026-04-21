"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCOP } from "@/lib/domain/wallet";

type Period = "all" | "am" | "pm";

export interface SlotItem {
    startTime: string;
    endTime: string;
    priceCOP: number;
    available: boolean;
}

interface SlotListProps {
    slots: SlotItem[];
    selectedStart: string | null;
    selectedEnd: string | null;
    onSelect: (startTime: string, endTime: string) => void;
    onExtend: (endTime: string) => void;
    dateKey: string;
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
}: SlotListProps) {
    const handleTap = (slot: SlotItem) => {
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
        return period === "am" ? h < 12 : h >= 12;
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
                    {(["all", "am", "pm"] as Period[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${period === p
                                ? "bg-white text-[#1f7a4f] shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            {p === "all" ? "Todos" : p.toUpperCase()}
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
                    return (
                        <motion.button
                            key={slot.startTime}
                            whileTap={slot.available ? { scale: 0.98 } : undefined}
                            onClick={() => handleTap(slot)}
                            disabled={!slot.available}
                            className={`
                                w-full flex items-center justify-between
                                px-4 py-3.5 rounded-xl border transition-all
                                ${selected
                                    ? "bg-[#1f7a4f]/10 border-[#1f7a4f] ring-1 ring-[#1f7a4f]/20"
                                    : slot.available
                                        ? "bg-white border-slate-200 hover:border-slate-300"
                                        : "bg-slate-50 border-slate-100 cursor-not-allowed"
                                }
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${slot.available ? "bg-emerald-500" : "bg-red-400"}`} />
                                <span className={`text-base font-medium ${!slot.available ? "text-slate-300 line-through" : selected ? "text-[#1f7a4f]" : "text-slate-700"}`}>
                                    {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                                </span>
                            </div>
                            {slot.available && (
                                <span className={`text-sm font-semibold ${selected ? "text-[#1f7a4f]" : "text-slate-500"}`}>
                                    {formatCOP(slot.priceCOP)}
                                </span>
                            )}
                            {!slot.available && (
                                <span className="text-xs text-slate-300 font-medium">Ocupado</span>
                            )}
                        </motion.button>
                    );
                })}
            </motion.div>
        </AnimatePresence>
    );
}
