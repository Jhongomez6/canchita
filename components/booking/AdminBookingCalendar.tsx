"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Users, CalendarPlus, Repeat } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, formatCourtList, tierLabelFromCount, type Court } from "@/lib/domain/venue";
import { bookingStatusLabel, bookingStatusColor } from "@/lib/domain/booking";
import { labelForRecurrence } from "@/lib/domain/blocked-slots";
import { getBookingsForDate } from "@/lib/bookings";
import { getBlockedSlots, getVenueCourts, getAllBlockedSlots } from "@/lib/venues";
import { expandBlockedSlotsForDate } from "@/lib/domain/blocked-slots";
import { handleError } from "@/lib/utils/error";
import type { Booking } from "@/lib/domain/booking";
import type { BlockedSlot } from "@/lib/domain/venue";

interface AdminBookingCalendarProps {
    venueId: string;
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_DOT: Record<string, string> = {
    yellow: "bg-amber-400",
    green: "bg-emerald-500",
    blue: "bg-blue-500",
    red: "bg-red-400",
    gray: "bg-slate-300",
    orange: "bg-orange-400",
};

const STATUS_BADGE: Record<string, string> = {
    yellow: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    gray: "bg-slate-100 text-slate-500",
    orange: "bg-orange-50 text-orange-700",
};

function toISO(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
    return toISO(a) === toISO(b);
}

export default function AdminBookingCalendar({ venueId }: AdminBookingCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selectedDate, setSelectedDate] = useState<string>(toISO(new Date()));
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [blocks, setBlocks] = useState<BlockedSlot[]>([]);
    const [courts, setCourts] = useState<Court[]>([]);
    const [loading, setLoading] = useState(false);

    // Calendar indicators: dates with bookings or blocks
    const [monthBookingDates, setMonthBookingDates] = useState<Set<string>>(new Set());
    const [monthBlockDates, setMonthBlockDates] = useState<Set<string>>(new Set());

    useEffect(() => {
        getVenueCourts(venueId).then(setCourts).catch(() => {});
    }, [venueId]);

    const loadDayBookings = useCallback(async (date: string) => {
        setLoading(true);
        try {
            const [results, blockedResults] = await Promise.all([
                getBookingsForDate(venueId, date),
                getBlockedSlots(venueId, date, true),
            ]);
            setBookings(results);
            setBlocks(blockedResults);
        } catch (err) {
            handleError(err, "Error al cargar reservas del día");
        } finally {
            setLoading(false);
        }
    }, [venueId]);

    useEffect(() => {
        loadDayBookings(selectedDate);
    }, [selectedDate, loadDayBookings]);

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

            const bookingDates = new Set<string>();
            const blockDates = new Set<string>();

            const [, allBlocks] = await Promise.all([
                Promise.allSettled(
                    checkDates.map(async (date) => {
                        const b = await getBookingsForDate(venueId, date);
                        if (b.length > 0) bookingDates.add(date);
                    }),
                ),
                getAllBlockedSlots(venueId).catch(() => [] as BlockedSlot[]),
            ]);

            for (const date of checkDates) {
                const expanded = expandBlockedSlotsForDate(allBlocks, date);
                if (expanded.length > 0) blockDates.add(date);
            }

            setMonthBookingDates(bookingDates);
            setMonthBlockDates(blockDates);
        };

        loadMonthIndicators().catch(() => {});
    }, [venueId, currentMonth]);

    // Calendar grid
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(null);
    for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

    const activeBookings = bookings.filter((b) => b.status !== "cancelled" && b.status !== "expired");
    const totalRevenue = activeBookings.reduce((sum, b) => sum + b.totalPriceCOP, 0);

    const courtNameById = new Map(courts.map((c) => [c.id, c.name]));
    type Row =
        | { kind: "booking"; startTime: string; booking: Booking }
        | { kind: "block"; startTime: string; block: BlockedSlot };
    const rows: Row[] = [
        ...bookings.map<Row>((b) => ({ kind: "booking", startTime: b.startTime, booking: b })),
        ...blocks.map<Row>((b) => ({ kind: "block", startTime: b.startTime, block: b })),
    ].sort((a, b) => a.startTime.localeCompare(b.startTime));

    return (
        <div className="space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={prevMonth}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
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
                    const hasBookings = monthBookingDates.has(iso);
                    const hasBlocks = monthBlockDates.has(iso);

                    return (
                        <button
                            key={iso}
                            onClick={() => setSelectedDate(iso)}
                            className={`
                                relative flex flex-col items-center justify-center
                                py-2 rounded-lg text-sm transition-colors
                                ${isSelected
                                    ? "bg-[#1f7a4f] text-white font-bold"
                                    : isToday
                                        ? "bg-[#1f7a4f]/10 text-[#1f7a4f] font-semibold"
                                        : "text-slate-600 hover:bg-slate-100"
                                }
                            `}
                        >
                            {day}
                            {(hasBookings || hasBlocks) && (
                                <span className="flex gap-0.5 mt-0.5">
                                    {hasBookings && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-[#1f7a4f]"}`} />
                                    )}
                                    {hasBlocks && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-indigo-500"}`} />
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
                        {totalRevenue > 0 && ` · ${formatCOP(totalRevenue)}`}
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
                                const booking = row.booking;
                                const color = bookingStatusColor(booking.status);
                                const dotClass = STATUS_DOT[color] || STATUS_DOT.gray;
                                const badgeClass = STATUS_BADGE[color] || STATUS_BADGE.gray;

                                return (
                                    <div
                                        key={`b-${booking.id}`}
                                        className="bg-white rounded-xl border border-slate-200 p-3"
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                                                <span className="text-sm font-semibold text-slate-700">
                                                    {booking.startTime} - {booking.endTime}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                                                {bookingStatusLabel(booking.status)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Users className="w-3 h-3" />
                                                <span>{booking.bookedByName}</span>
                                                <span className="text-slate-300">·</span>
                                                <span>{formatLabel(booking.format)}</span>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600">
                                                {formatCOP(booking.totalPriceCOP)}
                                            </span>
                                        </div>
                                        {booking.courtNames.length > 0 && (
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {formatCourtList(booking.courtNames)}
                                            </p>
                                        )}
                                    </div>
                                );
                            }

                            const block = row.block;
                            const blockCourtNames = block.courtIds.map((id) => courtNameById.get(id) || id);
                            const blockTier = tierLabelFromCount(block.courtIds.length);
                            const blockCourtList = formatCourtList(blockCourtNames);
                            return (
                                <div
                                    key={`bl-${block.id}`}
                                    className="bg-indigo-50/60 rounded-xl border border-indigo-100 p-3"
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <CalendarPlus className="w-3.5 h-3.5 text-indigo-500" />
                                            <span className="text-sm font-semibold text-indigo-800">
                                                {block.startTime} - {block.endTime}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                            Reserva manual
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-indigo-700/80">
                                        {block.recurrence && (
                                            <>
                                                <Repeat className="w-3 h-3" />
                                                <span>{labelForRecurrence(block.recurrence)}</span>
                                                <span className="text-indigo-300">·</span>
                                            </>
                                        )}
                                        {block.clientName && (
                                            <>
                                                <span className="font-medium">{block.clientName}</span>
                                                {block.reason && <span className="text-indigo-300">·</span>}
                                            </>
                                        )}
                                        {block.reason && <span>{block.reason}</span>}
                                    </div>
                                    {blockCourtList && (
                                        <p className="text-[10px] text-indigo-500 mt-1">
                                            {blockTier} ({blockCourtList})
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
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
