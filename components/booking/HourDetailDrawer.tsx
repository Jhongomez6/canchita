"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarPlus, Clock4 } from "lucide-react";
import AdminBookingCard from "./AdminBookingCard";
import AdminBlockCard from "./AdminBlockCard";
import type { Booking } from "@/lib/domain/booking";
import { SLOT_BLOCKING_BOOKING_STATUSES } from "@/lib/bookings";
import { getBlockedSlotStatus } from "@/lib/domain/venue";
import type { BlockedSlot, Court, ManualReservationStatus, ManualReservationPayment, VenueFormat } from "@/lib/domain/venue";

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

interface HourDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    date: string;
    startTime: string;
    endTime: string;
    bookings: Booking[];
    blocks: BlockedSlot[];
    courts: Court[];
    venueFormats?: VenueFormat[];
    /** Canchas que pueden usarse para el formato seleccionado. Habilitan el botón "Crear reserva manual". */
    relevantCourtIds?: string[];
    /** Subconjunto de relevantCourtIds que ya está ocupado por bookings o blocks. */
    unavailableRelevantCourtIds?: string[];
    /** Callback al tocar el tarro de cancelar en una card de booking online. */
    onBookingCancel?: (booking: Booking) => void;
    onConfirmAttendance?: (booking: Booking) => void;
    onRegisterBookingPayment?: (booking: Booking, existingPayment: ManualReservationPayment | null) => void;
    onBookingAdvanced?: () => void;
    /** CTA "Revisar" en solicitudes pending_approval → abrir vista de aprobación. */
    onReviewPending?: (booking: Booking) => void;
    onBlockClick: (block: BlockedSlot, targetDate: string) => void;
    onAdvanceBlockStatus: (block: BlockedSlot, targetDate: string) => void;
    onPickBlockStatus: (block: BlockedSlot, newStatus: ManualReservationStatus, targetDate: string) => void;
    onCancelBlock: (block: BlockedSlot, targetDate: string) => void;
    onEditBlock: (block: BlockedSlot) => void;
    onCreateManual: () => void;
    /** Pagos registrados para `date`. Se usan para mostrar el chip resumen en cards pagas. */
    payments?: ManualReservationPayment[];
    onRegisterPayment?: (
        block: BlockedSlot,
        targetDate: string,
        existingPayment: ManualReservationPayment | null,
    ) => void;
    /** Si el admin actual es super admin (habilita hard-delete de reservas manuales). */
    isSuper?: boolean;
    /** Si true, oculta la tarifa en las cards de reserva (la sede la oculta a admins de sede). */
    hidePrice?: boolean;
}

