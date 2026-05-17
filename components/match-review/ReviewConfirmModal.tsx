"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Star, X } from "lucide-react";
import type { KudoType, ReportReason } from "@/lib/domain/matchReview";
import { KUDO_META, REPORT_REASON_META } from "@/lib/domain/matchReview";

interface KudoEntry {
    recipientName: string;
    type: KudoType;
}

interface ReportEntry {
    reportedName: string;
    reason: ReportReason;
}

interface Props {
    open: boolean;
    rating: number;
    kudos: KudoEntry[];
    reports: ReportEntry[];
    submitting: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export default function ReviewConfirmModal({ open, rating, kudos, reports, submitting, onConfirm, onClose }: Props) {
    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[100]"
                        onClick={!submitting ? onClose : undefined}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[101] bg-white rounded-3xl shadow-2xl max-w-sm mx-auto p-6 max-h-[85vh] overflow-y-auto"
                    >
                        {/* Close */}
                        {!submitting && (
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"
                            >
                                <X size={14} className="text-slate-500" />
                            </button>
                        )}

                        <h3 className="text-base font-bold text-slate-800 mb-4">Revisá antes de enviar</h3>

                        {/* Rating */}
                        <div className="bg-slate-50 rounded-xl p-3 mb-3">
                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Tu calificación</p>
                            <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                        key={s}
                                        size={20}
                                        className={s <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}
                                        strokeWidth={1.5}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Kudos */}
                        {kudos.length > 0 && (
                            <div className="bg-amber-50 rounded-xl p-3 mb-3">
                                <p className="text-xs font-semibold text-amber-700 mb-1.5">
                                    {kudos.length} reconocimiento{kudos.length > 1 ? "s" : ""}
                                </p>
                                <ul className="space-y-1">
                                    {kudos.map((k, i) => (
                                        <li key={i} className="text-sm text-amber-800">
                                            {KUDO_META[k.type].emoji} {k.type ? KUDO_META[k.type].label : ""} → {k.recipientName}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Reports */}
                        {reports.length > 0 && (
                            <div className="bg-red-50 rounded-xl p-3 mb-4">
                                <p className="text-xs font-semibold text-red-600 mb-1.5">
                                    {reports.length} reporte{reports.length > 1 ? "s" : ""} privado{reports.length > 1 ? "s" : ""}
                                </p>
                                <ul className="space-y-1">
                                    {reports.map((r, i) => (
                                        <li key={i} className="text-sm text-red-700">
                                            {r.reportedName} — {REPORT_REASON_META[r.reason].label}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <p className="text-xs text-slate-400 mb-4">
                            Una vez enviado no podrás editar tu calificación.
                        </p>

                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={submitting}
                            className="w-full py-3.5 rounded-xl font-bold text-sm bg-[#1f7a4f] text-white disabled:opacity-60 active:scale-[0.98] transition-all shadow-sm"
                        >
                            {submitting ? "Enviando…" : "Confirmar y enviar"}
                        </button>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
