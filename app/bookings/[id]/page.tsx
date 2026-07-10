"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Clock, MapPin, AlertTriangle, Check, CircleDashed } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel } from "@/lib/domain/venue";
import type { VenueFormat, Venue } from "@/lib/domain/venue";
import { getVenue } from "@/lib/venues";
import {
    isBookingRefundable,
    isBookingExpired,
    bookingStatusLabelForPlayer,
    bookingStatusColor,
    MAX_PAYMENT_PROOF_ATTEMPTS,
} from "@/lib/domain/booking";
import { subscribeToBooking, cancelBooking } from "@/lib/bookings";
import { handleError } from "@/lib/utils/error";
import { logBookingCancelled, logBookingCancellationStarted } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import CancelBookingSheet from "@/components/booking/CancelBookingSheet";
import BookingExpirationTimer from "@/components/booking/BookingExpirationTimer";
import PaymentMethodList from "@/components/booking/PaymentMethodList";
import PaymentProofUploader from "@/components/booking/PaymentProofUploader";
import PaymentProofPreview from "@/components/booking/PaymentProofPreview";
import RejectionBanner from "@/components/booking/RejectionBanner";
import WhatsAppNotifyButton from "@/components/booking/WhatsAppNotifyButton";
import type { Booking } from "@/lib/domain/booking";

