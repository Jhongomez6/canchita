"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import PaymentMethodCard from "./PaymentMethodCard";
import QRViewerModal from "./QRViewerModal";
import type { PaymentMethod } from "@/lib/domain/venue";

interface PaymentMethodListProps {
    methods: PaymentMethod[];
}

export default function PaymentMethodList({ methods }: PaymentMethodListProps) {
    const [qrTarget, setQrTarget] = useState<PaymentMethod | null>(null);

    const active = methods
        .filter((m) => m.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    if (active.length === 0) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2.5">
                <Wallet className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-sm font-medium text-amber-700">
                        Esta sede aún no configuró sus métodos de pago.
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                        Contáctala directamente para coordinar el pago.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-2.5">
                {active.map((m) => (
                    <PaymentMethodCard key={m.id} method={m} onShowQR={setQrTarget} />
                ))}
            </div>

            {qrTarget && qrTarget.qrImageURL && (
                <QRViewerModal
                    open={!!qrTarget}
                    onClose={() => setQrTarget(null)}
                    qrImageURL={qrTarget.qrImageURL}
                    methodLabel={qrTarget.label}
                />
            )}
        </>
    );
}
