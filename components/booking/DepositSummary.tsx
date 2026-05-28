"use client";

import { CreditCard, Banknote } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";

interface DepositSummaryProps {
    depositCOP: number;
    remainingCOP: number;
    /** Variante visual: `prominent` (banner verde) o `compact` (chip pequeño). */
    variant?: "prominent" | "compact";
}

export default function DepositSummary({ depositCOP, remainingCOP, variant = "prominent" }: DepositSummaryProps) {
    if (depositCOP <= 0) return null;

    if (variant === "compact") {
        return (
            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                <CreditCard className="w-3 h-3" />
                <span className="font-semibold">Abono {formatCOP(depositCOP)}</span>
                {remainingCOP > 0 && (
                    <span className="text-emerald-600">· resto {formatCOP(remainingCOP)}</span>
                )}
            </div>
        );
    }

    return (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CreditCard className="w-3.5 h-3.5" />
                    Abono pagado
                </span>
                <span className="font-bold text-emerald-800">{formatCOP(depositCOP)}</span>
            </div>
            {remainingCOP > 0 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <Banknote className="w-3.5 h-3.5" />
                        Resto en sede
                    </span>
                    <span className="font-semibold text-slate-700">{formatCOP(remainingCOP)}</span>
                </div>
            )}
        </div>
    );
}
