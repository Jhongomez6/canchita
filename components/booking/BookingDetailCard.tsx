"use client";

import { Calendar, Clock, MapPin } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel } from "@/lib/domain/venue";
import { bookingStatusLabel, bookingStatusColor } from "@/lib/domain/booking";
import type { Booking } from "@/lib/domain/booking";

interface BookingDetailCardProps {
    booking: Booking;
    compact?: boolean;
    onClick?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
    yellow: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-slate-50 text-slate-500 border-slate-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
};

function formatDateDisplay(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

export default function BookingDetailCard({ booking, compact, onClick }: BookingDetailCardProps) {
    const color = bookingStatusColor(booking.status);
    const statusStyle = STATUS_STYLES[color] || STATUS_STYLES.gray;
    const Component = onClick ? "button" : "div";

    return (
        <Component
            onClick={onClick}
            className={`w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left ${onClick ? "hover:shadow-md transition-shadow" : ""}`}
        >
            {/* Status badge + format */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-slate-800">
                    {formatLabel(booking.format)}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle}`}>
                    {bookingStatusLabel(booking.status)}
                </span>
            </div>

            {/* Venue */}
            <p className="text-sm font-semibold text-slate-700 mb-2">{booking.venueName}</p>

            {/* Date & time */}
            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-xs">{formatDateDisplay(booking.date)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs">{booking.startTime} - {booking.endTime}</span>
                </div>
                {!compact && (
                    <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-xs truncate">{booking.venueAddress}</span>
                    </div>
                )}
            </div>

            {/* Price summary */}
            {!compact && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
                    <span className="text-slate-400">Total</span>
                    <span className="font-bold text-slate-700">{formatCOP(booking.totalPriceCOP)}</span>
                </div>
            )}
        </Component>
    );
}
