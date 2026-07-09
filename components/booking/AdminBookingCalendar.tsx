"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { type Court } from "@/lib/domain/venue";
import { getBookingsForDate, getBookingsInDateRange, SLOT_BLOCKING_BOOKING_STATUSES } from "@/lib/bookings";
import { subscribeToBlockedSlots, subscribeDailyPayments, getVenueCourts, getAllBlockedSlots } from "@/lib/venues";
import { expandBlockedSlotsForDate } from "@/lib/domain/blocked-slots";
import { handleError } from "@/lib/utils/error";
import AdminBookingCard from "./AdminBookingCard";
import AdminBlockCard from "./AdminBlockCard";
import type { Booking } from "@/lib/domain/booking";
import type { BlockedSlot, ManualReservationStatus, ManualReservationPayment, VenueFormat } from "@/lib/domain/venue";

interface AdminBookingCalendarProps {
    venueId: string;
    venueFormats?: VenueFormat[];
    /** Callback al tocar el tarro (cancelar) en una card de booking online. */
    onBookingCancel?: (booking: Booking) => void;
    /** Confirmar asistencia para reservas en deposit_confirmed (abre sheet). */
    onConfirmAttendance?: (booking: Booking) => void;
    /**
     * Registrar pago en sede para reservas player en played → paid, o editar un pago
     * ya registrado en una reserva paid. `existingPayment` es null cuando se crea,
     * o el pago si se edita.
     */
    onRegisterBookingPayment?: (booking: Booking, existingPayment: ManualReservationPayment | null) => void;
    /** Notifica al padre que se avanzó el estado (refresh local). */
    onBookingAdvanced?: () => void;
    onBlockClick?: (block: BlockedSlot, targetDate: string) => void;
    onAdvanceBlockStatus?: (block: BlockedSlot, targetDate: string) => void;
    onPickBlockStatus?: (block: BlockedSlot, newStatus: ManualReservationStatus, targetDate: string) => void;
    onCancelBlock?: (block: BlockedSlot, targetDate: string) => void;
    onEditBlock?: (block: BlockedSlot) => void;
    onRegisterPayment?: (
        block: BlockedSlot,
        targetDate: string,
        existingPayment: ManualReservationPayment | null,
    ) => void;
    onCreateManual?: (date: string) => void;
    /** Si el admin actual es super admin (habilita hard-delete de reservas manuales). */
    isSuper?: boolean;
    /** Fecha mínima navegable (YYYY-MM-DD). Días/meses anteriores quedan bloqueados. Sin valor ⇒ sin límite. */
    minDate?: string;
    /** Si true, oculta la tarifa en cards y el total de ingresos del día (la sede la oculta a admins de sede). */
    hidePrice?: boolean;
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function toISO(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
    return toISO(a) === toISO(b);
}

export default function AdminBookingCalendar({
    venueId,
    venueFormats,
    onBookingCancel,
    onConfirmAttendance,
    onRegisterBookingPayment,
    onBookingAdvanced,
    onBlockClick,
    onAdvanceBlockStatus,
    onPickBlockStatus,
    onCancelBlock,
    onEditBlock,
    onRegisterPayment,
    onCreateManual,
    isSuper = false,
    minDate,
    hidePrice = false,
}: AdminBookingCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selectedDate, setSelectedDate] = useState<string>(toISO(new Date()));
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [blocks, setBlocks] = useState<BlockedSlot[]>([]);
    const [payments, setPayments] = useState<ManualReservationPayment[]>([]);
    const [courts, setCourts] = useState<Court[]>([]);
    const [loading, setLoading] = useState(false);

    // Calendar indicators: dates with bookings or blocks
    const [monthBookingDates, setMonthBookingDates] = useState<Set<string>>(new Set());
    const [monthBlockDates, setMonthBlockDates] = useState<Set<string>>(new Set());
    const [monthBirthdayDates, setMonthBirthdayDates] = useState<Set<string>>(new Set());

    useEffect(() => {
        getVenueCourts(venueId).then(setCourts).catch(() => {});
    }, [venueId]);

    const loadDayBookings = useCallback(async (date: string) => {
        setLoading(true);
        try {
            const results = await getBookingsForDate(venueId, date);
            setBookings(results);
        } catch (err) {
            handleError(err, "Error al cargar reservas del día");
        } finally {
            setLoading(false);
        }
    }, [venueId]);

