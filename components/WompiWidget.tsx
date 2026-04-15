"use client";

import { useState } from "react";
import { Loader2, CreditCard } from "lucide-react";
import { initTopup } from "@/lib/wallet";
import { calcWompiFee, formatCOP, isValidTopupAmount, MIN_TOPUP_COP, MAX_TOPUP_COP, TOPUP_STEP_COP } from "@/lib/domain/wallet";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

const QUICK_AMOUNTS = [20000, 30000, 50000, 80000];

// Convierte el valor del slider (0-N pasos) a pesos COP
const STEPS = (MAX_TOPUP_COP - MIN_TOPUP_COP) / TOPUP_STEP_COP;

function sliderToAmount(sliderVal: number): number {
  return MIN_TOPUP_COP + sliderVal * TOPUP_STEP_COP;
}

function amountToSlider(amount: number): number {
  return (amount - MIN_TOPUP_COP) / TOPUP_STEP_COP;
}

interface WompiWidgetProps {
  onStarted?: () => void;
}

export default function WompiWidget({ onStarted }: WompiWidgetProps) {
  const [amount, setAmount] = useState(20000);
  const [submitting, setSubmitting] = useState(false);

  const { fee, total } = calcWompiFee(amount);
  const isValid = isValidTopupAmount(amount);

  async function handleTopup() {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const data = await initTopup(amount);
      onStarted?.();

      const checkout = new (window as unknown as { WidgetCheckout: new (config: Record<string, unknown>) => { open: (cb: (result: { transaction?: { status: string } }) => void) => void } }).WidgetCheckout({
        currency: "COP",
        amountInCents: data.totalToChargeInCents,
        reference: data.reference,
        publicKey: data.publicKey,
        redirectUrl: data.redirectUrl,
        "signature:integrity": data.signature,
      });

      checkout.open((result: { transaction?: { status: string } }) => {
        if (result.transaction?.status === "APPROVED") {
          toast.success("Pago aprobado. Tu saldo se actualizará en unos segundos.");
        }
      });
    } catch (e: unknown) {
      handleError(e, "Error al iniciar recarga");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Chips de acceso rápido */}
      <div className="flex gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a)}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              amount === a
                ? "bg-[#1f7a4f] text-white shadow-md"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {formatCOP(a * 100)}
          </button>
        ))}
      </div>

      {/* Monto grande + slider */}
      <div className="text-center space-y-3">
        <p className="text-4xl font-extrabold text-slate-800 tabular-nums">
          {formatCOP(amount * 100)}
        </p>
        <input
          type="range"
          min={0}
          max={STEPS}
          step={1}
          value={amountToSlider(amount)}
          onChange={(e) => setAmount(sliderToAmount(Number(e.target.value)))}
          className="w-full accent-[#1f7a4f] h-2 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
          <span>{formatCOP(MIN_TOPUP_COP * 100)}</span>
          <span>{formatCOP(MAX_TOPUP_COP * 100)}</span>
        </div>
      </div>

      {/* Desglose */}
      <div className="bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Recibes en tu billetera:</span>
          <span className="font-semibold text-slate-700">{formatCOP(amount * 100)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Costo de transacción:</span>
          <span className="font-semibold text-slate-500">{formatCOP(fee * 100)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5">
          <span className="text-slate-700 font-semibold">Total a pagar:</span>
          <span className="font-bold text-slate-800">{formatCOP(total * 100)}</span>
        </div>
      </div>

      {/* Botón pagar */}
      <button
        disabled={submitting || !isValid}
        onClick={handleTopup}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${
          submitting || !isValid
            ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
            : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
        }`}
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Iniciando pago...</>
        ) : (
          <><CreditCard className="w-4 h-4" /> Pagar {formatCOP(total * 100)}</>
        )}
      </button>
    </div>
  );
}
