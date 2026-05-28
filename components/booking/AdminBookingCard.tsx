"use client";

import { useState } from "react";
import { Users, ChevronRight, CheckCircle2, Banknote, Calendar } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, formatCourtList } from "@/lib/domain/venue";
import type { VenueFormat } from "@/lib/domain/venue";
import {
    bookingStatusLabel,
    bookingStatusColor,
    getNextBookingStatus,
    nextBookingStatusActionLabel,
} from "@/lib/domain/booking";
import type { Booking } from "@/lib/domain/booking";
import { advanceBookingStatus } from "@/lib/bookings";
import { logBookingStatusAdvanced } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import BookingOriginBadge from "./BookingOriginBadge";
import DepositSummary from "./DepositSummary";

const STATUS_DOT: Record<string, string> = {
    yellow: "bg-amber-400",
    orange: "bg-orange-400",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    indigo: "bg-indigo-500",
    purple: "bg-purple-500",
    red: "bg-red-400",
    gray: "bg-slate-300",
};

const STATUS_BADGE: Record<string, string> = {
    yellow: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    indigo: "bg-indigo-50 text-indigo-700",
    purple: "bg-purple-50 text-purple-700",
    red: "bg-red-50 text-red-700",
    gray: "bg-slate-100 text-slate-500",
};

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

interface AdminBookingCardProps {
    booking: Booking;
    venueFormats?: VenueFormat[];
    /** Callback al tap principal — abre cancel sheet o detalle según el estado. */
    onClick?: (booking: Booking) => void;
    /** Abre el sheet de confirmar asistencia para `deposit_confirmed`. */
    onConfirmAttendance?: (booking: Booking) => void;
    /** Abre el sheet de registrar pago para `played` (transición a `paid`). */
    onRegisterPayment?: (booking: Booking) => void;
    /** Tras advance exitoso, notifica al padre para refrescar. */
    onAdvanced?: () => void;
}

export default function AdminBookingCard({
    booking,
    venueFormats,
    onClick,
    onConfirmAttendance,
    onRegisterPayment,
    onAdvanced,
}: AdminBookingCardProps) {
    const [advancing, setAdvancing] = useState(false);

    const color = bookingStatusColor(booking.status);
    const dotClass = STATUS_DOT[color] || STATUS_DOT.gray;
    const badgeClass = STATUS_BADGE[color] || STATUS_BADGE.gray;

    const isClickable = [
        "pending_payment",
        "pending_approval",
        "deposit_confirmed",
        "confirmed",
        "played",
    ].includes(booking.status);

    const handleClick = () => {
        if (isClickable && onClick) onClick(booking);
    };

    const handleAdvance = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = getNextBookingStatus(booking.status);
        if (!next) return;

        // Para "paid": delegar al sheet de registrar pago (no avanzar directo).
        if (next === "paid" && onRegisterPayment) {
            onRegisterPayment(booking);
            return;
        }

        setAdvancing(true);
        try {
            // `getNextBookingStatus` solo retorna "played" o "paid" en el ciclo lineal
            // post-confirmed, ambos válidos para advanceBookingStatus.
            await advanceBookingStatus(booking.id, next as "played" | "paid");
            await logBookingStatusAdvanced({
                venueId: booking.venueId,
                bookingId: booking.id,
                fromStatus: booking.status,
                toStatus: next,
            });
            toast.success(`Reserva → ${bookingStatusLabel(next)}`);
            onAdvanced?.();
        } catch (err) {
            handleError(err, "No pudimos avanzar el estado");
        } finally {
            setAdvancing(false);
        }
    };

    const nextLabel = nextBookingStatusActionLabel(booking.status);
    const showAdvanceBtn = !!nextLabel;
    const showConfirmAttendanceBtn = booking.status === "deposit_confirmed" && !!onConfirmAttendance;

    return (
        <div
            className={`w-full text-left bg-white rounded-xl border border-slate-200 p-3 ${isClickable ? "hover:border-slate-300" : ""}`}
        >
            <button
                type="button"
                onClick={handleClick}
                disabled={!isClickable}
                className="w-full text-left"
            >
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                        <span className="text-sm font-semibold text-slate-700">
                            {fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}
                        </span>
                        <BookingOriginBadge origin="player" />
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badgeClass}`}>
                        {bookingStatusLabel(booking.status)}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0 flex-1">
                        <Users className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{booking.bookedByName}</span>
                        <span className="text-slate-300">·</span>
                        <span className="truncate">{formatLabel(booking.format, venueFormats)}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 flex-shrink-0">
                        {formatCOP(booking.totalPriceCOP)}
                    </span>
                </div>
                {booking.courtNames.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">
                        {formatCourtList(booking.courtNames)}
                    </p>
                )}
            </button>

            {/* Deposit summary (compacto) cuando hay abono y la reserva está en estado post-aprobación */}
            {(["deposit_confirmed", "confirmed", "played", "paid"].includes(booking.status) && booking.depositCOP > 0) && (
                <div className="mt-2">
                    <DepositSummary
                        depositCOP={booking.depositCOP}
                        remainingCOP={booking.remainingCOP}
                        variant="compact"
                    />
                </div>
            )}

            {/* Acciones inline según estado */}
            {(showAdvanceBtn || showConfirmAttendanceBtn) && (
                <div className="mt-2 flex items-center gap-2">
                    {showConfirmAttendanceBtn && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onConfirmAttendance?.(booking);
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white bg-[#1f7a4f] hover:bg-[#16603c] rounded-lg"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmar asistencia
                        </button>
                    )}
                    {!showConfirmAttendanceBtn && showAdvanceBtn && (
                        <button
                            type="button"
                            onClick={handleAdvance}
                            disabled={advancing}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-60"
                        >
                            {getNextBookingStatus(booking.status) === "paid" ? (
                                <Banknote className="w-3.5 h-3.5" />
                            ) : (
                                <Calendar className="w-3.5 h-3.5" />
                            )}
                            {nextLabel}
                            <ChevronRight className="w-3 h-3 -ml-0.5" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
