"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Users, ChevronRight, Banknote, Trash2, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, formatCourtList } from "@/lib/domain/venue";
import type { VenueFormat, ManualReservationPayment } from "@/lib/domain/venue";
import {
    bookingStatusLabel,
    bookingStatusColor,
    getNextBookingStatus,
    nextBookingStatusActionLabel,
    isBookingExpired,
    getValidPickerTransitions,
} from "@/lib/domain/booking";
import type { Booking, BookingStatus } from "@/lib/domain/booking";
import { advanceBookingStatus, type AdvanceBookingTargetStatus } from "@/lib/bookings";
import { logBookingStatusAdvanced } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import BookingOriginBadge from "./BookingOriginBadge";
import DepositSummary from "./DepositSummary";

/**
 * Orden visual del picker. Las transiciones permitidas REALES por estado origen
 * vienen de `getValidPickerTransitions(booking.status)` — esto solo controla el
 * orden en que se renderizan los items disponibles.
 */
const STATUS_PICKER_ORDER: BookingStatus[] = ["deposit_confirmed", "confirmed", "played", "paid", "free", "no_show"];

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
    /** Abre el sheet de cancelación de la reserva. Mismo patrón que la card manual: icono de tarro. */
    onCancel?: (booking: Booking) => void;
    /** Abre el sheet de confirmar asistencia para `deposit_confirmed`. */
    onConfirmAttendance?: (booking: Booking) => void;
    /**
     * Abre el sheet de registrar pago para `played` (transición a `paid`) o
     * para editar un pago ya registrado cuando se tap el chip en estado `paid`.
     * El segundo parámetro es el pago existente (null si va a crear nuevo).
     */
    onRegisterPayment?: (booking: Booking, existingPayment: ManualReservationPayment | null) => void;
    /** Tras advance exitoso, notifica al padre para refrescar. */
    onAdvanced?: () => void;
    /** Pago registrado para esta reserva (cuando ya pasó por RegisterPaymentSheet). */
    existingPayment?: ManualReservationPayment | null;
    /** Si true, oculta la tarifa (total + depósito/resto). Conserva chips de pago registrado. */
    hidePrice?: boolean;
    /** CTA "Revisar" en solicitudes pending_approval. Si se omite, navega a ?tab=pending. */
    onReviewPending?: (booking: Booking) => void;
}

