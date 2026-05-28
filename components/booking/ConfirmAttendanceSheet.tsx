"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Phone, MessageCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { confirmBookingAttendance } from "@/lib/bookings";
import { logBookingAttendanceConfirmed } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import type { Booking } from "@/lib/domain/booking";

interface ConfirmAttendanceSheetProps {
    open: boolean;
    onClose: () => void;
    booking: Booking | null;
    onConfirmed?: () => void;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    return `${h % 12 || 12}:${mStr} ${h >= 12 ? "PM" : "AM"}`;
}

export default function ConfirmAttendanceSheet({ open, onClose, booking, onConfirmed }: ConfirmAttendanceSheetProps) {
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        window.dispatchEvent(new Event("bottomsheet:open"));
        return () => {
            window.dispatchEvent(new Event("bottomsheet:close"));
        };
    }, [open]);

    if (!booking) return null;

    const handleConfirm = async () => {
        setSubmitting(true);
        try {
            await confirmBookingAttendance(booking.id);
            await logBookingAttendanceConfirmed({
                venueId: booking.venueId,
                bookingId: booking.id,
            });
            toast.success("Asistencia confirmada · jugador avisado");
            onConfirmed?.();
            onClose();
        } catch (err) {
            handleError(err, "No pudimos confirmar la asistencia");
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
                                <h3 className="text-lg font-bold text-slate-800">Confirmar asistencia</h3>
                                <button onClick={onClose} disabled={submitting} className="p-1 text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-3 mb-4">
                                <p className="text-sm font-bold text-slate-800">{booking.bookedByName}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {booking.venueName} · {fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}
                                </p>
                            </div>

                            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                                Contacta al cliente para validar que asistirá al partido.
                                Cuando confirmes con él, marca la reserva como confirmada.
                            </p>

                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-4">
                                <Phone className="w-3 h-3" />
                                <span>Llama o escribe</span>
                                <span className="text-slate-300">·</span>
                                <MessageCircle className="w-3 h-3" />
                                <span>WhatsApp</span>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-[#1f7a4f] text-white text-sm font-bold hover:bg-[#16603c] disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Confirmar asistencia
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
