"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Flag } from "lucide-react";
import type { ReportReason } from "@/lib/domain/matchReview";
import { REPORT_REASONS, REPORT_REASON_META, COMMENT_MAX_LENGTH } from "@/lib/domain/matchReview";

interface ReportPayload {
    reason: ReportReason;
    comment: string;
}

interface Props {
    open: boolean;
    reportedName: string;
    currentReport: ReportPayload | null;
    onConfirm: (payload: ReportPayload | null) => void;
    onClose: () => void;
}

export default function ReportSheet({ open, reportedName, currentReport, onConfirm, onClose }: Props) {
    const [selectedReason, setSelectedReason] = useState<ReportReason | null>(currentReport?.reason ?? null);
    const [comment, setComment] = useState(currentReport?.comment ?? "");

    const meta = selectedReason ? REPORT_REASON_META[selectedReason] : null;
    const needsComment = meta?.requiresComment ?? false;
    const canSubmit = selectedReason && (!needsComment || comment.trim().length > 0);

    function handleOpen() {
        setSelectedReason(currentReport?.reason ?? null);
        setComment(currentReport?.comment ?? "");
    }

    return (
        <AnimatePresence onExitComplete={() => { /* reset handled by parent */ }}>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 z-[100]"
                        onClick={onClose}
                        onAnimationStart={handleOpen}
                    />

                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto max-h-[85vh] overflow-y-auto pb-safe"
                    >
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 bg-slate-200 rounded-full" />
                        </div>

                        <div className="px-5 pb-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Reportar a</p>
                                    <h3 className="text-base font-bold text-slate-800">{reportedName}</h3>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
                                >
                                    <X size={16} className="text-slate-500" />
                                </button>
                            </div>

                            <p className="text-xs text-slate-400 mb-3">
                                Tu reporte es confidencial. Solo lo verá el admin.
                            </p>

                            {/* Reason options */}
                            <div className="space-y-2 mb-4">
                                {REPORT_REASONS.map((reason) => {
                                    const { label } = REPORT_REASON_META[reason];
                                    const selected = selectedReason === reason;
                                    return (
                                        <button
                                            key={reason}
                                            type="button"
                                            onClick={() => setSelectedReason(selected ? null : reason)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all active:scale-[0.97] ${
                                                selected
                                                    ? "bg-red-50 border-red-300"
                                                    : "bg-slate-50 border-transparent hover:bg-slate-100"
                                            }`}
                                        >
                                            <Flag
                                                size={16}
                                                className={selected ? "text-red-500" : "text-slate-300"}
                                                fill={selected ? "currentColor" : "none"}
                                            />
                                            <span className={`text-sm font-medium ${selected ? "text-red-700" : "text-slate-600"}`}>
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Comment — always visible for "other", optional for rest */}
                            {selectedReason && (
                                <div className="mb-4">
                                    <label className="text-xs font-semibold text-slate-500 mb-1 block">
                                        Comentario
                                        {needsComment
                                            ? <span className="text-red-400"> *</span>
                                            : <span className="text-slate-300 font-normal"> (opcional)</span>
                                        }
                                    </label>
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Describe brevemente lo ocurrido…"
                                        rows={3}
                                        maxLength={COMMENT_MAX_LENGTH}
                                        className="w-full text-base bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-colors resize-none"
                                    />
                                    <p className="text-right text-xs text-slate-400 mt-0.5">
                                        {comment.length}/{COMMENT_MAX_LENGTH}
                                    </p>
                                </div>
                            )}

                            <button
                                type="button"
                                disabled={!canSubmit}
                                onClick={() => {
                                    if (!selectedReason) return;
                                    onConfirm({ reason: selectedReason, comment: comment.trim() });
                                    onClose();
                                }}
                                className="w-full py-3 rounded-xl font-bold text-sm bg-red-500 text-white disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm"
                            >
                                Enviar reporte
                            </button>

                            {currentReport && (
                                <button
                                    type="button"
                                    onClick={() => { onConfirm(null); onClose(); }}
                                    className="w-full mt-2 py-2.5 text-sm text-slate-400 font-medium hover:text-slate-600 transition-colors"
                                >
                                    Quitar reporte
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
