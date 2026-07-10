"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";
import { formatLabel, calcDepositCOP, calcRemainingCOP } from "@/lib/domain/venue";
import type { VenueFormat, PaymentMethod } from "@/lib/domain/venue";
import PaymentMethodList from "./PaymentMethodList";
import PaymentProofUploader from "./PaymentProofUploader";

interface BookingConfirmSheetProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (args: { proofURL?: string; policiesAccepted: boolean }) => Promise<void>;
    venueId: string;
    uid: string;
    venueName: string;
    venueAddress: string;
    format: string;
    venueFormats?: VenueFormat[];
    date: string;
    startTime: string;
    endTime: string;
    totalPriceCOP: number;
    /** Si tier aplicado: subtotal antes del descuento. Si no, igual a totalPriceCOP o undefined. */
    subtotalCOP?: number;
    /** Si tier aplicado: monto descontado (subtotal − final). 0 o undefined si no. */
    discountCOP?: number;
    depositRequired: boolean;
    depositPercent: number;
    /** Métodos de pago de la sede (para pagar el abono antes de reservar). */
    paymentMethods?: PaymentMethod[];
    /** Políticas efectivas de la sede que el jugador debe aceptar. Vacío ⇒ no se pide aceptación. */
    policies: string[];
}

function formatDateDisplay(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

export default function BookingConfirmSheet({
    open,
    onClose,
    onConfirm,
    venueId,
    uid,
    venueName,
    venueAddress,
    format,
    venueFormats,
    date,
    startTime,
    endTime,
    totalPriceCOP,
    subtotalCOP,
    discountCOP,
    depositRequired,
    depositPercent,
    paymentMethods,
    policies,
}: BookingConfirmSheetProps) {
    const [loading, setLoading] = useState(false);
    const [proofURL, setProofURL] = useState<string | null>(null);
    const [policiesChecked, setPoliciesChecked] = useState(false);

    useEffect(() => {
        if (!open) return;
        // Reset al abrir
        setProofURL(null);
        setPoliciesChecked(false);
        window.dispatchEvent(new Event("bottomsheet:open"));
        return () => {
            window.dispatchEvent(new Event("bottomsheet:close"));
        };
    }, [open]);

    const depositCOP = depositRequired ? calcDepositCOP(totalPriceCOP, depositPercent) : 0;
    const remainingCOP = depositRequired ? calcRemainingCOP(totalPriceCOP, depositCOP) : totalPriceCOP;
    const needsPayment = depositRequired && depositCOP > 0;
    const methodsCount = paymentMethods?.length ?? 0;
    const hasPaymentMethods = methodsCount > 0;
    const singleMethod = methodsCount === 1;
    const hasPolicies = policies.length > 0;

    // Gating del CTA
    const proofOk = !needsPayment || !!proofURL;
    const policiesOk = !hasPolicies || policiesChecked;
    const blockedNoMethods = needsPayment && !hasPaymentMethods;
    const canSubmit = proofOk && policiesOk && !blockedNoMethods && !loading;

    const handleConfirm = async () => {
        if (!canSubmit) return;
        setLoading(true);
        try {
            await onConfirm({ proofURL: proofURL ?? undefined, policiesAccepted: policiesChecked });
        } finally {
            setLoading(false);
        }
    };

    const ctaLabel = loading
        ? "Procesando..."
        : needsPayment
            ? "Solicitar reserva"
            : "Reservar";

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-[60]"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[90vh] overflow-y-auto"
                    >
                        <div className="p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] md:pb-5">
                            {/* Handle */}
                            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-800">
                                    {needsPayment ? "Solicitar reserva" : "Confirmar reserva"}
                                </h3>
                                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Details */}
                            <div className="space-y-2 mb-5">
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="text-sm">
                                        {formatDateDisplay(date)} · {fmt12h(startTime)} – {fmt12h(endTime)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="text-sm">
                                        {formatLabel(format, venueFormats)} · {venueName}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400">{venueAddress}</p>
                            </div>

                            {/* Pricing */}
                            <div className="bg-slate-50 rounded-2xl p-4 mb-5 space-y-2.5">
                                {discountCOP && discountCOP > 0 && subtotalCOP ? (
                                    <>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Subtotal</span>
                                            <span className="text-slate-600">{formatCOP(subtotalCOP)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-emerald-600">Tarifa especial</span>
                                            <span className="text-emerald-600 font-medium">−{formatCOP(discountCOP)}</span>
                                        </div>
                                        <div className="border-t border-slate-200" />
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Precio cancha</span>
                                            <span className="font-semibold text-slate-700">{formatCOP(totalPriceCOP)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Precio cancha</span>
                                        <span className="font-semibold text-slate-700">{formatCOP(totalPriceCOP)}</span>
                                    </div>
                                )}

                                {needsPayment && (
                                    <>
                                        <div className="border-t border-slate-200" />
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Abono ({depositPercent}%)</span>
                                            <span className="font-bold text-[#1f7a4f]">{formatCOP(depositCOP)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Resto en sede</span>
                                            <span className="text-slate-700 font-medium">{formatCOP(remainingCOP)}</span>
                                        </div>
                                    </>
                                )}

                                {!needsPayment && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Pago en sede</span>
                                        <span className="text-slate-700 font-medium">{formatCOP(totalPriceCOP)}</span>
                                    </div>
                                )}
                            </div>

                            {/* ── PAGO DEL ABONO + COMPROBANTE (requisito previo) ── */}
                            {needsPayment && (
                                <div className="mb-5">
                                    {blockedNoMethods ? (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                            <p className="text-sm text-amber-700 leading-relaxed">
                                                Esta sede aún no configuró sus métodos de pago. Contáctala
                                                directamente para reservar.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <h4 className="text-sm font-bold text-slate-800 mb-1">
                                                Paga el abono de {formatCOP(depositCOP)}
                                            </h4>
                                            <p className="text-xs text-slate-500 mb-3">
                                                {singleMethod
                                                    ? "Paga con el método de abajo y sube el comprobante para solicitar tu reserva."
                                                    : "Paga con cualquiera de estos métodos y sube el comprobante para solicitar tu reserva."}
                                            </p>

                                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3 flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                                <p className="text-xs text-amber-700 leading-relaxed">
                                                    El pago del abono y el comprobante son <strong>obligatorios</strong> para
                                                    solicitar la reserva.
                                                </p>
                                            </div>

                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                                {singleMethod ? "Método de pago" : "Métodos de pago"}
                                            </p>
                                            <PaymentMethodList methods={paymentMethods ?? []} />

                                            <div className="border-t border-slate-100 mt-4 pt-4">
                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                                    Comprobante de pago <span className="text-rose-500">*</span>
                                                </p>
                                                {proofURL ? (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5"
                                                    >
                                                        <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                                                            <CheckCircle2 className="w-4 h-4" />
                                                            Comprobante cargado
                                                        </span>
                                                        <button
                                                            onClick={() => setProofURL(null)}
                                                            className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
                                                        >
                                                            Cambiar
                                                        </button>
                                                    </motion.div>
                                                ) : (
                                                    <PaymentProofUploader
                                                        venueId={venueId}
                                                        uid={uid}
                                                        onUploaded={(url) => setProofURL(url)}
                                                        primaryLabel="Subir comprobante"
                                                    />
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── POLÍTICAS DE LA SEDE ── */}
                            {hasPolicies && (
                                <div className="mb-5 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 mb-2">
                                        <ShieldCheck className="w-4 h-4 text-[#1f7a4f]" />
                                        Políticas de la sede
                                    </h4>
                                    <ul className="space-y-1.5 mb-3">
                                        {policies.map((p, i) => (
                                            <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                                                <span className="text-[#1f7a4f] flex-shrink-0">•</span>
                                                <span>{p}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={policiesChecked}
                                            onChange={(e) => setPoliciesChecked(e.target.checked)}
                                            className="mt-0.5 w-5 h-5 rounded border-slate-300 text-[#1f7a4f] focus:ring-[#1f7a4f]/30 flex-shrink-0"
                                        />
                                        <span className="text-sm font-medium text-slate-700">
                                            He leído y acepto las políticas de la sede.
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Action button */}
                            <button
                                onClick={handleConfirm}
                                disabled={!canSubmit}
                                className={`
                                    w-full py-3.5 rounded-xl text-base font-bold transition-all
                                    ${!canSubmit
                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-[#1f7a4f] text-white hover:bg-[#145c3a] active:scale-[0.98]"
                                    }
                                `}
                            >
                                {ctaLabel}
                            </button>

                            {needsPayment && !blockedNoMethods && (
                                <p className="text-xs text-slate-400 text-center mt-3">
                                    Tu solicitud queda en revisión. Un admin la aprueba y te confirmamos.
                                </p>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
