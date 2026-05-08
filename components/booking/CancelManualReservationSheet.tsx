"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Ban, Loader2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { cancelManualReservation, type CancelManualReservationScope } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import { logManualReservationCancelled } from "@/lib/analytics";
import { labelForRecurrence } from "@/lib/domain/blocked-slots";
import type { BlockedSlot } from "@/lib/domain/venue";

interface CancelManualReservationSheetProps {
    open: boolean;
    onClose: () => void;
    onCancelled: () => void;
    venueId: string;
    slot: BlockedSlot;
    targetDate: string;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${h >= 12 ? "PM" : "AM"}`;
}

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

export default function CancelManualReservationSheet({
    open,
    onClose,
    onCancelled,
    venueId,
    slot,
    targetDate,
}: CancelManualReservationSheetProps) {
    const isRecurring = !!slot.recurrence;

    const [reason, setReason] = useState("");
    const [scope, setScope] = useState<CancelManualReservationScope>(
        isRecurring ? "single" : "non_recurring",
    );
    const [confirmingAll, setConfirmingAll] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleClose = () => {
        if (submitting) return;
        setReason("");
        setScope(isRecurring ? "single" : "non_recurring");
        setConfirmingAll(false);
        onClose();
    };

    const handleConfirm = async () => {
        if (scope === "all" && !confirmingAll) {
            setConfirmingAll(true);
            return;
        }
        setSubmitting(true);
        try {
            await cancelManualReservation(venueId, slot, reason, scope, targetDate);
            logManualReservationCancelled({
                venueId,
                slotId: slot.id,
                hadReason: reason.trim().length > 0,
                scope,
                wasRecurring: isRecurring,
            });
            const msg =
                scope === "all" ? "Recurrencia eliminada" :
                scope === "future" ? "Recurrencia acortada y fecha cancelada" :
                "Reserva cancelada";
            toast.success(msg);
            onCancelled();
            handleClose();
        } catch (err) {
            handleError(err, "Error al cancelar la reserva");
        } finally {
            setSubmitting(false);
        }
    };

    const scopeIsAll = scope === "all";

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/40 z-50"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[92vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Cancelar reserva</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {formatDateLabel(targetDate)} · {fmt12h(slot.startTime)}–{fmt12h(slot.endTime)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={submitting}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)] space-y-4">
                            {/* Resumen de la reserva */}
                            {slot.clientName && (
                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm text-slate-700">
                                    <p className="font-semibold">{slot.clientName}</p>
                                    {isRecurring && slot.recurrence && (
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            {labelForRecurrence(slot.recurrence)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Scope selector (solo recurrentes) */}
                            {isRecurring && !confirmingAll && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">¿Qué cancelar?</p>
                                    {(["single", "future", "all"] as const).map((s) => {
                                        const labels: Record<typeof s, string> = {
                                            single: "Solo este día",
                                            future: "Este día y los siguientes",
                                            all: "Toda la recurrencia (eliminar)",
                                        };
                                        return (
                                            <label
                                                key={s}
                                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                                    scope === s
                                                        ? s === "all"
                                                            ? "border-red-300 bg-red-50"
                                                            : "border-[#1f7a4f]/40 bg-[#1f7a4f]/5"
                                                        : "border-slate-200 hover:bg-slate-50"
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="scope"
                                                    value={s}
                                                    checked={scope === s}
                                                    onChange={() => setScope(s)}
                                                    className="accent-[#1f7a4f]"
                                                />
                                                <span className={`text-sm font-medium ${s === "all" ? "text-red-600" : "text-slate-700"}`}>
                                                    {labels[s]}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Motivo (solo si no es hard-delete de toda la recurrencia) */}
                            {!scopeIsAll && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                                        Motivo (opcional)
                                    </label>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Ej: Cliente no pudo asistir, reagendar para la semana siguiente..."
                                        maxLength={300}
                                        rows={3}
                                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 resize-none"
                                    />
                                </div>
                            )}

                            {/* Confirmación doble para "toda la recurrencia" */}
                            {scopeIsAll && confirmingAll && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-red-700 mb-1">
                                            ¿Eliminar toda la recurrencia?
                                        </p>
                                        <p className="text-xs text-red-600">
                                            Esto eliminará el bloqueo recurrente permanentemente. Las instancias pasadas que ya existen en el historial no se ven afectadas.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Botones */}
                            <div className="flex gap-2 pt-1">
                                {confirmingAll ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingAll(false)}
                                            disabled={submitting}
                                            className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                                        >
                                            Volver
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirm}
                                            disabled={submitting}
                                            className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:bg-red-300 flex items-center justify-center gap-1.5"
                                        >
                                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Sí, eliminar
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            disabled={submitting}
                                            className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                                        >
                                            Volver
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirm}
                                            disabled={submitting}
                                            className={`flex-1 py-3 text-sm font-bold text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                                                scopeIsAll
                                                    ? "bg-red-500 hover:bg-red-600"
                                                    : "bg-slate-700 hover:bg-slate-800"
                                            }`}
                                        >
                                            {submitting ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Ban className="w-4 h-4" />
                                            )}
                                            {scopeIsAll ? "Eliminar recurrencia" : "Cancelar reserva"}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
