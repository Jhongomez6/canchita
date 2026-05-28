"use client";

import { useState } from "react";
import { Copy, QrCode, Check } from "lucide-react";
import { toast } from "react-hot-toast";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain/venue";
import type { PaymentMethod } from "@/lib/domain/venue";

interface PaymentMethodCardProps {
    method: PaymentMethod;
    onShowQR?: (method: PaymentMethod) => void;
}

const METHOD_ICONS: Record<PaymentMethod["type"], string> = {
    nequi: "💜",
    bancolombia: "🏦",
    daviplata: "💛",
    llave: "🔑",
    transfer: "🏛️",
    other: "💳",
};

export default function PaymentMethodCard({ method, onShowQR }: PaymentMethodCardProps) {
    const [copied, setCopied] = useState(false);

    if (!method.active) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(method.accountIdentifier);
            setCopied(true);
            toast.success(`${PAYMENT_METHOD_LABELS[method.type]} copiado`);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("No se pudo copiar al portapapeles");
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="text-xl leading-none" aria-hidden>
                        {METHOD_ICONS[method.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{method.label}</p>
                        <p className="text-xs text-slate-500 truncate">{method.accountHolderName}</p>
                    </div>
                </div>
                {method.qrImageURL && onShowQR && (
                    <button
                        onClick={() => onShowQR(method)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
                        aria-label="Ver QR"
                    >
                        <QrCode className="w-3.5 h-3.5" />
                        QR
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                <span className="text-sm font-mono font-semibold text-slate-800 truncate">
                    {method.accountIdentifier}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#1f7a4f] text-xs font-semibold text-slate-700 transition-colors flex-shrink-0"
                >
                    {copied ? (
                        <>
                            <Check className="w-3.5 h-3.5 text-[#1f7a4f]" />
                            Copiado
                        </>
                    ) : (
                        <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar
                        </>
                    )}
                </button>
            </div>

            {method.instructions && (
                <p className="text-xs text-slate-500 leading-relaxed">{method.instructions}</p>
            )}
        </div>
    );
}