    useEffect(() => {
        loadDayBookings(selectedDate);
    }, [selectedDate, loadDayBookings]);

    useEffect(() => {
        const unsub = subscribeToBlockedSlots(venueId, selectedDate, setBlocks, true);
        return unsub;
    }, [venueId, selectedDate]);

    // Suscripción reactiva a los pagos del día seleccionado para mostrar el chip resumen
    // en cada AdminBlockCard pagada.
    useEffect(() => {
        const unsub = subscribeDailyPayments(venueId, selectedDate, setPayments);
        return unsub;
    }, [venueId, selectedDate]);

    // Lookup O(1) por reservationId (todos los pagos del map ya son del selectedDate).
    const paymentByReservationId = new Map<string, ManualReservationPayment>(
        payments.map((p) => [p.reservationId, p]),
    );

    // Track which dates in the month have bookings or blocks
    useEffect(() => {
        const loadMonthIndicators = async () => {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            const checkDates: string[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
                checkDates.push(toISO(new Date(year, month, d)));
            }
            const firstISO = checkDates[0];
            const lastISO = checkDates[checkDates.length - 1];

            const bookingDates = new Set<string>();
            const blockDates = new Set<string>();
            const birthdayDates = new Set<string>();

            // Una sola query de rango para todo el mes (antes: una por día → ~30 round-trips).
            const [monthBookings, allBlocks] = await Promise.all([
                getBookingsInDateRange(venueId, firstISO, lastISO).catch(() => [] as Booking[]),
                getAllBlockedSlots(venueId).catch(() => [] as BlockedSlot[]),
            ]);

            // Marcamos el día si tiene al menos una reserva en estado que bloquea slot
            // (mismo criterio que getBookingsForDate; el filtro de status va en cliente).
            for (const b of monthBookings) {
                if ((SLOT_BLOCKING_BOOKING_STATUSES as readonly string[]).includes(b.status)) {
                    bookingDates.add(b.date);
                }
            }

            for (const date of checkDates) {
                const expanded = expandBlockedSlotsForDate(allBlocks, date);
                if (expanded.length > 0) blockDates.add(date);
                if (expanded.some((b) => b.isBirthday && b.status !== "cancelled")) {
                    birthdayDates.add(date);
                }
            }

            setMonthBookingDates(bookingDates);
            setMonthBlockDates(blockDates);
            setMonthBirthdayDates(birthdayDates);
        };

        loadMonthIndicators().catch(() => {});
    }, [venueId, currentMonth]);

    // Calendar grid
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Mes mínimo navegable (primer día del mes que contiene minDate).
    const minMonthStart = minDate ? new Date(Number(minDate.slice(0, 4)), Number(minDate.slice(5, 7)) - 1, 1) : null;
    const canGoPrev = !minMonthStart || new Date(year, month - 1, 1).getTime() >= minMonthStart.getTime();

    const prevMonth = () => { if (canGoPrev) setCurrentMonth(new Date(year, month - 1, 1)); };
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(null);
    for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

    const activeBookings = bookings.filter((b) => b.status !== "cancelled" && b.status !== "expired");
    const totalRevenue = activeBookings.reduce((sum, b) => sum + b.totalPriceCOP, 0);

    type Row =
        | { kind: "booking"; startTime: string; booking: Booking }
        | { kind: "block"; startTime: string; block: BlockedSlot };
    const rows: Row[] = [
        ...bookings.map<Row>((b) => ({ kind: "booking", startTime: b.startTime, booking: b })),
        ...blocks.map<Row>((b) => ({ kind: "block", startTime: b.startTime, block: b })),
    ].sort((a, b) => {
        // Canceladas al final
        const aCancelled = a.kind === "block" && a.block.status === "cancelled" ? 1 : 0;
        const bCancelled = b.kind === "block" && b.block.status === "cancelled" ? 1 : 0;
        if (aCancelled !== bCancelled) return aCancelled - bCancelled;
        return a.startTime.localeCompare(b.startTime);
    });

    return (
        <div className="space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={prevMonth}
                    disabled={!canGoPrev}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-sm font-bold text-slate-700">
                    {MONTH_NAMES[month]} {year}
                </h3>
                <button
                    onClick={nextMonth}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((dn) => (
                    <div key={dn} className="text-center text-[10px] font-semibold text-slate-400 py-1">
                        {dn}
                    </div>
                ))}

