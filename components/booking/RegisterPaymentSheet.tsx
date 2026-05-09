"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, Banknote, Landmark, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    registerManualReservationPayment,
    updateManualReservationPayment,
    deleteManualReservationPayment,
    PaymentAlreadyExistsError,
} from "@/lib/venues";
import { calcPaymentDiff } from "@/lib/domain/payments";
import { formatCOP } from "@/lib/domain/wallet";
import { handleError } from "@/lib/utils/error";
import {
    logManualReservationPaymentRegistered,
    logManualReservationPaymentEdited,
    logManualReservationPaymentDeleted,
} from "@/lib/analytics";
import type { BlockedSlot, ManualReservationPayment } from "@/lib/domain/venue";

interface RegisterPaymentSheetProps {
    open: boolean;
    onClose: () => void;
    venueId: string;
    slot: BlockedSlot;
    targetDate: string;
    existingPayment: ManualReservationPayment | null;
    /** uid del admin que registra/edita. Lo pasa el caller desde useAuth. */
    registeredBy: string;
    onSaved?: () => void;
    onDeleted?: () => void;
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    return `${h % 12 || 12}:${mStr} ${h >= 12 ? "PM" : "AM"}`;
}

/** Convierte centavos a pesos para mostrar en input (4_000_000 → 40000). */
function centavosToPesos(centavos: number): number {
    return Math.round(centavos / 100);
}

/** Convierte pesos del input a centavos para persistir (40000 → 4_000_000). */
function pesosToCentavos(pesos: number): number {
    return Math.round(pesos * 100);
}

/** Parsea el string del input quitando todo lo que no sea dígito. Devuelve pesos. */
function parsePesosInput(value: string): number {
    const digits = value.replace(/\D/g, "");
    if (digits === "") return 0;
    return parseInt(digits, 10);
}

/** Formatea pesos con separadores de miles para mostrar mientras se escribe. */
function formatPesosInput(pesos: number): string {
    if (pesos === 0) return "";
    return new Intl.NumberFormat("es-CO").format(pesos);
}

