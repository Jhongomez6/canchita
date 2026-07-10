"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Inbox, X } from "lucide-react";
import { subscribeToPendingBookings } from "@/lib/bookings";
import PendingBookingAdminCard from "./PendingBookingAdminCard";
import RejectProofSheet from "./RejectProofSheet";
import type { VenueFormat } from "@/lib/domain/venue";
import type { Booking } from "@/lib/domain/booking";

interface PendingBookingsAdminViewProps {
    venueId: string;
    venueFormats?: VenueFormat[];
    /** Callback para abrir el sheet de cancelación cuando el admin decide cancelar. */
    onCancelBooking?: (booking: Booking) => void;
}

export default function PendingBookingsAdminView({ venueId, venueFormats, onCancelBooking }: PendingBookingsAdminViewProps) {
    const [bookings, setBookings] = useState<Booking[] | null>(null);
    const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
    const [previewURL, setPreviewURL] = useState<string | null>(null);

    useEffect(() => {
        const unsub = subscribeToPendingBookings(venueId, setBookings);
        return () => unsub();
    }, [venueId]);

    // Lista única de solicitudes pendientes de aprobación (todas con comprobante).
    // Incluye reservas legacy pending_payment por compatibilidad. El flujo nuevo
    // solo crea pending_approval.
    const visible = useMemo(() => {
        const list = bookings ?? [];
        return list.filter(
            (b) => b.status === "pending_approval" || b.status === "pending_payment",
        );
    }, [bookings]);

    if (bookings === null) {
        return (
            <div className="space-y-3 animate-pulse">
                <div className="h-10 bg-slate-100 rounded-xl" />
                {[1, 2].map((i) => (
                    <div key={i} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
                        <div className="h-4 bg-slate-100 rounded w-32" />
                        <div className="h-3 bg-slate-100 rounded w-48" />
                        <div className="h-16 bg-slate-50 rounded-xl" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* List */}
            {visible.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
                    <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">
                        Sin solicitudes pendientes
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Cuando un jugador envíe una solicitud con comprobante, aparecerá acá.
                    </p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {visible.map((b) => (
                        <PendingBookingAdminCard
                            key={b.id}
                            booking={b}
                            venueFormats={venueFormats}
                            onReject={setRejectTarget}
                            onCancel={onCancelBooking}
                            onClickProof={setPreviewURL}
                        />
                    ))}
                </div>
            )}

            {/* Reject sheet */}
            <RejectProofSheet
                open={!!rejectTarget}
                onClose={() => setRejectTarget(null)}
                booking={rejectTarget}
            />

            {/* Proof preview overlay (lightbox simple). */}
            {previewURL && (
                <div
                    className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setPreviewURL(null)}
                >
                    <button
                        onClick={() => setPreviewURL(null)}
                        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                    <Image
                        src={previewURL}
                        alt="Comprobante en pantalla completa"
                        width={1024}
                        height={1024}
                        className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-xl"
                        unoptimized
                    />
                </div>
            )}
        </div>
    );
}
