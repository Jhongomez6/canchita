"use client";

import { useState, useRef, useEffect } from "react";
import { CalendarPlus, Repeat, Trash2, Check, ChevronRight, Pencil, Banknote, Landmark, Cake } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCOP } from "@/lib/domain/wallet";
import {
    formatCourtList,
    tierLabelFromCount,
    getBlockedSlotStatus,
    getNextStatus,
    statusBadge,
    nextStatusActionLabel,
    MANUAL_RESERVATION_STATUS_ORDER,
    type Court,
    type ManualReservationStatus,
} from "@/lib/domain/venue";
import { isReservationPayable } from "@/lib/domain/payments";
import { labelForRecurrence } from "@/lib/domain/blocked-slots";
import type { BlockedSlot, ManualReservationPayment } from "@/lib/domain/venue";

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

interface AdminBlockCardProps {
    block: BlockedSlot;
    courts: Court[];
    targetDate: string;
    onClick?: (block: BlockedSlot, targetDate: string) => void;
    onAdvanceStatus?: (block: BlockedSlot, targetDate: string) => void;
    onPickStatus?: (block: BlockedSlot, newStatus: ManualReservationStatus, targetDate: string) => void;
    onCancelBlock?: (block: BlockedSlot, targetDate: string) => void;
    onEdit?: (block: BlockedSlot) => void;
    /** Pago registrado de la instancia (si existe). Cuando está presente, la card
     * muestra el chip resumen en lugar del botón "Marcar pagado". */
    existingPayment?: ManualReservationPayment | null;
    /** Callback para abrir el sheet de pago (en lugar de avanzar status directo a "paid").
     *  Recibe el pago existente para que el caller no tenga que volver a buscarlo. */
    onRegisterPayment?: (
        block: BlockedSlot,
        targetDate: string,
        existingPayment: ManualReservationPayment | null,
    ) => void;
}

