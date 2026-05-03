"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import {
    PLAYER_CANCEL_SUGGESTIONS,
    ADMIN_CANCEL_SUGGESTIONS,
    CANCEL_REASON_MIN_LENGTH,
    CANCEL_REASON_MAX_LENGTH,
} from "@/lib/domain/booking";

export type CancelMode = "player" | "admin";

interface BookingSummary {
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    bookedByName?: string;
    depositCOP?: number;
}

interface CancelBookingSheetProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void> | void;
    mode: CancelMode;
    booking: BookingSummary;
    /** Indica si la cancelación generará reembolso (lo decide el caller). */
    willRefund: boolean;
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

export default function CancelBookingSheet({
    open,
    onClose,
    onConfirm,
    mode,
    booking,
    willRefund,
}: CancelBookingSheetProps) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            setReason("");
            setSubmitting(false);
        }
    }, [open]);

    const suggestions = mode === "player" ? PLAYER_CANCEL_SUGGESTIONS : ADMIN_CANCEL_SUGGESTIONS;
    const trimmed = reason.trim();
    const tooShort = trimmed.length > 0 && trimmed.length < CANCEL_REASON_MIN_LENGTH;
    const isValid = trimmed.length >= CANCEL_REASON_MIN_LENGTH && trimmed.length <= CANCEL_REASON_MAX_LENGTH;

    const handleConfirm = async () => {
        if (!isValid || submitting) return;
        setSubmitting(true);
        try {
            await onConfirm(trimmed);
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
                                <h3 className="text-lg font-bold text-slate-800">
                                    {mode === "admin" ? "Cancelar reserva del cliente" : "Cancelar reserva"}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {formatDateLabel(booking.date)} · {fmt12h(booking.startTime)}–{fmt12h(booking.endTime)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !submitting && onClose()}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)] space-y-4">
                            {/* Reembolso */}
                            {willRefund && booking.depositCOP && booking.depositCOP > 0 ? (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <p className="text-sm text-emerald-700">
                                        Se devolverán <span className="font-semibold">{formatCOP(booking.depositCOP)}</span>
                                        {mode === "admin" ? " a la billetera del cliente." : " a tu billetera."}
                                    </p>
                                </div>
                            ) : booking.depositCOP && booking.depositCOP > 0 ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                    <p className="text-sm text-amber-700 font-medium">
                                        No se reembolsará el depósito (faltan menos de 24h)
                                    </p>
                                </div>
                            ) : null}

                            {mode === "admin" && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                                    <p className="text-xs text-blue-700">
                                        El cliente recibirá una notificación con el motivo que escribas.
                                    </p>
                                </div>
                            )}

                            {/* Sugerencias */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 mb-2">Motivos frecuentes</p>
                                <div className="flex flex-wrap gap-2">
                                    {suggestions.map((s) => {
                                        const active = trimmed === s;
                                        return (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => setReason(s)}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                                    active
                                                        ? "bg-[#1f7a4f] text-white border-[#1f7a4f]"
                                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                                }`}
                                            >
                                                {s}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Textarea */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                                    Motivo {mode === "admin" ? "(visible para el cliente)" : ""}
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    maxLength={CANCEL_REASON_MAX_LENGTH}
                                    placeholder={
                                        mode === "admin"
                                            ? "Explica al cliente por qué se cancela su reserva"
                                            : "Cuéntanos brevemente por qué cancelas"
                                    }
                                    className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 resize-none"
                                />
                                <div className="flex justify-between mt-1">
                                    {tooShort ? (
                                        <p className="text-[11px] text-red-500">
                                            Debe tener al menos {CANCEL_REASON_MIN_LENGTH} caracteres
                                        </p>
                                    ) : (
                                        <span />
                                    )}
                                    <p className="text-[11px] text-slate-400">
                                        {trimmed.length}/{CANCEL_REASON_MAX_LENGTH}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => !submitting && onClose()}
                                    disabled={submitting}
                                    className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                                >
                                    Volver
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={!isValid || submitting}
                                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                                        isValid && !submitting
                                            ? "bg-red-500 text-white hover:bg-red-600"
                                            : "bg-red-200 text-white cursor-not-allowed"
                                    }`}
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Cancelando...
                                        </>
                                    ) : (
                                        "Confirmar cancelación"
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
