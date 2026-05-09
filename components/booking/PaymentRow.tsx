"use client";

import { motion } from "framer-motion";
import { Banknote, Landmark } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { formatCourtList, tierLabelFromCount } from "@/lib/domain/venue";
import type { Court, ManualReservationPayment } from "@/lib/domain/venue";

interface PaymentRowProps {
    payment: ManualReservationPayment;
    courts: Court[];
    onTap?: (payment: ManualReservationPayment) => void;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    return `${h % 12 || 12}:${mStr} ${h >= 12 ? "PM" : "AM"}`;
}

export default function PaymentRow({ payment, courts, onTap }: PaymentRowProps) {
    const cancelled = payment.slotStatus === "cancelled";
    const courtNameById = new Map(courts.map((c) => [c.id, c.name]));
    const courtNames = payment.courtIds.map((id) => courtNameById.get(id) || id);
    const courtList = formatCourtList(courtNames);
    const tier = tierLabelFromCount(payment.courtIds.length);

    const showCash = payment.cashCOP > 0;
    const showTransfer = payment.transferCOP > 0;

    return (
        <motion.button
            layout
            type="button"
            onClick={() => onTap?.(payment)}
            className={`w-full text-left bg-white rounded-xl border p-3 hover:border-slate-200 active:scale-[0.99] transition-all ${cancelled ? "border-rose-100" : "border-slate-100"}`}
        >
            {/* Header: hora + total */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                        {fmt12h(payment.startTime)} – {fmt12h(payment.endTime)}
                    </span>
                    {cancelled && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500">
                            Cancelada
                        </span>
                    )}
                </div>
                <span className="text-sm font-bold text-slate-900">
                    {formatCOP(payment.totalCOP)}
                </span>
            </div>

            {/* Cliente y canchas */}
            <div className="text-xs text-slate-600 mb-2">
                {payment.clientName ? (
                    <span className="font-medium">{payment.clientName}</span>
                ) : (
                    <span className="italic text-slate-400">Sin cliente</span>
                )}
                {courtList && (
                    <>
                        <span className="text-slate-300 mx-1.5">·</span>
                        <span className="text-slate-500">{tier} ({courtList})</span>
                    </>
                )}
            </div>

            {/* Desglose efectivo / transferencia */}
            <div className="flex items-center gap-2 flex-wrap">
                {showCash && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        <Banknote className="w-3 h-3" />
                        {formatCOP(payment.cashCOP)}
                    </span>
                )}
                {showTransfer && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        <Landmark className="w-3 h-3" />
                        {formatCOP(payment.transferCOP)}
                    </span>
                )}
            </div>
        </motion.button>
    );
}
