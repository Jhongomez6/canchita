"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Award } from "lucide-react";
import { getKudosReceivedByPlayer } from "@/lib/matchReview";
import { KUDO_META } from "@/lib/domain/matchReview";
import type { PlayerKudo } from "@/lib/domain/matchReview";

interface Props {
    open: boolean;
    userUid: string;
    onClose: () => void;
}

export default function KudosHistoryDrawer({ open, userUid, onClose }: Props) {
    const [kudos, setKudos] = useState<PlayerKudo[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !userUid) return;
        let cancelled = false;
        setLoading(true);
        getKudosReceivedByPlayer(userUid, 50)
            .then((data) => { if (!cancelled) setKudos(data); })
            .catch(() => { if (!cancelled) setKudos([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, userUid]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 z-[100]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                                <Award size={18} className="text-amber-500" />
                                <h2 className="text-base font-bold text-slate-800">Historial de reconocimientos</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-slate-100 active:bg-slate-200"
                            >
                                <X size={16} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="px-5 py-4">
                            {loading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="h-14 bg-slate-100 rounded-2xl animate-pulse" />
                                    ))}
                                </div>
                            ) : kudos.length === 0 ? (
                                <div className="py-10 text-center">
                                    <p className="text-sm text-slate-400">Sin reconocimientos aún</p>
                                </div>
                            ) : (
                                <ul className="space-y-2">
                                    {kudos.map((k) => {
                                        const meta = KUDO_META[k.type];
                                        const date = new Date(k.createdAt).toLocaleDateString("es-CO", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                        });
                                        return (
                                            <li
                                                key={k.id}
                                                className="flex items-center gap-3 bg-amber-50/60 border border-amber-100 rounded-2xl p-3"
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg shrink-0 shadow-sm border border-amber-100">
                                                    {meta.emoji}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 leading-tight">
                                                        {meta.label}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                                        de <span className="font-semibold">{k.giverName}</span>
                                                    </p>
                                                </div>
                                                <span className="text-[11px] text-slate-400 shrink-0">{date}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            <div style={{ height: "max(env(safe-area-inset-bottom), 12px)" }} />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
