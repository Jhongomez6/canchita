"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, XCircle, Hourglass, ImageOff } from "lucide-react";
import { toast } from "react-hot-toast";
import { approveBookingRequest } from "@/lib/bookings";
import { logBookingDepositApproved } from "@/lib/analytics";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel } from "@/lib/domain/venue";
import { handleError } from "@/lib/utils/error";
import BookingExpirationTimer from "./BookingExpirationTimer";
import BookingOriginBadge from "./BookingOriginBadge";
import type { VenueFormat } from "@/lib/domain/venue";
import type { Booking } from "@/lib/domain/booking";

interface PendingBookingAdminCardProps {
    booking: Booking;
    venueFormats?: VenueFormat[];
    onApproved?: () => void;
    onReject: (booking: Booking) => void;
    onCancel?: (booking: Booking) => void;
    onClickProof?: (url: string) => void;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    return `${h % 12 || 12}:${mStr} ${h >= 12 ? "PM" : "AM"}`;
}

function formatDateShort(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60 * 1000) return "hace un momento";
    if (ms < 60 * 60 * 1000) return `hace ${Math.round(ms / 60000)} min`;
    if (ms < 24 * 60 * 60 * 1000) return `hace ${Math.round(ms / (60 * 60 * 1000))} h`;
    return `hace ${Math.round(ms / (24 * 60 * 60 * 1000))} d`;
}

export default function PendingBookingAdminCard({
    booking,
    venueFormats,
    onApproved,
    onReject,
    onCancel,
    onClickProof,
}: PendingBookingAdminCardProps) {
    const [approving, setApproving] = useState(false);
    const [imgError, setImgError] = useState(false);

    const isPendingPayment = booking.status === "pending_payment";
    const isPendingApproval = booking.status === "pending_approval";

    const handleApprove = async () => {
        setApproving(true);
        try {
            await approveBookingRequest(booking.id);
            const approvedAtMs = booking.paymentProofUploadedAt
                ? Date.now() - new Date(booking.paymentProofUploadedAt).getTime()
                : 0;
            await logBookingDepositApproved({
                venueId: booking.venueId,
                bookingId: booking.id,
                timeToApproveMinutes: Math.round(approvedAtMs / 60000),
            });
            toast.success("Abono confirmado · jugador avisado");
            onApproved?.();
        } catch (err) {
            handleError(err, "No pudimos aprobar la solicitud");
        } finally {
            setApproving(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                        <BookingOriginBadge origin="player" />
                    </div>
                    <p className="text-sm font-bold text-slate-800 truncate">
                        {booking.bookedByName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {formatDateShort(booking.date)} · {fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {formatLabel(booking.format, venueFormats)} · Abono {formatCOP(booking.depositCOP)}
                    </p>
                </div>
                {isPendingPayment && booking.expiresAt && (
                    <BookingExpirationTimer expiresAt={booking.expiresAt} />
                )}
            </div>

            {/* Proof thumbnail (solo pending_approval) */}
            {isPendingApproval && booking.paymentProofURL && (
                <button
                    onClick={() => onClickProof?.(booking.paymentProofURL!)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center gap-3 hover:border-[#1f7a4f] transition-colors"
                >
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                        {!imgError ? (
                            <Image
                                src={booking.paymentProofURL}
                                alt="Comprobante"
                                fill
                                className="object-cover"
                                unoptimized
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                <ImageOff className="w-5 h-5 text-slate-400" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-semibold text-slate-700">Comprobante de pago</p>
                        <p className="text-[11px] text-slate-500">
                            {booking.paymentProofUploadedAt
                                ? `Subido ${timeAgo(booking.paymentProofUploadedAt)}`
                                : "Sin fecha"}
                        </p>
                        <p className="text-[11px] text-[#1f7a4f] font-semibold mt-0.5">
                            Tap para ver en grande →
                        </p>
                    </div>
                </button>
            )}

            {/* Empty state pending_payment */}
            {isPendingPayment && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2 text-amber-700">
                    <Hourglass className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">Esperando comprobante del jugador</span>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
                {isPendingApproval && (
                    <>
                        <button
                            onClick={handleApprove}
                            disabled={approving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aprobar abono
                        </button>
                        <button
                            onClick={() => onReject(booking)}
                            disabled={approving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 border border-rose-100"
                        >
                            <XCircle className="w-3.5 h-3.5" />
                            Rechazar
                        </button>
                    </>
                )}
                {isPendingPayment && onCancel && (
                    <button
                        onClick={() => onCancel(booking)}
                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600"
                    >
                        Cancelar reserva
                    </button>
                )}
            </div>
        </div>
    );
}
