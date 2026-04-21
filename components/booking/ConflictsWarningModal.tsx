"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import type { BookingConflict } from "@/lib/domain/venue";

interface ConflictsWarningModalProps {
    open: boolean;
    conflicts: BookingConflict[];
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

function fmtDate(iso: string): string {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", weekday: "short" });
}

export default function ConflictsWarningModal({
    open,
    conflicts,
    onConfirm,
    onCancel,
    loading,
}: ConflictsWarningModalProps) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl max-h-[85vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-5 pt-5 pb-3 flex items-start gap-3 border-b border-slate-100">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-bold text-slate-800">
                                    {conflicts.length === 1
                                        ? "Hay 1 reserva en conflicto"
                                        : `Hay ${conflicts.length} reservas en conflicto`}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Crear este bloqueo no cancelará estas reservas. Contáctalos manualmente.
                                </p>
                            </div>
                            <button
                                onClick={onCancel}
                                className="w-7 h-7 -mt-1 -mr-1 rounded-full hover:bg-slate-100 flex items-center justify-center flex-shrink-0"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                            {conflicts.map((c) => (
                                <div
                                    key={c.bookingId}
                                    className="bg-slate-50 rounded-xl p-3 border border-slate-100"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-slate-700">
                                            {fmtDate(c.date)}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {fmt12h(c.startTime)} – {fmt12h(c.endTime)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Reservado por {c.bookedByName}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
                            <button
                                onClick={onCancel}
                                disabled={loading}
                                className="flex-1 py-3 rounded-xl text-base font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={loading}
                                className="flex-1 py-3 rounded-xl text-base font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
                            >
                                {loading ? "Creando..." : "Continuar"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
