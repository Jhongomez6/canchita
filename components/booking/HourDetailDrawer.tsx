"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarPlus, Clock4 } from "lucide-react";
import AdminBookingCard from "./AdminBookingCard";
import AdminBlockCard from "./AdminBlockCard";
import type { Booking } from "@/lib/domain/booking";
import type { BlockedSlot, Court, ManualReservationStatus } from "@/lib/domain/venue";

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
    onBookingClick: (booking: Booking) => void;
    onBlockClick: (block: BlockedSlot, targetDate: string) => void;
    onAdvanceBlockStatus: (block: BlockedSlot) => void;
    onPickBlockStatus: (block: BlockedSlot, newStatus: ManualReservationStatus) => void;
    onCancelBlock: (block: BlockedSlot, targetDate: string) => void;
    onCreateManual: () => void;
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
    onBookingClick,
    onBlockClick,
    onAdvanceBlockStatus,
    onPickBlockStatus,
    onCancelBlock,
    onCreateManual,
}: HourDetailDrawerProps) {
    const isEmpty = bookings.length === 0 && blocks.length === 0;

    // Canceladas al final
    const sortedBlocks = [...blocks].sort((a, b) => {
        const aCancelled = a.status === "cancelled" ? 1 : 0;
        const bCancelled = b.status === "cancelled" ? 1 : 0;
        return aCancelled - bCancelled;
    });

    const occupiedCourtIds = new Set([
        ...bookings.flatMap((b) => b.courtIds),
        ...blocks.filter((b) => b.status !== "cancelled").flatMap((b) => b.courtIds),
    ]);
    const activeCourts = courts.filter((c) => c.active);
    const allCourtsOccupied = activeCourts.length > 0 && activeCourts.every((c) => occupiedCourtIds.has(c.id));

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
                                                        onClick={onBookingClick}
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
                                                        onClick={onBlockClick}
                                                        onAdvanceStatus={onAdvanceBlockStatus}
                                                        onPickStatus={onPickBlockStatus}
                                                        onCancelBlock={onCancelBlock}
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
                                title={allCourtsOccupied ? "Todas las canchas están ocupadas en este horario" : undefined}
                                className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-sm transition-all disabled:cursor-not-allowed bg-[#1f7a4f] hover:bg-[#16603c] shadow-lg shadow-emerald-900/20 active:scale-[0.99] disabled:bg-slate-300 disabled:shadow-none disabled:active:scale-100"
                            >
                                <CalendarPlus className="w-4 h-4" />
                                {allCourtsOccupied ? "Sin canchas disponibles" : "Crear reserva manual"}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
