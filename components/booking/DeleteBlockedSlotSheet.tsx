"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import { deleteBlockedSlot, type DeleteBlockedSlotMode } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import { logBlockedSlotDeleted } from "@/lib/analytics";
import { labelForRecurrence } from "@/lib/domain/blocked-slots";
import type { BlockedSlot } from "@/lib/domain/venue";

interface DeleteBlockedSlotSheetProps {
    open: boolean;
    onClose: () => void;
    onDeleted: () => void;
    venueId: string;
    slot: BlockedSlot;
    /** Fecha de la instancia que se está viendo (relevante para recurrentes). */
    targetDate: string;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

export default function DeleteBlockedSlotSheet({
    open,
    onClose,
    onDeleted,
    venueId,
    slot,
    targetDate,
}: DeleteBlockedSlotSheetProps) {
    const [submitting, setSubmitting] = useState<DeleteBlockedSlotMode | null>(null);
    const [confirmingTerminate, setConfirmingTerminate] = useState(false);

    const isRecurring = !!slot.recurrence;

    const run = async (mode: DeleteBlockedSlotMode) => {
        setSubmitting(mode);
        try {
            await deleteBlockedSlot(venueId, slot.id, mode, mode === "oneoff" ? undefined : targetDate);
            logBlockedSlotDeleted({
                venueId,
                blockedSlotId: slot.id,
                mode,
                isRecurring,
            });
            const msg =
                mode === "oneoff" ? "Reserva manual eliminada" :
                mode === "instance" ? "Cancelada para esta fecha" :
                "Recurrencia terminada";
            toast.success(msg);
            onDeleted();
            onClose();
        } catch (err) {
            handleError(err, "Error al eliminar");
        } finally {
            setSubmitting(null);
            setConfirmingTerminate(false);
        }
    };

    const busy = submitting !== null;

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !busy && onClose()}
                        className="fixed inset-0 bg-black/40 z-50"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[92vh] flex flex-col"
                    >
                        <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Eliminar reserva manual</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {formatDateLabel(targetDate)} · {fmt12h(slot.startTime)}–{fmt12h(slot.endTime)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !busy && onClose()}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)] space-y-3">
                            {(slot.clientName || slot.reason) && (
                                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-800">
                                    {slot.clientName && <p className="font-semibold">{slot.clientName}</p>}
                                    {slot.reason && <p className="text-xs text-indigo-700/80 mt-0.5">{slot.reason}</p>}
                                    {isRecurring && slot.recurrence && (
                                        <p className="text-[11px] text-indigo-600 mt-1">
                                            Se repite: {labelForRecurrence(slot.recurrence)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {!isRecurring && (
                                <button
                                    type="button"
                                    onClick={() => run("oneoff")}
                                    disabled={busy}
                                    className="w-full py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:bg-red-300 flex items-center justify-center gap-1.5"
                                >
                                    {submitting === "oneoff" ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Eliminando...
                                        </>
                                    ) : (
                                        "Eliminar"
                                    )}
                                </button>
                            )}

                            {isRecurring && !confirmingTerminate && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => run("instance")}
                                        disabled={busy}
                                        className="w-full py-3 text-sm font-semibold text-[#1f7a4f] bg-white border border-[#1f7a4f]/30 rounded-xl hover:bg-[#1f7a4f]/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                        {submitting === "instance" ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Cancelando...
                                            </>
                                        ) : (
                                            <>Cancelar solo este día</>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingTerminate(true)}
                                        disabled={busy}
                                        className="w-full py-3 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                                    >
                                        Terminar recurrencia
                                    </button>
                                    <p className="text-[11px] text-slate-400 text-center">
                                        Las fechas pasadas se mantienen para tu historial.
                                    </p>
                                </>
                            )}

                            {isRecurring && confirmingTerminate && (
                                <div className="space-y-3">
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-800">
                                            Las fechas futuras desde <span className="font-semibold">{formatDateLabel(targetDate)}</span> dejarán de bloquearse. Las pasadas se mantienen para auditoría.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingTerminate(false)}
                                            disabled={busy}
                                            className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                                        >
                                            Volver
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => run("recurrence")}
                                            disabled={busy}
                                            className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:bg-red-300 flex items-center justify-center gap-1.5"
                                        >
                                            {submitting === "recurrence" ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Terminando...
                                                </>
                                            ) : (
                                                "Sí, terminar"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
