"use client";

import { Calendar, Clock, MapPin, RotateCcw } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { clientFormatLabel } from "@/lib/domain/venue";
import type { VenueFormat } from "@/lib/domain/venue";
import {
    bookingStatusLabelForPlayer,
    bookingStatusColor,
    isBookingExpired,
    isNegativeTerminalStatus,
} from "@/lib/domain/booking";
import type { Booking } from "@/lib/domain/booking";

interface BookingDetailCardProps {
    booking: Booking;
    compact?: boolean;
    /** Variante densa para el historial (Jugadas / Canceladas): oculta dirección
        y compacta el layout, reservando la card grande para "Próximas". */
    dense?: boolean;
    /** Catálogo multi-deporte de la sede (opcional). Resuelve VenueFormat.id a label. */
    venueFormats?: VenueFormat[];
    onClick?: () => void;
    /** Si se pasa, muestra un botón "Reservar de nuevo" en el pie de la card. */
    onRebook?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
    yellow: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-slate-50 text-slate-500 border-slate-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
};

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

function formatDateDisplay(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    // Mostrar el año solo cuando no es el año actual (historial viejo puede confundir).
    const yearSuffix = date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}` : "";
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}${yearSuffix}`;
}

export default function BookingDetailCard({
    booking,
    compact,
    dense,
    venueFormats,
    onClick,
    onRebook,
}: BookingDetailCardProps) {
    // Si el TTL ya venció pero el cron no marcó expired todavía, lo tratamos como expired
    // para que la pill no muestre "Pendiente de pago" en una reserva que ya no se puede pagar.
    const ttlElapsed = booking.status === "pending_payment" && isBookingExpired(booking.expiresAt ?? undefined);
    const effectiveStatus = ttlElapsed ? "expired" : booking.status;

    const color = bookingStatusColor(effectiveStatus);
    const statusStyle = STATUS_STYLES[color] || STATUS_STYLES.gray;
    // En terminales negativas el precio no representa un cobro vigente → atenuado + tachado.
    const priceMuted = isNegativeTerminalStatus(effectiveStatus);
    const hideAddress = compact || dense;

    // La card en sí es clickeable (navega al detalle). Cuando además hay onRebook, el botón
    // no puede anidarse dentro de un <button>, así que usamos un <div> clickeable.
    const isPlainButton = !!onClick && !onRebook;
    const Component = isPlainButton ? "button" : "div";

    // Label estandarizado para el cliente (ej. "Doble (9vs9)"). Si el formato no se
    // puede estandarizar, cae al snapshot guardado en el booking (legacy).
    const niceFormat = clientFormatLabel(booking.format, venueFormats);
    const formatDisplay = niceFormat === booking.format ? (booking.formatLabel || niceFormat) : niceFormat;

    return (
        <Component
            onClick={isPlainButton ? onClick : undefined}
            className={`w-full bg-white rounded-2xl border border-slate-100 shadow-sm ${dense ? "p-3.5" : "p-4"} text-left ${
                isPlainButton ? "hover:shadow-md transition-shadow" : ""
            }`}
        >
            {/* Bloque principal — clickeable hacia el detalle cuando la card es un <div>. */}
            <div
                onClick={!isPlainButton && onClick ? onClick : undefined}
                className={!isPlainButton && onClick ? "cursor-pointer" : undefined}
            >
                {/* Status badge + format estandarizado para el cliente ("Doble (9vs9)"). */}
                <div className={`flex items-center justify-between ${dense ? "mb-2" : "mb-3"}`}>
                    <span className={`${dense ? "text-[13px]" : "text-sm"} font-bold text-slate-800`}>
                        {formatDisplay}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle}`}>
                        {bookingStatusLabelForPlayer(effectiveStatus)}
                    </span>
                </div>

                {/* Venue */}
                <p className={`${dense ? "text-[13px]" : "text-sm"} font-semibold text-slate-700 mb-2`}>
                    {booking.venueName}
                </p>

                {/* Date & time */}
                <div className={dense ? "flex flex-wrap items-center gap-x-4 gap-y-1" : "space-y-1.5"}>
                    <div className="flex items-center gap-2 text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-xs">{formatDateDisplay(booking.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs">{fmt12h(booking.startTime)} – {fmt12h(booking.endTime)}</span>
                    </div>
                    {!hideAddress && (
                        <div className="flex items-center gap-2 text-slate-500">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-xs truncate">{booking.venueAddress}</span>
                        </div>
                    )}
                </div>

                {/* Price summary — atenuado en canceladas/expiradas/no-show. */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
                    <span className="text-slate-400">Total</span>
                    <span className={priceMuted ? "font-medium text-slate-300 line-through" : "font-bold text-slate-700"}>
                        {formatCOP(booking.totalPriceCOP)}
                    </span>
                </div>
            </div>

            {/* Re-reservar — solo en historial. Detiene la propagación para no navegar al detalle. */}
            {onRebook && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRebook();
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#1f7a4f]/25 text-[#1f7a4f] text-xs font-semibold hover:bg-[#1f7a4f]/5 active:scale-[0.99] transition-all"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reservar de nuevo
                </button>
            )}
        </Component>
    );
}
