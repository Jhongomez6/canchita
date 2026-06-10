"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Inbox, Hourglass, ClipboardCheck, X } from "lucide-react";
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

type Tab = "approval" | "payment";

export default function PendingBookingsAdminView({ venueId, venueFormats, onCancelBooking }: PendingBookingsAdminViewProps) {
    const [bookings, setBookings] = useState<Booking[] | null>(null);
    const [tab, setTab] = useState<Tab>("approval");
    const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
    const [previewURL, setPreviewURL] = useState<string | null>(null);

    useEffect(() => {
        const unsub = subscribeToPendingBookings(venueId, setBookings);
        return () => unsub();
    }, [venueId]);

    const { pendingApproval, pendingPayment } = useMemo(() => {
        const list = bookings ?? [];
        const nowMs = Date.now();
        return {
            pendingApproval: list.filter((b) => b.status === "pending_approval"),
            // Filtramos los pending_payment cuyo TTL ya venció: aunque el cron
            // todavía no haya corrido, ya no se pueden completar — los ocultamos
            // del listado para que el admin no tenga que "cancelarlos" manualmente.
            // El cron eventualmente los pasa a "expired" oficialmente.
            pendingPayment: list.filter((b) => {
                if (b.status !== "pending_payment") return false;
                if (!b.expiresAt) return true;
                return new Date(b.expiresAt).getTime() > nowMs;
            }),
        };
    }, [bookings]);

    const visible = tab === "approval" ? pendingApproval : pendingPayment;

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
            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                <button
                    onClick={() => setTab("approval")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                        tab === "approval"
                            ? "bg-white text-orange-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    Por aprobar
                    {pendingApproval.length > 0 && (
                        <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                            {pendingApproval.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setTab("payment")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                        tab === "payment"
                            ? "bg-white text-amber-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    <Hourglass className="w-3.5 h-3.5" />
                    Sin comprobante
                    {pendingPayment.length > 0 && (
                        <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                            {pendingPayment.length}
                        </span>
                    )}
                </button>
            </div>

            {/* List */}
            {visible.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
                    <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">
                        {tab === "approval" ? "Sin comprobantes por aprobar" : "Sin reservas esperando comprobante"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Cuando un jugador
                        {tab === "approval" ? " envíe su comprobante" : " cree una reserva con depósito"},
                        aparecerá acá.
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