export default function RegisterPaymentSheet({
    open,
    onClose,
    venueId,
    slot,
    targetDate,
    existingPayment,
    registeredBy,
    onSaved,
    onDeleted,
}: RegisterPaymentSheetProps) {
    const isEditMode = !!existingPayment;
    const [cashPesos, setCashPesos] = useState(0);
    const [transferPesos, setTransferPesos] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // Inicializar/resincronizar cuando se abre o cambian los datos.
    useEffect(() => {
        if (!open) return;
        if (existingPayment) {
            setCashPesos(centavosToPesos(existingPayment.cashCOP));
            setTransferPesos(centavosToPesos(existingPayment.transferCOP));
        } else {
            // Pre-rellenar efectivo con priceCOP (caso más común).
            const pricePesos = typeof slot.priceCOP === "number" ? centavosToPesos(slot.priceCOP) : 0;
            setCashPesos(pricePesos);
            setTransferPesos(0);
        }
        setConfirmingDelete(false);
    }, [open, existingPayment, slot.priceCOP]);

    const cashCOP = pesosToCentavos(cashPesos);
    const transferCOP = pesosToCentavos(transferPesos);
    const totalCOP = cashCOP + transferCOP;
    const canSubmit = totalCOP > 0 && !submitting;

    const diff = useMemo(
        () => calcPaymentDiff(totalCOP, slot.priceCOP),
        [totalCOP, slot.priceCOP],
    );

    const hasChanges =
        !isEditMode ||
        (existingPayment !== null &&
            (cashCOP !== existingPayment.cashCOP || transferCOP !== existingPayment.transferCOP));

    const handleClose = () => {
        if (submitting) return;
        onClose();
    };

    const handleSave = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            if (isEditMode && existingPayment) {
                const previousCashCOP = existingPayment.cashCOP;
                const previousTransferCOP = existingPayment.transferCOP;
                await updateManualReservationPayment(venueId, existingPayment.id, cashCOP, transferCOP);
                logManualReservationPaymentEdited({
                    venueId,
                    paymentId: existingPayment.id,
                    previousCashCOP,
                    newCashCOP: cashCOP,
                    previousTransferCOP,
                    newTransferCOP: transferCOP,
                    totalCOP,
                });
                toast.success("Pago actualizado");
            } else {
                await registerManualReservationPayment(
                    venueId,
                    slot,
                    targetDate,
                    cashCOP,
                    transferCOP,
                    registeredBy,
                );
                logManualReservationPaymentRegistered({
                    venueId,
                    slotId: slot.id,
                    date: targetDate,
                    cashCOP,
                    transferCOP,
                    totalCOP,
                    priceCOP: slot.priceCOP ?? 0,
                    diffCOP: diff.diff,
                    isRecurringInstance: !!slot.recurrence,
                });
                toast.success("Pago registrado");
            }
            onSaved?.();
            onClose();
        } catch (err) {
            if (err instanceof PaymentAlreadyExistsError) {
                toast.error("Ya hay un pago para esta reserva. Recarga para ver el actual.");
                onClose();
            } else {
                handleError(err, "No pudimos guardar el pago");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!existingPayment) return;
        setSubmitting(true);
        try {
            await deleteManualReservationPayment(venueId, existingPayment.id);
            logManualReservationPaymentDeleted({
                venueId,
                paymentId: existingPayment.id,
                slotId: existingPayment.reservationId,
                cashCOP: existingPayment.cashCOP,
                transferCOP: existingPayment.transferCOP,
                totalCOP: existingPayment.totalCOP,
            });
            toast.success("Pago eliminado");
            onDeleted?.();
            onClose();
        } catch (err) {
            handleError(err, "No pudimos eliminar el pago");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/40 z-50"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 320 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[92vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">
                                    {isEditMode ? "Editar pago" : "Registrar pago"}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                                    {slot.clientName ? ` · ${slot.clientName}` : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={submitting}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)] space-y-4">
                            {/* Resumen de precio */}
                            {typeof slot.priceCOP === "number" && slot.priceCOP > 0 && (
                                <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                                        Precio reserva
                                    </span>
                                    <span className="text-sm font-bold text-slate-800">
                                        {formatCOP(slot.priceCOP)}
                                    </span>
                                </div>
                            )}

                            {/* Input efectivo */}
                            <div>
                                <label className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                    <Banknote className="w-3.5 h-3.5" />
                                    Efectivo
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formatPesosInput(cashPesos)}
                                        onChange={(e) => setCashPesos(parsePesosInput(e.target.value))}
                                        placeholder="0"
                                        className="w-full pl-7 pr-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50"
                                    />
                                </div>
                            </div>

                            {/* Input transferencia */}
                            <div>
                                <label className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                    <Landmark className="w-3.5 h-3.5" />
                                    Transferencia
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formatPesosInput(transferPesos)}
                                        onChange={(e) => setTransferPesos(parsePesosInput(e.target.value))}
                                        placeholder="0"
                                        className="w-full pl-7 pr-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
                                    />
                                </div>
                            </div>

                            {/* Total + diff badge */}
                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Total
                                    </span>
                                    <AnimatePresence mode="wait">
                                        {diff.kind === "overpayment" && (
                                            <motion.span
                                                key="over"
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700"
                                            >
                                                +{formatCOP(diff.diff)}
                                            </motion.span>
                                        )}
                                        {diff.kind === "underpayment" && (
                                            <motion.span
                                                key="under"
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600"
                                            >
                                                {formatCOP(diff.diff)}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <span className="text-lg font-bold text-slate-900">
                                    {formatCOP(totalCOP)}
                                </span>
                            </div>

                            {/* Confirmación de delete inline */}
                            {confirmingDelete && existingPayment && (
                                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-2">
                                    <p className="text-xs text-rose-700 font-medium">
                                        ¿Eliminar este pago? La reserva volverá a estado &quot;Jugado&quot;.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingDelete(false)}
                                            disabled={submitting}
                                            className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            disabled={submitting}
                                            className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                                        >
                                            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Botones principales */}
                            <div className="flex gap-2 pt-1">
                                {isEditMode && !confirmingDelete && (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingDelete(true)}
                                        disabled={submitting}
                                        aria-label="Eliminar pago"
                                        className="px-4 py-3 text-sm font-semibold text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-50 flex items-center justify-center"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={submitting}
                                    className="flex-1 py-3 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={!canSubmit || !hasChanges || confirmingDelete}
                                    className="flex-1 py-3 text-sm font-bold text-white bg-[#1f7a4f] rounded-xl hover:bg-[#16603c] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                                >
                                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isEditMode ? "Guardar cambios" : "Registrar pago"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