export default function HourDetailDrawer({
    open,
    onClose,
    date,
    startTime,
    endTime,
    bookings,
    blocks,
    courts,
    venueFormats,
    onBookingCancel,
    onConfirmAttendance,
    onRegisterBookingPayment,
    onBookingAdvanced,
    onReviewPending,
    onBlockClick,
    onAdvanceBlockStatus,
    onPickBlockStatus,
    onCancelBlock,
    onEditBlock,
    onCreateManual,
    payments,
    onRegisterPayment,
    relevantCourtIds,
    unavailableRelevantCourtIds,
    isSuper = false,
    hidePrice = false,
}: HourDetailDrawerProps) {
    // Map<reservationId, payment> para el `date` actual del drawer.
    // Lookup O(1) cuando renderizamos cada card.
    const paymentByReservationId = new Map<string, ManualReservationPayment>(
        (payments ?? []).map((p) => [p.reservationId, p]),
    );
    const isEmpty = bookings.length === 0 && blocks.length === 0;

    // Canceladas al final (usa estado efectivo por instancia para recurrentes)
    const sortedBlocks = [...blocks].sort((a, b) => {
        const aCancelled = getBlockedSlotStatus(a, date) === "cancelled" ? 1 : 0;
        const bCancelled = getBlockedSlotStatus(b, date) === "cancelled" ? 1 : 0;
        return aCancelled - bCancelled;
    });

    // Si recibimos relevantCourtIds, usamos esa lista (canchas del deporte actual).
    // Si no, fallback al cálculo legacy sobre todas las canchas activas.
    const noRelevantCourts = relevantCourtIds !== undefined && relevantCourtIds.length === 0;
    const allRelevantOccupied =
        relevantCourtIds !== undefined && unavailableRelevantCourtIds !== undefined
            ? relevantCourtIds.length > 0 && unavailableRelevantCourtIds.length >= relevantCourtIds.length
            : (() => {
                // Solo cuentan reservas en estados que bloquean slot (excluye cancelled,
                // no_show, paid, expired). Mismo criterio que AdminSlotPicker.
                const occupiedCourtIds = new Set([
                    ...bookings
                        .filter((b) => (SLOT_BLOCKING_BOOKING_STATUSES as readonly string[]).includes(b.status))
                        .flatMap((b) => b.courtIds),
                    ...blocks.filter((b) => getBlockedSlotStatus(b, date) !== "cancelled").flatMap((b) => b.courtIds),
                ]);
                const activeCourts = courts.filter((c) => c.active);
                return activeCourts.length > 0 && activeCourts.every((c) => occupiedCourtIds.has(c.id));
            })();
    const allCourtsOccupied = noRelevantCourts || allRelevantOccupied;

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-40"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[90vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">
                                    {fmt12h(startTime)} – {fmt12h(endTime)}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5 capitalize">
                                    {formatDateLabel(date)}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        {/* Content + CTA en un solo scroll, con padding inferior para clear de la BottomNav móvil */}
                        <div className="overflow-y-auto flex-1 px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
                            {isEmpty ? (
                                <div className="text-center py-10">
                                    <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                                        <Clock4 className="w-7 h-7 text-slate-400" />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-700 mb-1">
                                        Esta hora está libre
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Toca crear para registrar una reserva manual
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {bookings.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                Reservas online ({bookings.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {bookings.map((b) => (
                                                    <AdminBookingCard
                                                        key={b.id}
                                                        booking={b}
                                                        venueFormats={venueFormats}
                                                        existingPayment={paymentByReservationId.get(b.id) ?? null}
                                                        onCancel={onBookingCancel}
                                                        onConfirmAttendance={onConfirmAttendance}
                                                        onRegisterPayment={onRegisterBookingPayment}
                                                        onAdvanced={onBookingAdvanced}
                                                        onReviewPending={onReviewPending}
                                                        hidePrice={hidePrice}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {blocks.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                Reservas manuales ({blocks.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {sortedBlocks.map((b) => (
                                                    <AdminBlockCard
                                                        key={b.id}
                                                        block={b}
                                                        courts={courts}
                                                        targetDate={date}
                                                        isSuper={isSuper}
                                                        onClick={onBlockClick}
                                                        onAdvanceStatus={onAdvanceBlockStatus}
                                                        onPickStatus={onPickBlockStatus}
                                                        onEdit={onEditBlock}
                                                        onCancelBlock={onCancelBlock}
                                                        existingPayment={paymentByReservationId.get(b.id) ?? null}
                                                        onRegisterPayment={onRegisterPayment}
                                                        hidePrice={hidePrice}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={onCreateManual}
                                disabled={allCourtsOccupied}
                                title={
                                    noRelevantCourts
                                        ? "No hay canchas configuradas para este deporte"
                                        : allCourtsOccupied
                                            ? "Todas las canchas de este deporte están ocupadas en este horario"
                                            : undefined
                                }
                                className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-sm transition-all disabled:cursor-not-allowed bg-[#1f7a4f] hover:bg-[#16603c] shadow-lg shadow-emerald-900/20 active:scale-[0.99] disabled:bg-slate-300 disabled:shadow-none disabled:active:scale-100"
                            >
                                <CalendarPlus className="w-4 h-4" />
                                {noRelevantCourts
                                    ? "Sin canchas para este deporte"
                                    : allCourtsOccupied
                                        ? "Sin canchas disponibles"
                                        : "Crear reserva manual"}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
