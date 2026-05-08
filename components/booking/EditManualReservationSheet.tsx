"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { updateManualReservation } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import type { BlockedSlot } from "@/lib/domain/venue";

interface EditManualReservationSheetProps {
    open: boolean;
    onClose: () => void;
    venueId: string;
    slot: BlockedSlot;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    return `${h % 12 || 12}:${mStr} ${h >= 12 ? "PM" : "AM"}`;
}

export default function EditManualReservationSheet({
    open,
    onClose,
    venueId,
    slot,
}: EditManualReservationSheetProps) {
    const [clientName, setClientName] = useState(slot.clientName ?? "");
    const [clientPhone, setClientPhone] = useState(slot.clientPhone ?? "");
    const [reason, setReason] = useState(slot.reason ?? "");
    const [isMonthly, setIsMonthly] = useState(slot.isMonthly ?? false);
    const [submitting, setSubmitting] = useState(false);
    const isRecurring = !!slot.recurrence;

    useEffect(() => {
        if (open) {
            setClientName(slot.clientName ?? "");
            setClientPhone(slot.clientPhone ?? "");
            setReason(slot.reason ?? "");
            setIsMonthly(slot.isMonthly ?? false);
        }
    }, [open, slot]);

    const handleClose = () => {
        if (submitting) return;
        onClose();
    };

    const handleSave = async () => {
        setSubmitting(true);
        try {
            await updateManualReservation(venueId, slot.id, {
                clientName: clientName.trim() || undefined,
                clientPhone: clientPhone.trim() || undefined,
                reason: reason.trim() || undefined,
                ...(isRecurring ? { isMonthly } : {}),
            });
            toast.success("Reserva actualizada");
            onClose();
        } catch (err) {
            handleError(err, "Error al actualizar la reserva");
        } finally {
            setSubmitting(false);
        }
    };

    const hasChanges =
        (clientName.trim() || "") !== (slot.clientName ?? "") ||
        (clientPhone.trim() || "") !== (slot.clientPhone ?? "") ||
        (reason.trim() || "") !== (slot.reason ?? "") ||
        (isRecurring && isMonthly !== (slot.isMonthly ?? false));

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
                                <h3 className="text-lg font-bold text-slate-800">Editar reserva</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
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
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                                    Nombre del cliente
                                </label>
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="Ej: Juan Pérez"
                                    maxLength={100}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                                    Teléfono
                                </label>
                                <input
                                    type="tel"
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    placeholder="Ej: 3001234567"
                                    maxLength={20}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                                    Notas
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Ej: Torneo empresas, pago contraentrega..."
                                    maxLength={300}
                                    rows={3}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 resize-none"
                                />
                            </div>

                            {/* Pago mensual — solo recurrentes */}
                            {isRecurring && (
                                <div className="flex items-center justify-between py-1 border-t border-slate-100 pt-3">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">Pago mensual</p>
                                        <p className="text-[11px] text-slate-400">El cliente paga una mensualidad fija</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsMonthly((v) => !v)}
                                        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isMonthly ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                                    >
                                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isMonthly ? "left-[22px]" : "left-0.5"}`} />
                                    </button>
                                </div>
                            )}

                            {/* Aviso: editar aplica a toda la recurrencia */}
                            {isRecurring && (
                                <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                                    Esta es una reserva recurrente. Los cambios aplican a todas las instancias.
                                </p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={submitting}
                                    className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={submitting || !hasChanges}
                                    className="flex-1 py-3 text-sm font-bold text-white bg-[#1f7a4f] rounded-xl hover:bg-[#16603c] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                                >
                                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
