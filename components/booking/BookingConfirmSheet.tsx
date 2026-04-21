"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, calcDepositCOP, calcRemainingCOP } from "@/lib/domain/venue";
import type { CourtFormat } from "@/lib/domain/venue";

interface BookingConfirmSheetProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    onRecharge?: () => void;
    venueName: string;
    venueAddress: string;
    format: CourtFormat;
    date: string;
    startTime: string;
    endTime: string;
    totalPriceCOP: number;
    depositRequired: boolean;
    depositPercent: number;
    walletBalance: number | null;
}

function formatDateDisplay(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

export default function BookingConfirmSheet({
    open,
    onClose,
    onConfirm,
    onRecharge,
    venueName,
    venueAddress,
    format,
    date,
    startTime,
    endTime,
    totalPriceCOP,
    depositRequired,
    depositPercent,
    walletBalance,
}: BookingConfirmSheetProps) {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        window.dispatchEvent(new Event("bottomsheet:open"));
        return () => {
            window.dispatchEvent(new Event("bottomsheet:close"));
        };
    }, [open]);

    const depositCOP = depositRequired ? calcDepositCOP(totalPriceCOP, depositPercent) : 0;
    const remainingCOP = depositRequired ? calcRemainingCOP(totalPriceCOP, depositCOP) : totalPriceCOP;
    const needsPayment = depositRequired && depositCOP > 0;
    const hasSufficientBalance = walletBalance !== null && walletBalance >= depositCOP;
    const deficit = needsPayment && walletBalance !== null ? Math.max(0, depositCOP - walletBalance) : 0;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-[60]"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[90vh] overflow-y-auto"
                    >
                        <div className="p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] md:pb-5">
                            {/* Handle */}
                            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-800">Confirmar reserva</h3>
                                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Details */}
                            <div className="space-y-2 mb-5">
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="text-sm">
                                        {formatDateDisplay(date)} · {fmt12h(startTime)} – {fmt12h(endTime)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="text-sm">
                                        {formatLabel(format)} · {venueName}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400">{venueAddress}</p>
                            </div>

                            {/* Pricing */}
                            <div className="bg-slate-50 rounded-2xl p-4 mb-5 space-y-2.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Precio cancha</span>
                                    <span className="font-semibold text-slate-700">{formatCOP(totalPriceCOP)}</span>
                                </div>

                                {needsPayment && (
                                    <>
                                        <div className="border-t border-slate-200" />
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Depósito ({depositPercent}%)</span>
                                            <span className="font-bold text-[#1f7a4f]">{formatCOP(depositCOP)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Tu saldo</span>
                                            <span className={`font-medium ${hasSufficientBalance ? "text-slate-700" : "text-red-500"}`}>
                                                {walletBalance !== null ? formatCOP(walletBalance) : "..."}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Resto en sede</span>
                                            <span className="text-slate-700 font-medium">{formatCOP(remainingCOP)}</span>
                                        </div>
                                    </>
                                )}

                                {!needsPayment && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Pago en sede</span>
                                        <span className="text-slate-700 font-medium">{formatCOP(totalPriceCOP)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Insufficient balance warning */}
                            {needsPayment && !hasSufficientBalance && walletBalance !== null && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                                    <span className="text-amber-500 text-lg leading-none mt-0.5">!</span>
                                    <div>
                                        <p className="text-sm font-medium text-amber-700">
                                            Te faltan {formatCOP(deficit)}
                                        </p>
                                        {onRecharge && (
                                            <button
                                                onClick={onRecharge}
                                                className="text-sm text-[#1f7a4f] font-semibold mt-1 hover:underline"
                                            >
                                                Recargar billetera
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Action buttons */}
                            <button
                                onClick={handleConfirm}
                                disabled={loading || (needsPayment && !hasSufficientBalance)}
                                className={`
                                    w-full py-3.5 rounded-xl text-base font-bold transition-all
                                    ${loading || (needsPayment && !hasSufficientBalance)
                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-[#1f7a4f] text-white hover:bg-[#145c3a] active:scale-[0.98]"
                                    }
                                `}
                            >
                                {loading
                                    ? "Procesando..."
                                    : needsPayment
                                        ? `Pagar depósito ${formatCOP(depositCOP)}`
                                        : "Reservar"
                                }
                            </button>

                            {/* Cancellation policy */}
                            <p className="text-xs text-slate-400 text-center mt-3 pb-safe">
                                Cancelación gratis hasta 24h antes del horario
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