const STATUS_STYLES: Record<string, string> = {
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

function formatDateFull(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

function formatShortSummary(booking: Booking, formatNice: string): string {
    const date = new Date(booking.date + "T12:00:00");
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${formatNice} · ${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${fmt12h(booking.startTime)}`;
}

function BookingDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const bookingId = params.id as string;

    const [booking, setBooking] = useState<Booking | null>(null);
    const [venue, setVenue] = useState<Venue | null>(null);
    const [venueFormats, setVenueFormats] = useState<VenueFormat[] | undefined>(undefined);
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

    // Carga el venue para sus paymentMethods + WhatsApp + formats.
    useEffect(() => {
        if (!booking?.venueId) return;
        let cancelled = false;
        getVenue(booking.venueId)
            .then((v) => {
                if (cancelled) return;
                setVenue(v);
                setVenueFormats(v?.formats);
            })
            .catch(() => { if (!cancelled) setVenueFormats(undefined); });
        return () => { cancelled = true; };
    }, [booking?.venueId]);

    const refundable = booking
        ? isBookingRefundable(booking.date, booking.startTime)
        : false;

    const isOwner = !!(booking && user && booking.bookedBy === user.uid);
    // No permitimos cancelar si el TTL ya venció (aunque el cron aún no haya marcado expired).
    const ttlExpiredAlready = booking?.status === "pending_payment"
        && isBookingExpired(booking.expiresAt ?? undefined);
    const canCancel = !!booking && !ttlExpiredAlready && [
        "pending_payment",
        "pending_approval",
        "deposit_confirmed",
        "confirmed",
    ].includes(booking.status);

    const formatNice = useMemo(
        () => booking ? (booking.formatLabel || formatLabel(booking.format, venueFormats)) : "",
        [booking, venueFormats],
    );

    const handleCancel = async (reason: string) => {
        if (!booking) return;
        setCancelling(true);
        try {
            const result = await cancelBooking(booking.id, reason);
            const slotMs = new Date(`${booking.date}T${booking.startTime}:00`).getTime();
            const hoursBeforeStart = Math.max(0, Math.round((slotMs - Date.now()) / (1000 * 60 * 60)));
            logBookingCancelled({
                venueId: booking.venueId,
                bookingId: booking.id,
                refunded: result.refunded,
                hoursBeforeStart,
                actorRole: "player",
                reasonLength: reason.length,
            });
            if (result.refunded) {
                toast.success(`Reserva cancelada · Depósito de ${formatCOP(result.refundAmount)} reembolsado`);
            } else {
                toast.success("Reserva cancelada");
            }
            setCancelConfirmOpen(false);
        } catch (err) {
            handleError(err, "Error al cancelar la reserva");
            throw err;
        } finally {
            setCancelling(false);
        }
    };

    const openCancelSheet = () => {
        if (!booking) return;
        logBookingCancellationStarted({
            venueId: booking.venueId,
            bookingId: booking.id,
            actorRole: "player",
        });
        setCancelConfirmOpen(true);
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

    // Si TTL ya venció pero el cron `expirePendingBookings` aún no procesó este booking,
    // tratamos la UI como si ya estuviera "expired". Evita la ventana de hasta 5min
    // donde el cliente vería el flujo de pago en una reserva que ya no se puede pagar.
    const isFunctionallyExpired = booking.status === "pending_payment"
        && isBookingExpired(booking.expiresAt ?? undefined);
    const effectiveStatus = isFunctionallyExpired ? "expired" : booking.status;

    const color = bookingStatusColor(effectiveStatus);
    const statusStyle = STATUS_STYLES[color] || STATUS_STYLES.gray;
    const attemptsUsed = booking.paymentProofHistory?.length ?? 0;
    const attemptsRemaining = Math.max(0, MAX_PAYMENT_PROOF_ATTEMPTS - attemptsUsed);

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
                <div className="px-4 -mt-4 relative z-10 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        {/* Status + format */}
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-bold text-slate-800">{formatNice}</h2>
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusStyle}`}>
                                {bookingStatusLabelForPlayer(effectiveStatus)}
                            </span>
                        </div>

                        {effectiveStatus === "pending_payment" && booking.expiresAt && (
                            <div className="mb-3">
                                <BookingExpirationTimer expiresAt={booking.expiresAt} />
                            </div>
                        )}

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
                            {booking.tierApplied && booking.tierApplied.discountCOP > 0 ? (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Subtotal</span>
                                        <span className="text-slate-600">{formatCOP(booking.totalPriceCOP + booking.tierApplied.discountCOP)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-emerald-600">Tarifa especial</span>
                                        <span className="text-emerald-600 font-medium">−{formatCOP(booking.tierApplied.discountCOP)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Precio cancha</span>
                                        <span className="font-semibold text-slate-700">{formatCOP(booking.totalPriceCOP)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Precio cancha</span>
                                    <span className="font-semibold text-slate-700">{formatCOP(booking.totalPriceCOP)}</span>
                                </div>
                            )}

                            {booking.depositCOP > 0 && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Depósito ({booking.depositPercent}%)</span>
                                        <span className="font-bold text-[#1f7a4f]">{formatCOP(booking.depositCOP)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Resto en sede</span>
                                        <span className="text-slate-700">{formatCOP(booking.remainingCOP)}</span>
                                    </div>
                                </>
                            )}

                            {booking.paymentMethod === "on_site" && booking.depositCOP === 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Pago en sede</span>
                                    <span className="text-slate-700">{formatCOP(booking.totalPriceCOP)}</span>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* ── PENDING PAYMENT ──────────────────────────────────────── */}
                    {effectiveStatus === "pending_payment" && isOwner && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
                            {/* Rejection banner si hubo intentos previos */}
                            {booking.lastRejectionReason && (
                                <RejectionBanner
                                    reason={booking.lastRejectionReason}
                                    rejectedAt={booking.lastRejectionAt ?? undefined}
                                    attemptsRemaining={attemptsRemaining}
                                />
                            )}

                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-1">
                                    Paga el abono de {formatCOP(booking.depositCOP)}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Usá cualquiera de estos métodos. Cuando termines, subí el comprobante.
                                </p>
                            </div>

                            <PaymentMethodList methods={venue?.paymentMethods ?? []} />

                            <div className="border-t border-slate-100 pt-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                    ¿Ya pagaste?
                                </p>
                                <PaymentProofUploader
                                    venueId={booking.venueId}
                                    bookingId={booking.id}
                                    previousAttempts={attemptsUsed}
                                />
                                {venue?.whatsappNotificationNumber && (
                                    <div className="mt-2">
                                        <WhatsAppNotifyButton
                                            venueId={booking.venueId}
                                            bookingId={booking.id}
                                            phoneNumber={venue.whatsappNotificationNumber}
                                            bookingSummary={formatShortSummary(booking, formatNice)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── PENDING APPROVAL ─────────────────────────────────────── */}
                    {booking.status === "pending_approval" && isOwner && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
                            <div className="flex items-start gap-2.5">
                                <CircleDashed className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0 animate-pulse" />
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">En revisión</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        El admin está verificando tu pago. Te avisaremos cuando se apruebe.
                                    </p>
                                </div>
                            </div>
                            <PaymentProofPreview
                                url={booking.paymentProofURL}
                                uploadedAt={booking.paymentProofUploadedAt}
                                statusLabel="Comprobante en revisión"
                            />
                        </div>
                    )}

                    {/* ── DEPOSIT CONFIRMED ────────────────────────────────────── */}
                    {booking.status === "deposit_confirmed" && (
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-2.5">
                            <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-blue-700">
                                    Abono confirmado
                                </p>
                                <p className="text-xs text-blue-600 mt-0.5">
                                    Falta confirmar tu asistencia con la sede. Te van a contactar antes del partido.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── CONFIRMED ────────────────────────────────────────────── */}
                    {booking.status === "confirmed" && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-2.5">
                            <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-emerald-700">¡Listo para jugar!</p>
                                <p className="text-xs text-emerald-600 mt-0.5">
                                    Tu reserva está confirmada. Disfrutá el partido.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── EXPIRED (incluye TTL agotado aunque el cron no haya corrido) ─ */}
                    {effectiveStatus === "expired" && (
                        <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-700">Reserva expirada</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {booking.lastRejectionReason
                                        ? `Se alcanzó el máximo de intentos: ${booking.lastRejectionReason}`
                                        : "No se completó el pago a tiempo. La cancha quedó libre."}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── CANCELLED ───────────────────────────────────────────── */}
                    {booking.status === "cancelled" && booking.cancellationReason && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-xs font-semibold text-red-700">
                                        {booking.cancelledByRole === "admin"
                                            ? "Cancelada por el administrador"
                                            : "Cancelaste esta reserva"}
                                    </p>
                                    <p className="text-sm text-red-800 mt-1">{booking.cancellationReason}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Contacto con la sede por WhatsApp — siempre visible (cambios de horario, dudas, etc.) */}
                    {venue?.whatsappNotificationNumber && isOwner && (
                        <WhatsAppNotifyButton
                            venueId={booking.venueId}
                            bookingId={booking.id}
                            phoneNumber={venue.whatsappNotificationNumber}
                            bookingSummary={formatShortSummary(booking, formatNice)}
                            label="Contactar a la sede por WhatsApp"
                            message={`Hola, te escribo por mi reserva: ${formatShortSummary(booking, formatNice)}`}
                        />
                    )}

                    {/* Cancel button */}
                    {canCancel && isOwner && (
                        <button
                            onClick={openCancelSheet}
                            className="w-full py-3 text-sm font-semibold text-red-500 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                        >
                            Cancelar reserva
                        </button>
                    )}
                </div>

                <CancelBookingSheet
                    open={cancelConfirmOpen}
                    onClose={() => !cancelling && setCancelConfirmOpen(false)}
                    onConfirm={handleCancel}
                    mode="player"
                    booking={{
                        venueName: booking.venueName,
                        date: booking.date,
                        startTime: booking.startTime,
                        endTime: booking.endTime,
                        depositCOP: booking.depositCOP,
                    }}
                    willRefund={refundable && booking.depositCOP > 0 && booking.paymentMethod === "wallet_deposit"}
                    attendanceConfirmed={booking.status === "confirmed"}
                />
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
