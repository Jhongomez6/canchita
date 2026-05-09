"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { Banknote, Landmark, Receipt } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { subscribeDailyPayments, getVenueCourts } from "@/lib/venues";
import { sumPayments } from "@/lib/domain/payments";
import { formatCOP } from "@/lib/domain/wallet";
import { logDailyBalanceViewed, logDailyBalanceDateChanged } from "@/lib/analytics";
import type { BlockedSlot, Court, ManualReservationPayment } from "@/lib/domain/venue";
import PaymentRow from "./PaymentRow";
import RegisterPaymentSheet from "./RegisterPaymentSheet";
import DailyBalanceSkeleton from "@/components/skeletons/DailyBalanceSkeleton";

interface DailyBalanceViewProps {
    venueId: string;
}

function todayLocalISO(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Reconstruye un BlockedSlot mínimo desde el snapshot del payment para el sheet de edit.
 * Es suficiente porque el sheet en modo edit no toca el slot — solo el doc de payment.
 */
function buildSlotFromPayment(payment: ManualReservationPayment): BlockedSlot {
    return {
        id: payment.reservationId,
        date: payment.date,
        startTime: payment.startTime,
        endTime: payment.endTime,
        courtIds: payment.courtIds,
        clientName: payment.clientName,
        priceCOP: payment.priceCOP,
        createdBy: payment.registeredBy,
        createdAt: payment.registeredAt,
    };
}

export default function DailyBalanceView({ venueId }: DailyBalanceViewProps) {
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = useState(() => todayLocalISO());
    const [payments, setPayments] = useState<ManualReservationPayment[] | null>(null);
    const [courts, setCourts] = useState<Court[]>([]);
    const [editTarget, setEditTarget] = useState<ManualReservationPayment | null>(null);

    // Cargar courts una vez por venue (para mostrar nombres de canchas en las rows).
    useEffect(() => {
        let cancelled = false;
        getVenueCourts(venueId).then((res) => {
            if (!cancelled) setCourts(res);
        });
        return () => {
            cancelled = true;
        };
    }, [venueId]);

    // Suscripción reactiva a los pagos del día.
    useEffect(() => {
        setPayments(null);
        const unsub = subscribeDailyPayments(venueId, selectedDate, (list) => {
            const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
            setPayments(sorted);
        });
        return () => unsub();
    }, [venueId, selectedDate]);

    const totals = useMemo(() => {
        if (!payments) return { cashCOP: 0, transferCOP: 0, totalCOP: 0, count: 0 };
        return sumPayments(payments);
    }, [payments]);

    // Analytics: balance viewed (cuando se cargan los datos del día seleccionado).
    useEffect(() => {
        if (!payments) return;
        logDailyBalanceViewed({
            venueId,
            date: selectedDate,
            paymentsCount: totals.count,
            cashCOP: totals.cashCOP,
            transferCOP: totals.transferCOP,
            totalCOP: totals.totalCOP,
        });
        // Solo cuando cambia la fecha o se cargan los datos por primera vez.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [venueId, selectedDate, payments !== null]);

    const handleDateChange = (newDate: string) => {
        if (!newDate) return;
        if (newDate === selectedDate) return;
        logDailyBalanceDateChanged({ venueId, previousDate: selectedDate, newDate });
        setSelectedDate(newDate);
    };

    if (payments === null) {
        return <DailyBalanceSkeleton />;
    }

    return (
        <div className="space-y-4">
            {/* Date picker */}
            <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Fecha
                </label>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                />
            </div>

            {/* Cards de totales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.0 }}
                    className="bg-emerald-50 rounded-xl p-4 border border-emerald-100"
                >
                    <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold uppercase tracking-wide mb-1">
                        <Banknote className="w-3.5 h-3.5" />
                        Efectivo
                    </div>
                    <div className="text-2xl font-bold text-emerald-900">{formatCOP(totals.cashCOP)}</div>
                    <div className="text-[11px] text-emerald-600 mt-1">
                        {payments.filter((p) => p.cashCOP > 0).length} pagos
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.05 }}
                    className="bg-blue-50 rounded-xl p-4 border border-blue-100"
                >
                    <div className="flex items-center gap-1.5 text-blue-700 text-xs font-semibold uppercase tracking-wide mb-1">
                        <Landmark className="w-3.5 h-3.5" />
                        Transferencia
                    </div>
                    <div className="text-2xl font-bold text-blue-900">{formatCOP(totals.transferCOP)}</div>
                    <div className="text-[11px] text-blue-600 mt-1">
                        {payments.filter((p) => p.transferCOP > 0).length} pagos
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                    className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                >
                    <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold uppercase tracking-wide mb-1">
                        <Receipt className="w-3.5 h-3.5" />
                        Total
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{formatCOP(totals.totalCOP)}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        {totals.count} {totals.count === 1 ? "pago" : "pagos"}
                    </div>
                </motion.div>
            </div>

            {/* Lista de pagos */}
            {payments.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
                    <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600 mb-1">
                        Sin pagos registrados
                    </p>
                    <p className="text-xs text-slate-400">
                        Cuando registres un pago de una reserva, aparecerá aquí.
                    </p>
                </div>
            ) : (
                <LayoutGroup>
                    <div className="space-y-2">
                        {payments.map((p) => (
                            <PaymentRow
                                key={p.id}
                                payment={p}
                                courts={courts}
                                onTap={(payment) => setEditTarget(payment)}
                            />
                        ))}
                    </div>
                </LayoutGroup>
            )}

            {/* Sheet de edición */}
            {editTarget && user && (
                <RegisterPaymentSheet
                    open={!!editTarget}
                    onClose={() => setEditTarget(null)}
                    venueId={venueId}
                    slot={buildSlotFromPayment(editTarget)}
                    targetDate={editTarget.date}
                    existingPayment={editTarget}
                    registeredBy={user.uid}
                    onSaved={() => setEditTarget(null)}
                    onDeleted={() => setEditTarget(null)}
                />
            )}
        </div>
    );
}