export default function AdminBookingCard({
    booking,
    venueFormats,
    onCancel,
    onConfirmAttendance,
    onRegisterPayment,
    onAdvanced,
    existingPayment,
    hidePrice = false,
    onReviewPending,
}: AdminBookingCardProps) {
    const router = useRouter();
    const [advancing, setAdvancing] = useState(false);
    const [pickerChanging, setPickerChanging] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement | null>(null);

    // Cerrar picker al hacer click fuera
    useEffect(() => {
        if (!pickerOpen) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [pickerOpen]);

    // Si el TTL ya venció en un pending_payment, lo tratamos como ya-expirado para UI:
    // no permitimos cancelar (el cron lo va a marcar expired en máximo 5min). El
    // badge muestra "Expirada", el card va griseado/tachado, pero NO se oculta —
    // queda visible para tracking del admin en la vista por hora.
    const ttlElapsed = booking.status === "pending_payment"
        && isBookingExpired(booking.expiresAt ?? undefined);
    const effectiveStatus = ttlElapsed ? "expired" : booking.status;

    const color = bookingStatusColor(effectiveStatus);
    const dotClass = STATUS_DOT[color] || STATUS_DOT.gray;
    const badgeClass = STATUS_BADGE[color] || STATUS_BADGE.gray;

    // Estados donde la cancelación tiene sentido (pre-terminales).
    const isCancellable = !ttlElapsed && [
        "pending_payment",
        "pending_approval",
        "deposit_confirmed",
        "confirmed",
        "played",
    ].includes(booking.status);

    // Transiciones válidas para el estado actual (matriz en domain/booking.ts).
    // Aplica solo a bookings online — manuales tienen su propia lógica.
    const validTransitions = getValidPickerTransitions(booking.status);
    // Picker disponible solo si hay al menos una transición válida desde el estado actual.
    const pickerAvailable = validTransitions.length > 0;
    // Items a renderizar en el picker: solo los válidos, en el orden del array maestro.
    const pickerItems = STATUS_PICKER_ORDER.filter((s) => validTransitions.includes(s));

    const handlePickStatus = async (nextStatus: BookingStatus) => {
        if (nextStatus === booking.status) {
            setPickerOpen(false);
            return;
        }
        // Si va a "paid": delegamos al sheet de registrar pago (igual que el botón inline)
        if (nextStatus === "paid" && onRegisterPayment) {
            setPickerOpen(false);
            onRegisterPayment(booking, existingPayment ?? null);
            return;
        }
        // Si va a "confirmed" desde "deposit_confirmed": delegamos al sheet de confirmar asistencia
        if (nextStatus === "confirmed" && booking.status === "deposit_confirmed" && onConfirmAttendance) {
            setPickerOpen(false);
            onConfirmAttendance(booking);
            return;
        }

        setPickerChanging(true);
        try {
            await advanceBookingStatus(booking.id, nextStatus as AdvanceBookingTargetStatus);
            await logBookingStatusAdvanced({
                venueId: booking.venueId,
                bookingId: booking.id,
                fromStatus: booking.status,
                toStatus: nextStatus,
            });
            toast.success(`Reserva → ${bookingStatusLabel(nextStatus)}`);
            onAdvanced?.();
        } catch (err) {
            handleError(err, "No pudimos cambiar el estado");
        } finally {
            setPickerChanging(false);
            setPickerOpen(false);
        }
    };

    const handleAdvance = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = getNextBookingStatus(booking.status);
        if (!next) return;

        // Para "paid": delegar al sheet de registrar pago (no avanzar directo).
        if (next === "paid" && onRegisterPayment) {
            onRegisterPayment(booking, null);
            return;
        }

        setAdvancing(true);
        try {
            // `getNextBookingStatus` solo retorna "played" o "paid" en el ciclo lineal
            // post-confirmed, ambos válidos para advanceBookingStatus.
            await advanceBookingStatus(booking.id, next as AdvanceBookingTargetStatus);
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
    // Tratamiento visual "muerto" (gris + tachado): cancelled, expired, no_show.
    // Aplica tanto para los status reales como para el TTL-vencido (effectiveStatus).
    const dimmed = effectiveStatus === "cancelled"
        || effectiveStatus === "expired"
        || effectiveStatus === "no_show";

    return (
        <div className={`w-full text-left rounded-xl border p-3 ${
            dimmed
                ? "bg-slate-50/40 border-slate-100 opacity-60"
                : "bg-white border-slate-200"
        }`}>
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                    <span className={`text-sm font-semibold ${dimmed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                        {fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}
                    </span>
                    <BookingOriginBadge origin="player" />
                </div>
                <div className="relative" ref={pickerRef}>
                    <button
                        type="button"
                        disabled={!pickerAvailable || pickerChanging}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (pickerAvailable) setPickerOpen((o) => !o);
                        }}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${badgeClass} ${
                            pickerAvailable ? "hover:brightness-95 cursor-pointer" : "cursor-default"
                        } ${pickerChanging ? "opacity-60" : ""}`}
                    >
                        {bookingStatusLabel(effectiveStatus)}
                    </button>

                    <AnimatePresence>
                        {pickerOpen && pickerAvailable && (
                            <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-full mt-1 z-30 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                            >
                                {pickerItems.map((s) => {
                                    const dotForOption = STATUS_DOT[bookingStatusColor(s)] || STATUS_DOT.gray;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handlePickStatus(s);
                                            }}
                                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 text-slate-700 transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotForOption}`} />
                                                {bookingStatusLabel(s)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                <Users className="w-3 h-3 flex-shrink-0" />
                <span className={`truncate ${dimmed ? "line-through" : ""}`}>{booking.bookedByName}</span>
                <span className="text-slate-300">·</span>
                <span className={`truncate ${dimmed ? "line-through" : ""} ${booking.bookedByPhone ? "text-slate-500" : "italic text-slate-400"}`}>
                    {booking.bookedByPhone || "Sin celular"}
                </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
                {booking.formatLabel || formatLabel(booking.format, venueFormats)}
                {booking.courtNames.length > 0 && (
                    <span className="text-slate-400"> ({formatCourtList(booking.courtNames)})</span>
                )}
            </p>

            {/* Solicitud pendiente de aprobación: warning + CTA a la vista de aprobación. */}
            {booking.status === "pending_approval" && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        Pendiente de aprobación
                    </span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onReviewPending) onReviewPending(booking);
                            else router.push(`/venues/admin/${booking.venueId}?tab=pending`);
                        }}
                        className="flex items-center gap-0.5 text-[11px] font-bold text-amber-800 hover:text-amber-900 whitespace-nowrap flex-shrink-0"
                    >
                        Revisar <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Precio — mismo patrón que reservas manuales (AdminBlockCard).
                Oculto si la sede oculta la tarifa a los administradores de sede. */}
            {!hidePrice && (
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/80">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Precio
                    </span>
                    <span className="text-sm font-bold text-[#1f7a4f]">
                        {formatCOP(booking.totalPriceCOP)}
                    </span>
                </div>
            )}

            {/* Deposit summary (compacto) cuando hay abono y la reserva está en estado post-aprobación */}
            {!hidePrice && (["deposit_confirmed", "confirmed", "played", "paid"].includes(booking.status) && booking.depositCOP > 0) && (
                <div className="mt-2">
                    <DepositSummary
                        depositCOP={booking.depositCOP}
                        remainingCOP={booking.remainingCOP}
                        variant="compact"
                    />
                </div>
            )}

            {/* Motivo de cancelación cuando aplica — mismo patrón que AdminBlockCard. */}
            {effectiveStatus === "cancelled" && booking.cancellationReason && (
                <p className="text-[11px] text-slate-400 italic mt-1">
                    {booking.cancelledByRole === "admin" ? "Cancelada por admin" : "Cancelada por el cliente"}:{" "}
                    {booking.cancellationReason}
                </p>
            )}
            {/* Mensaje informativo para reservas que expiraron por TTL (cron aún no procesó
                o ya marcó como expired). */}
            {effectiveStatus === "expired" && (
                <p className="text-[11px] text-slate-400 italic mt-1">
                    El cliente no completó el pago en el tiempo configurado.
                </p>
            )}

            {/* Chip de pago registrado — visible cuando status=paid y existe el doc de pago.
                Mismo patrón que AdminBlockCard: muestra desglose efectivo/transferencia,
                tap para editar. */}
            {booking.status === "paid" && existingPayment && onRegisterPayment && (
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onRegisterPayment(booking, existingPayment)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors text-xs font-semibold text-emerald-800"
                        aria-label="Editar pago"
                    >
                        {existingPayment.cashCOP > 0 && (
                            <span className="flex items-center gap-0.5">
                                <Banknote className="w-3 h-3" />
                                {formatCOP(existingPayment.cashCOP)}
                            </span>
                        )}
                        {existingPayment.cashCOP > 0 && existingPayment.transferCOP > 0 && (
                            <span className="text-emerald-400">+</span>
                        )}
                        {existingPayment.transferCOP > 0 && (
                            <span className="flex items-center gap-0.5">
                                <Landmark className="w-3 h-3" />
                                {formatCOP(existingPayment.transferCOP)}
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* Acciones inline: avance/confirmar a la izquierda + cancelar (tarro) a la derecha.
                Mismo estilo visual que AdminBlockCard (bg verde tint claro + text verde marca).
                No se muestran si la reserva está en estado terminal (cancelled/expired/no_show),
                o si el chip de pago ya cubre la posición (paid con existingPayment). */}
            {!dimmed
                && !(booking.status === "paid" && existingPayment)
                && (showAdvanceBtn || showConfirmAttendanceBtn || (isCancellable && onCancel)) && (
                <div className="mt-2 flex items-center gap-2">
                    {showConfirmAttendanceBtn && (
                        <button
                            type="button"
                            onClick={() => onConfirmAttendance?.(booking)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#1f7a4f]/10 text-[#1f7a4f] text-xs font-semibold hover:bg-[#1f7a4f]/15 transition-colors"
                        >
                            Confirmar asistencia
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                    {!showConfirmAttendanceBtn && showAdvanceBtn && (
                        <button
                            type="button"
                            onClick={handleAdvance}
                            disabled={advancing}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#1f7a4f]/10 text-[#1f7a4f] text-xs font-semibold hover:bg-[#1f7a4f]/15 transition-colors disabled:opacity-60"
                        >
                            {nextLabel}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                    {/* Si no hay botón de acción, el tarro debe ser full-width-ish, lo dejamos a la derecha y
                        usamos un spacer flex-1 invisible. */}
                    {!showConfirmAttendanceBtn && !showAdvanceBtn && <div className="flex-1" />}
                    {isCancellable && onCancel && (
                        <button
                            type="button"
                            onClick={() => onCancel(booking)}
                            aria-label="Cancelar reserva"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