                {/* Calendar cells */}
                {calendarDays.map((day, idx) => {
                    if (day === null) {
                        return <div key={`empty-${idx}`} />;
                    }

                    const dateObj = new Date(year, month, day);
                    const iso = toISO(dateObj);
                    const isSelected = iso === selectedDate;
                    const isToday = isSameDay(dateObj, today);
                    const isBeforeMin = minDate ? iso < minDate : false;
                    const hasBookings = monthBookingDates.has(iso);
                    const hasBlocks = monthBlockDates.has(iso);
                    const hasBirthday = monthBirthdayDates.has(iso);

                    return (
                        <button
                            key={iso}
                            onClick={() => setSelectedDate(iso)}
                            disabled={isBeforeMin}
                            className={`
                                relative flex flex-col items-center justify-center
                                py-2 rounded-lg text-sm transition-colors
                                ${isBeforeMin
                                    ? "text-slate-300 cursor-not-allowed"
                                    : isSelected
                                        ? "bg-[#1f7a4f] text-white font-bold"
                                        : isToday
                                            ? "bg-[#1f7a4f]/10 text-[#1f7a4f] font-semibold"
                                            : "text-slate-600 hover:bg-slate-100"
                                }
                            `}
                        >
                            {day}
                            {(hasBookings || hasBlocks || hasBirthday) && (
                                <span className="flex gap-0.5 mt-0.5">
                                    {hasBookings && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-[#1f7a4f]"}`} />
                                    )}
                                    {hasBlocks && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-slate-500"}`} />
                                    )}
                                    {hasBirthday && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-pink-400"}`} />
                                    )}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Selected date summary */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-700">
                        {formatDateLabel(selectedDate)}
                    </h4>
                    <span className="text-xs text-slate-400">
                        {activeBookings.length} reserva{activeBookings.length !== 1 ? "s" : ""}
                        {blocks.length > 0 && ` · ${blocks.length} manual${blocks.length !== 1 ? "es" : ""}`}
                        {!hidePrice && totalRevenue > 0 && ` · ${formatCOP(totalRevenue)}`}
                    </span>
                </div>

                {loading ? (
                    <div className="space-y-2">
                        {[1, 2].map((i) => (
                            <div key={i} className="h-14 bg-slate-200 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Sin reservas este día</p>
                ) : (
                    <div className="space-y-2">
                        {rows.map((row) => {
                            if (row.kind === "booking") {
                                return (
                                    <AdminBookingCard
                                        key={`b-${row.booking.id}`}
                                        booking={row.booking}
                                        venueFormats={venueFormats}
                                        existingPayment={paymentByReservationId.get(row.booking.id) ?? null}
                                        onCancel={onBookingCancel}
                                        onConfirmAttendance={onConfirmAttendance}
                                        onRegisterPayment={onRegisterBookingPayment}
                                        onAdvanced={() => {
                                            onBookingAdvanced?.();
                                            loadDayBookings(selectedDate);
                                        }}
                                        hidePrice={hidePrice}
                                    />
                                );
                            }
                            return (
                                <AdminBlockCard
                                    key={`bl-${row.block.id}`}
                                    block={row.block}
                                    courts={courts}
                                    targetDate={selectedDate}
                                    isSuper={isSuper}
                                    onClick={onBlockClick}
                                    onAdvanceStatus={onAdvanceBlockStatus}
                                    onPickStatus={onPickBlockStatus}
                                    onEdit={onEditBlock}
                                    onCancelBlock={onCancelBlock}
                                    existingPayment={paymentByReservationId.get(row.block.id) ?? null}
                                    onRegisterPayment={onRegisterPayment}
                                    hidePrice={hidePrice}
                                />
                            );
                        })}
                    </div>
                )}

                {onCreateManual && (
                    <button
                        onClick={() => onCreateManual(selectedDate)}
                        className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1f7a4f] hover:bg-[#16603c] text-white font-bold text-sm transition-all active:scale-[0.99]"
                    >
                        <CalendarPlus className="w-4 h-4" />
                        Crear reserva manual
                    </button>
                )}
            </div>
        </div>
    );
}

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}
