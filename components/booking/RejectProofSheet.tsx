"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { rejectPaymentProof } from "@/lib/bookings";
import { logBookingProofRejected } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import { CANCEL_REASON_MIN_LENGTH, CANCEL_REASON_MAX_LENGTH } from "@/lib/domain/booking";
import type { Booking } from "@/lib/domain/booking";

interface RejectProofSheetProps {
    open: boolean;
    onClose: () => void;
    booking: Booking | null;
    onRejected?: (newStatus: "pending_payment" | "expired") => void;
}

const SUGGESTIONS = [
    "Pago no recibido",
    "Monto incorrecto",
    "Comprobante ilegible",
    "Otro",
];

export default function RejectProofSheet({ open, onClose, booking, onRejected }: RejectProofSheetProps) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setReason("");
        window.dispatchEvent(new Event("bottomsheet:open"));
        return () => {
            window.dispatchEvent(new Event("bottomsheet:close"));
        };
    }, [open]);

    if (!booking) return null;

    const trimmed = reason.trim();
    const canSubmit = trimmed.length >= CANCEL_REASON_MIN_LENGTH
        && trimmed.length <= CANCEL_REASON_MAX_LENGTH
        && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const res = await rejectPaymentProof(booking.id, trimmed);
            await logBookingProofRejected({
                venueId: booking.venueId,
                bookingId: booking.id,
                attemptNumber: (booking.paymentProofHistory?.length ?? 0) + 1,
            });
            if (res.status === "expired") {
                toast.success("Reserva cancelada · se alcanzó el máximo de intentos");
            } else {
                toast.success("Comprobante rechazado · jugador avisado");
            }
            onRejected?.(res.status);
            onClose();
        } catch (err) {
            handleError(err, "No pudimos rechazar el comprobante");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !submitting && onClose()}
                        className="fixed inset-0 bg-black/40 z-[60]"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-xl max-w-md mx-auto"
                    >
                        <div className="p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] md:pb-5">
                            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-800">Rechazar comprobante</h3>
                                <button onClick={onClose} disabled={submitting} className="p-1 text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <p className="text-sm text-slate-500 mb-4">
                                El jugador recibirá el motivo y podrá subir otro comprobante.
                                A los 3 rechazos, la reserva se cancela automáticamente.
                            </p>

                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setReason(s === "Otro" ? "" : s)}
                                        className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Motivo del rechazo..."
                                rows={3}
                                maxLength={CANCEL_REASON_MAX_LENGTH}
                                className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500/50 resize-none mb-1"
                            />
                            <p className="text-[10px] text-slate-400 text-right mb-4">
                                {trimmed.length} / {CANCEL_REASON_MAX_LENGTH}
                            </p>

                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className="flex-1 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Rechazar
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
