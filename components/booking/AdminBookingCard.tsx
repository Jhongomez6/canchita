"use client";

import { Users } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, formatCourtList } from "@/lib/domain/venue";
import { bookingStatusLabel, bookingStatusColor } from "@/lib/domain/booking";
import type { Booking } from "@/lib/domain/booking";

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

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

interface AdminBookingCardProps {
    booking: Booking;
    onClick?: (booking: Booking) => void;
}

export default function AdminBookingCard({ booking, onClick }: AdminBookingCardProps) {
    const color = bookingStatusColor(booking.status);
    const dotClass = STATUS_DOT[color] || STATUS_DOT.gray;
    const badgeClass = STATUS_BADGE[color] || STATUS_BADGE.gray;

    const isCancellable = booking.status === "confirmed" || booking.status === "pending_payment";
    const clickable = !!onClick && isCancellable;

    return (
        <button
            type="button"
            onClick={() => clickable && onClick!(booking)}
            disabled={!clickable}
            className={`w-full text-left bg-white rounded-xl border border-slate-200 p-3 transition-colors ${clickable ? "hover:border-slate-300 active:scale-[0.99]" : "cursor-default"}`}
        >
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                    <span className="text-sm font-semibold text-slate-700">
                        {fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}
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
        </button>
    );
}
