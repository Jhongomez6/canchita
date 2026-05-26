"use client";

/**
 * Bottom-sheet drawer con el historial de XP del usuario.
 * Carga los últimos 20 eventos y los muestra en una lista.
 * Lazy-load al abrir.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown } from "lucide-react";
import { getXpHistory } from "@/lib/xp";
import { SOURCE_META, type XpEvent, type XpSource } from "@/lib/domain/xp";
import { logXpHistoryViewed } from "@/lib/analytics";

interface XpHistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    uid: string;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const diff = today.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
            const mins = Math.floor(diff / (1000 * 60));
            return mins <= 1 ? "Hace un momento" : `Hace ${mins} min`;
        }
        return `Hoy · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (days === 1) return "Ayer";
    if (days < 7) return `Hace ${days} días`;
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

type LoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; events: XpEvent[] }
    | { status: "error"; message: string };

export default function XpHistoryDrawer({ open, onClose, uid }: XpHistoryDrawerProps) {
    // Estado discriminado para evitar setState síncrono dentro del effect (react-hooks/set-state-in-effect).
    const [state, setState] = useState<LoadState>({ status: "idle" });

    useEffect(() => {
        if (!open) return;
        logXpHistoryViewed();
        let cancelled = false;
        // Trigger la carga; el estado "loading" se setea solo cuando la promise hace tick (async).
        Promise.resolve()
            .then(() => { if (!cancelled) setState({ status: "loading" }); })
            .then(() => getXpHistory(uid, 30))
            .then((events) => { if (!cancelled) setState({ status: "success", events }); })
            .catch((err) => {
                console.error("[XpHistoryDrawer] load failed:", err);
                if (!cancelled) setState({ status: "error", message: "No pudimos cargar el historial" });
            });
        return () => { cancelled = true; };
    }, [open, uid]);

    const loading = state.status === "loading" || state.status === "idle";
    const error = state.status === "error" ? state.message : null;
    const events = state.status === "success" ? state.events : [];

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        className="fixed inset-0 z-[900] bg-black/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        className="fixed inset-x-0 bottom-0 z-[901] bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col"
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        {/* Handle */}
                        <div className="flex justify-center pt-3 pb-2">
                            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400">
                                <ChevronDown size={28} />
                            </button>
                        </div>

                        {/* Header */}
                        <div className="px-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900">Historial de XP</h2>
                            <button
                                onClick={onClose}
                                aria-label="Cerrar"
                                className="p-1 text-slate-500 hover:text-slate-900"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Lista */}
                        <div className="flex-1 overflow-y-auto px-3 py-2 pb-8">
                            {loading && (
                                <div className="space-y-2 px-2 py-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            )}

                            {error && (
                                <div className="p-6 text-center text-sm text-rose-600">{error}</div>
                            )}

                            {!loading && !error && events.length === 0 && (
                                <div className="p-6 text-center">
                                    <p className="text-sm text-slate-600">Aún no hay eventos.</p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Jugá tu primer partido para empezar a ganar XP.
                                    </p>
                                </div>
                            )}

                            {!loading && !error && events.length > 0 && (
                                <ul className="space-y-1.5">
                                    {events.map((ev) => {
                                        const meta = SOURCE_META[ev.source as XpSource];
                                        const isPositive = ev.amount >= 0;
                                        return (
                                            <li
                                                key={ev.id}
                                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                                            >
                                                <div className="text-xl shrink-0" aria-hidden>
                                                    {meta?.icon ?? "⚡"}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 truncate">
                                                        {ev.reason || meta?.label || ev.source}
                                                    </p>
                                                    <p className="text-xs text-slate-500">{formatDate(ev.createdAt)}</p>
                                                </div>
                                                <div
                                                    className={`text-sm font-bold tabular-nums shrink-0 ${
                                                        isPositive ? "text-emerald-600" : "text-rose-600"
                                                    }`}
                                                >
                                                    {isPositive ? "+" : ""}
                                                    {ev.amount}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
