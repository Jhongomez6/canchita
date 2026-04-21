"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Clock, MapPin, CreditCard } from "lucide-react";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel } from "@/lib/domain/venue";
import { isBookingRefundable, bookingStatusLabel, bookingStatusColor } from "@/lib/domain/booking";
import { subscribeToBooking, cancelBooking } from "@/lib/bookings";
import { handleError } from "@/lib/utils/error";
import { logBookingCancelled } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import type { Booking } from "@/lib/domain/booking";

const STATUS_STYLES: Record<string, string> = {
    yellow: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    gray: "bg-slate-100 text-slate-500",
    orange: "bg-orange-50 text-orange-700",
};

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

function formatDateFull(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

function BookingDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const bookingId = params.id as string;

    const [booking, setBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        if (!bookingId) return;
        const unsub = subscribeToBooking(bookingId, (b) => {
            setBooking(b);
            setLoading(false);
        });
        return () => unsub();
    }, [bookingId]);

    const refundable = booking
        ? isBookingRefundable(booking.date, booking.startTime)
        : false;

    const canCancel = booking?.status === "confirmed" || booking?.status === "pending_payment";
    const isOwner = booking && user && booking.bookedBy === user.uid;

    const handleCancel = async () => {
        if (!booking) return;
        setCancelling(true);
        try {
            const result = await cancelBooking(booking.id);
            const slotMs = new Date(`${booking.date}T${booking.startTime}:00`).getTime();
            const hoursBeforeStart = Math.max(0, Math.round((slotMs - Date.now()) / (1000 * 60 * 60)));
            logBookingCancelled({
                venueId: booking.venueId,
                bookingId: booking.id,
                refunded: result.refunded,
                hoursBeforeStart,
            });
            if (result.refunded) {
                toast.success(`Reserva cancelada · Depósito de ${formatCOP(result.refundAmount)} reembolsado`);
            } else {
                toast.success("Reserva cancelada");
            }
            setCancelConfirmOpen(false);
        } catch (err) {
            handleError(err, "Error al cancelar la reserva");
        } finally {
            setCancelling(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24 animate-pulse">
                <div className="max-w-md mx-auto">
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-10 rounded-b-3xl">
                        <div className="h-5 bg-white/20 rounded w-40" />
                    </div>
                    <div className="px-4 -mt-4 space-y-4">
                        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
                            <div className="h-5 bg-slate-200 rounded w-32" />
                            <div className="h-4 bg-slate-100 rounded w-48" />
                            <div className="h-4 bg-slate-100 rounded w-36" />
                            <div className="h-4 bg-slate-100 rounded w-40" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!booking) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-base text-slate-500">Reserva no encontrada</p>
                    <button
                        onClick={() => router.push("/bookings")}
                        className="mt-3 text-sm text-[#1f7a4f] font-semibold hover:underline"
                    >
                        Volver a mis reservas
                    </button>
                </div>
            </div>
        );
    }

    const color = bookingStatusColor(booking.status);
    const statusStyle = STATUS_STYLES[color] || STATUS_STYLES.gray;

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-10 rounded-b-3xl shadow-lg">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push("/bookings")}
                            className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"
                        >
                            <ArrowLeft className="w-4 h-4 text-white" />
                        </button>
                        <h1 className="text-lg font-bold text-white">Detalle de reserva</h1>
                    </div>
                </div>

                {/* Main card */}
                <div className="px-4 -mt-4 relative z-10">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        {/* Status + format */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-slate-800">{formatLabel(booking.format)}</h2>
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusStyle}`}>
                                {bookingStatusLabel(booking.status)}
                            </span>
                        </div>

                        {/* Venue */}
                        <p className="text-base font-semibold text-slate-700 mb-3">{booking.venueName}</p>

                        {/* Details */}
                        <div className="space-y-2.5 mb-4">
                            <div className="flex items-center gap-3 text-slate-600">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                <span className="text-sm">{formatDateFull(booking.date)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <span className="text-sm">{fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                <span className="text-sm">{booking.venueAddress}</span>
                            </div>
                        </div>

                        {/* Pricing breakdown */}
                        <div className="border-t border-slate-100 pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Precio cancha</span>
                                <span className="font-semibold text-slate-700">{formatCOP(booking.totalPriceCOP)}</span>
                            </div>
                            {booking.depositCOP > 0 && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-1.5">
                                            <CreditCard className="w-3.5 h-3.5" />
                                            Depósito ({booking.depositPercent}%)
                                        </span>
                                        <span className="font-bold text-[#1f7a4f]">{formatCOP(booking.depositCOP)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Resto en sede</span>
                                        <span className="text-slate-700">{formatCOP(booking.remainingCOP)}</span>
                                    </div>
                                </>
                            )}
                            {booking.paymentMethod === "on_site" && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Pago en sede</span>
                                    <span className="text-slate-700">{formatCOP(booking.totalPriceCOP)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cancel button */}
                    {canCancel && isOwner && (
                        <button
                            onClick={() => setCancelConfirmOpen(true)}
                            className="w-full mt-4 py-3 text-sm font-semibold text-red-500 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                        >
                            Cancelar reserva
                        </button>
                    )}
                </div>

                {/* Cancel confirm sheet */}
                <AnimatePresence>
                    {cancelConfirmOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setCancelConfirmOpen(false)}
                                className="fixed inset-0 bg-black/40 z-50"
                            />
                            <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-xl max-w-md mx-auto"
                            >
                                <div className="p-5 pb-safe">
                                    <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                                    <h3 className="text-lg font-bold text-slate-800 mb-2">Cancelar reserva</h3>

                                    {refundable && booking.depositCOP > 0 ? (
                                        <p className="text-sm text-slate-600 mb-5">
                                            Se reembolsará tu depósito de <span className="font-semibold text-[#1f7a4f]">{formatCOP(booking.depositCOP)}</span> a tu billetera.
                                        </p>
                                    ) : booking.depositCOP > 0 ? (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
                                            <p className="text-sm text-amber-700 font-medium">
                                                No se reembolsará el depósito (faltan menos de 24h)
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-600 mb-5">
                                            ¿Estás seguro de que quieres cancelar esta reserva?
                                        </p>
                                    )}

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setCancelConfirmOpen(false)}
                                            className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                                        >
                                            Volver
                                        </button>
                                        <button
                                            onClick={handleCancel}
                                            disabled={cancelling}
                                            className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:bg-red-300"
                                        >
                                            {cancelling ? "Cancelando..." : "Sí, cancelar"}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function BookingDetailPage() {
    return (
        <AuthGuard>
            <BookingDetailContent />
        </AuthGuard>
    );
}