export default function AdminBlockCard({
    block,
    courts,
    targetDate,
    onClick,
    onAdvanceStatus,
    onPickStatus,
    onCancelBlock,
    onEdit,
    existingPayment,
    onRegisterPayment,
}: AdminBlockCardProps) {
    const courtNameById = new Map(courts.map((c) => [c.id, c.name]));
    const blockCourtNames = block.courtIds.map((id) => courtNameById.get(id) || id);
    const blockTier = tierLabelFromCount(block.courtIds.length);
    const blockCourtList = formatCourtList(blockCourtNames);
    const status = getBlockedSlotStatus(block, targetDate);
    const cancelled = status === "cancelled";
    const isBirthday = !!block.isBirthday;

    const clickable = !!onClick && cancelled;
    const badge = statusBadge(status);
    const nextStatus = getNextStatus(status);
    const nextLabel = nextStatusActionLabel(status);

    const [popoverOpen, setPopoverOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement | null>(null);

    // Cerrar popover al hacer click fuera.
    useEffect(() => {
        if (!popoverOpen) return;
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setPopoverOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [popoverOpen]);

    const handleCardClick = () => {
        if (clickable) onClick!(block, targetDate);
    };

    const showPrice = typeof block.priceCOP === "number" && block.priceCOP > 0;

    return (
        <div
            className={`relative w-full text-left rounded-xl border p-3 transition-colors ${
                cancelled
                    ? "bg-slate-50/40 border-slate-100 opacity-60"
                    : isBirthday
                        ? `bg-pink-50/70 border-pink-200 ${clickable ? "hover:border-pink-300" : ""}`
                        : `bg-slate-50/60 border-slate-100 ${clickable ? "hover:border-slate-200" : ""}`
            }`}
        >
            {/* Header: hora + badge tappable */}
            <div className="flex items-center justify-between mb-1.5">
                <button
                    type="button"
                    onClick={handleCardClick}
                    disabled={!clickable}
                    className={`flex items-center gap-2 ${clickable ? "" : "cursor-default"}`}
                >
                    <CalendarPlus className="w-3.5 h-3.5 text-slate-500" />
                    <span className={`text-sm font-semibold ${cancelled ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {fmt12h(block.startTime)} – {fmt12h(block.endTime)}
                    </span>
                    {isBirthday && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200">
                            <Cake className="w-2.5 h-2.5" />
                            Cumpleaños
                        </span>
                    )}
                </button>

                <div className="relative" ref={popoverRef}>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onPickStatus) setPopoverOpen((o) => !o);
                        }}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${badge.classes} ${
                            onPickStatus ? "hover:brightness-95 cursor-pointer" : "cursor-default"
                        }`}
                    >
                        {badge.label}
                    </button>

                    <AnimatePresence>
                        {popoverOpen && onPickStatus && (
                            <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-full mt-1 z-30 w-40 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                            >
                                {MANUAL_RESERVATION_STATUS_ORDER.map((s) => {
                                    const sb = statusBadge(s);
                                    const isCurrent = s === status;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPopoverOpen(false);
                                                if (!isCurrent) {
                                                    if (s === "paid" && onRegisterPayment && isReservationPayable(block)) {
                                                        onRegisterPayment(block, targetDate, existingPayment ?? null);
                                                    } else {
                                                        onPickStatus(block, s, targetDate);
                                                    }
                                                }
                                            }}
                                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                                                isCurrent ? "bg-slate-50 text-slate-400 cursor-default" : "hover:bg-slate-50 text-slate-700"
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${sb.classes.replace(/text-\S+/g, "").trim()}`} />
                                                {sb.label}
                                            </span>
                                            {isCurrent && <Check className="w-3.5 h-3.5 text-slate-400" />}
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Cuerpo: cliente / teléfono / info */}
            <button
                type="button"
                onClick={handleCardClick}
                disabled={!clickable}
                className={`w-full text-left ${clickable ? "active:scale-[0.99] transition-transform" : "cursor-default"}`}
            >
                <div className="flex items-center gap-2 text-xs text-slate-700/80 flex-wrap">
                    {block.recurrence && (
                        <>
                            <Repeat className="w-3 h-3" />
                            <span>{labelForRecurrence(block.recurrence)}</span>
                            <span className="text-slate-300">·</span>
                        </>
                    )}
                    {block.clientName && (
                        <span className={`font-medium ${cancelled ? "line-through" : ""}`}>{block.clientName}</span>
                    )}
                    {block.clientPhone ? (
                        <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600">{block.clientPhone}</span>
                        </>
                    ) : (
                        <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400 italic">Sin celular</span>
                        </>
                    )}
                </div>

                {block.reason && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{block.reason}</p>
                )}

                {blockCourtList && (
                    <p className="text-[10px] text-slate-500 mt-1">
                        {blockTier} ({blockCourtList})
                    </p>
                )}

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/80">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Precio
                    </span>
                    {isBirthday ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200">
                            <Cake className="w-2.5 h-2.5" />
                            Cumpleaños
                        </span>
                    ) : block.isMonthly ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                            Mensualidad
                        </span>
                    ) : showPrice ? (
                        <span className="text-sm font-bold text-[#1f7a4f]">
                            {formatCOP(block.priceCOP as number)}
                        </span>
                    ) : (
                        <span className="text-[11px] font-medium text-slate-400 italic">
                            Sin precio asignado
                        </span>
                    )}
                </div>
            </button>

            {/* Motivo de cancelación */}
            {cancelled && block.cancellationReason && (
                <p className="text-[11px] text-slate-400 italic mt-1">
                    Motivo: {block.cancellationReason}
                </p>
            )}

            {/* Footer: quick actions (oculto si está cancelada) */}
            {!cancelled && (onAdvanceStatus || onEdit || onCancelBlock || existingPayment) && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                    {/* Chip resumen de pago: cuando hay un pago registrado, reemplaza el botón de avance. */}
                    {existingPayment && onRegisterPayment ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRegisterPayment(block, targetDate, existingPayment);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors text-xs font-semibold text-emerald-800"
                            aria-label="Editar pago"
                        >
                            {existingPayment.cashCOP > 0 && (
                                <span className="flex items-center gap-0.5">
                                    <Banknote className="w-3 h-3" />
                                    {formatCOP(existingPayment.cashCOP)}
                                </span>
                            )}
                            {existingPayment.cashCOP > 0 && existingPayment.transferCOP > 0 && (
                                <span className="text-emerald-400">+</span>
                            )}
                            {existingPayment.transferCOP > 0 && (
                                <span className="flex items-center gap-0.5">
                                    <Landmark className="w-3 h-3" />
                                    {formatCOP(existingPayment.transferCOP)}
                                </span>
                            )}
                        </button>
                    ) : onAdvanceStatus && nextStatus && nextLabel && isReservationPayable(block) && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                // Interceptar la transición a "paid": en lugar de cambiar status directo,
                                // abrir el sheet de pago para capturar montos por método.
                                if (nextStatus === "paid" && onRegisterPayment) {
                                    onRegisterPayment(block, targetDate, existingPayment ?? null);
                                } else {
                                    onAdvanceStatus(block, targetDate);
                                }
                            }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#1f7a4f]/10 text-[#1f7a4f] text-xs font-semibold hover:bg-[#1f7a4f]/15 transition-colors"
                        >
                            {nextLabel}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                    {onEdit && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(block);
                            }}
                            aria-label="Editar reserva"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1f7a4f] hover:bg-emerald-50 transition-colors"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                    )}
                    {onCancelBlock && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCancelBlock(block, targetDate);
                            }}
                            aria-label="Cancelar reserva"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
