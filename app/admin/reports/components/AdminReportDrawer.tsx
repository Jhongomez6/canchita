"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Flag, ExternalLink, History } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PlayerReport, UserReportsSummary } from "@/lib/domain/matchReview";
import { REPORT_REASON_META } from "@/lib/domain/matchReview";
import { updateReportStatus } from "@/lib/matchReview";
import { logAdminReportActioned } from "@/lib/analytics";
import toast from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

type ActionType = "dismiss" | "warning" | "suspension";

interface Props {
    report: PlayerReport | null;
    adminUid: string;
    onClose: () => void;
    onActioned: () => void;
}

export default function AdminReportDrawer({ report, adminUid, onClose, onActioned }: Props) {
    const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
    const [adminNote, setAdminNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [history, setHistory] = useState<UserReportsSummary | null>(null);

    // Cargar histórico del reportado al abrir el drawer
    useEffect(() => {
        if (!report?.reportedUid) {
            setHistory(null);
            return;
        }
        let cancelled = false;
        getDoc(doc(db, "users", report.reportedUid))
            .then((snap) => {
                if (cancelled) return;
                const data = snap.data();
                setHistory((data?._reportsSummary as UserReportsSummary | undefined) ?? null);
            })
            .catch(() => { /* best-effort */ });
        return () => { cancelled = true; };
    }, [report?.reportedUid]);

    function handleClose() {
        if (submitting) return;
        setSelectedAction(null);
        setAdminNote("");
        setHistory(null);
        onClose();
    }

    async function handleConfirm() {
        if (!report?.id || !selectedAction) return;
        setSubmitting(true);
        try {
            if (selectedAction === "dismiss") {
                await updateReportStatus(report.id, "dismissed", adminUid);
            } else {
                await updateReportStatus(
                    report.id,
                    "reviewed",
                    adminUid,
                    selectedAction === "warning" ? "warning" : "suspension",
                    adminNote,
                );
            }
            logAdminReportActioned(report.id, selectedAction);
            toast.success(
                selectedAction === "dismiss"
                    ? "Reporte descartado"
                    : selectedAction === "warning"
                    ? "Advertencia registrada"
                    : "Suspensión registrada",
            );
            setSelectedAction(null);
            setAdminNote("");
            onActioned();
        } catch (e) {
            handleError(e, "Error al procesar el reporte");
            setSubmitting(false);
        }
    }

    const open = report !== null;
    const date = report
        ? new Date(report.createdAt).toLocaleDateString("es-CO", {
              weekday: "long",
              day: "numeric",
              month: "long",
          })
        : "";
    const reasonLabel = report ? REPORT_REASON_META[report.reason].label : "";

    const confirmLabel =
        selectedAction === "dismiss"
            ? "Confirmar descarte"
            : selectedAction === "warning"
            ? "Registrar advertencia"
            : "Registrar suspensión";

    const confirmBg =
        selectedAction === "suspension"
            ? "bg-red-600"
            : selectedAction === "warning"
            ? "bg-amber-500"
            : "bg-slate-700";

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 z-[100]"
                        onClick={handleClose}
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                            <h2 className="text-base font-bold text-slate-800">Detalle del reporte</h2>
                            <button
                                onClick={handleClose}
                                className="p-2 rounded-xl bg-slate-100 active:bg-slate-200"
                            >
                                <X size={16} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-5">
                            {/* Reported player + histórico */}
                            <div className="bg-slate-50 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Flag size={13} className="text-slate-400" />
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                        Jugador reportado
                                    </p>
                                </div>
                                <p className="text-base font-bold text-slate-800">{report?.reportedName}</p>
                                <p className="text-xs text-slate-400 mt-0.5 capitalize">{date}</p>

                                {history && history.totalCount > 0 && (
                                    <div className="mt-3 flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 w-fit">
                                        <History size={12} className="text-slate-400" />
                                        <span className="text-[11px] font-semibold text-slate-600">
                                            {history.totalCount} reporte{history.totalCount !== 1 ? "s" : ""} previo{history.totalCount !== 1 ? "s" : ""}
                                        </span>
                                        {history.pendingCount > 0 && (
                                            <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">
                                                {history.pendingCount} pendiente{history.pendingCount !== 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Reason + comment */}
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Motivo
                                </p>
                                <p className="text-sm font-semibold text-slate-700">{reasonLabel}</p>
                                {report?.comment && (
                                    <p className="text-sm text-slate-500 mt-2 bg-slate-50 rounded-xl p-3 italic leading-relaxed">
                                        &quot;{report.comment}&quot;
                                    </p>
                                )}
                            </div>

                            {/* Match link */}
                            {report?.matchId && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                        Partido
                                    </p>
                                    <Link
                                        href={`/join/${report.matchId}`}
                                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 active:opacity-70"
                                    >
                                        Abrir partido
                                        <ExternalLink size={13} />
                                    </Link>
                                </div>
                            )}

                            {/* Action selection */}
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                    Acción
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    {(
                                        [
                                            { action: "dismiss", label: "Descartar", active: "bg-slate-700 text-white border-slate-700", idle: "text-slate-600 border-slate-200" },
                                            { action: "warning", label: "Advertencia", active: "bg-amber-500 text-white border-amber-500", idle: "text-amber-600 border-amber-200" },
                                            { action: "suspension", label: "Suspensión", active: "bg-red-600 text-white border-red-600", idle: "text-red-600 border-red-200" },
                                        ] as const
                                    ).map(({ action, label, active, idle }) => (
                                        <button
                                            key={action}
                                            onClick={() =>
                                                setSelectedAction(
                                                    selectedAction === action ? null : action,
                                                )
                                            }
                                            className={`py-3 rounded-2xl text-xs font-bold border transition-colors active:scale-[0.97] ${
                                                selectedAction === action ? active : `bg-white ${idle}`
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Admin note for warning / suspension */}
                            {selectedAction && selectedAction !== "dismiss" && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                        Nota interna{" "}
                                        <span className="text-slate-400 normal-case font-normal">
                                            (opcional)
                                        </span>
                                    </p>
                                    <textarea
                                        value={adminNote}
                                        onChange={(e) => setAdminNote(e.target.value)}
                                        placeholder="Contexto de la decisión..."
                                        maxLength={500}
                                        rows={3}
                                        className="w-full text-base border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:border-slate-400 text-slate-700 bg-slate-50"
                                    />
                                </div>
                            )}

                            {/* Confirm button */}
                            {selectedAction && (
                                <button
                                    onClick={handleConfirm}
                                    disabled={submitting}
                                    className={`w-full py-4 rounded-2xl font-bold text-sm text-white disabled:opacity-50 active:scale-[0.98] transition-all ${confirmBg}`}
                                >
                                    {submitting ? "Procesando..." : confirmLabel}
                                </button>
                            )}

                            <div style={{ height: "max(env(safe-area-inset-bottom), 8px)" }} />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
