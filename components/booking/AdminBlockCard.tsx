"use client";

import { useState, useRef, useEffect } from "react";
import { CalendarPlus, Repeat, Trash2, Check, ChevronRight } from "lucide-react";
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
import { labelForRecurrence } from "@/lib/domain/blocked-slots";
import type { BlockedSlot } from "@/lib/domain/venue";

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
    onAdvanceStatus?: (block: BlockedSlot) => void;
    onPickStatus?: (block: BlockedSlot, newStatus: ManualReservationStatus) => void;
    onQuickDelete?: (block: BlockedSlot, targetDate: string) => void;
}

export default function AdminBlockCard({
    block,
    courts,
    targetDate,
    onClick,
    onAdvanceStatus,
    onPickStatus,
    onQuickDelete,
}: AdminBlockCardProps) {
    const courtNameById = new Map(courts.map((c) => [c.id, c.name]));
    const blockCourtNames = block.courtIds.map((id) => courtNameById.get(id) || id);
    const blockTier = tierLabelFromCount(block.courtIds.length);
    const blockCourtList = formatCourtList(blockCourtNames);
    const clickable = !!onClick;

    const status = getBlockedSlotStatus(block);
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
            className={`relative w-full text-left bg-slate-50/60 rounded-xl border border-slate-100 p-3 transition-colors ${
                clickable ? "hover:border-slate-200" : ""
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
                    <span className="text-sm font-semibold text-slate-800">
                        {fmt12h(block.startTime)} – {fmt12h(block.endTime)}
                    </span>
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
                                                if (!isCurrent) onPickStatus(block, s);
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
                        <span className="font-medium">{block.clientName}</span>
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
                    {showPrice ? (
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

            {/* Footer: quick actions */}
            {(onAdvanceStatus || onQuickDelete) && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                    {onAdvanceStatus && nextStatus && nextLabel && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAdvanceStatus(block);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#1f7a4f]/10 text-[#1f7a4f] text-xs font-semibold hover:bg-[#1f7a4f]/15 transition-colors"
                        >
                            {nextLabel}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                    {onQuickDelete && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onQuickDelete(block, targetDate);
                            }}
                            aria-label="Eliminar reserva"
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
