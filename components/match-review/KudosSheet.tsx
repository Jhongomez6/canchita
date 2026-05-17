"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { KudoType } from "@/lib/domain/matchReview";
import { KUDO_META, KUDO_TYPES } from "@/lib/domain/matchReview";

interface Props {
    open: boolean;
    recipientName: string;
    currentKudo: KudoType | null;
    onSelect: (type: KudoType | null) => void;
    onClose: () => void;
}

export default function KudosSheet({ open, recipientName, currentKudo, onSelect, onClose }: Props) {
    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 z-[100]"
                        onClick={onClose}
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto max-h-[85vh] overflow-y-auto pb-safe"
                    >
                        {/* Handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 bg-slate-200 rounded-full" />
                        </div>

                        <div className="px-5 pb-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Reconocer a</p>
                                    <h3 className="text-base font-bold text-slate-800">{recipientName}</h3>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
                                >
                                    <X size={16} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Kudo options */}
                            <div className="space-y-2.5">
                                {KUDO_TYPES.map((type) => {
                                    const { emoji, label } = KUDO_META[type];
                                    const selected = currentKudo === type;
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => {
                                                onSelect(selected ? null : type);
                                                onClose();
                                            }}
                                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.97] ${
                                                selected
                                                    ? "bg-amber-50 border-amber-300"
                                                    : "bg-slate-50 border-transparent hover:bg-slate-100"
                                            }`}
                                        >
                                            <span className="text-2xl w-8 text-center">{emoji}</span>
                                            <span className={`text-base font-semibold ${selected ? "text-amber-700" : "text-slate-700"}`}>
                                                {label}
                                            </span>
                                            {selected && (
                                                <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                                    Seleccionado
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {currentKudo && (
                                <button
                                    type="button"
                                    onClick={() => { onSelect(null); onClose(); }}
                                    className="w-full mt-3 py-2.5 text-sm text-slate-400 font-medium hover:text-slate-600 transition-colors"
                                >
                                    Quitar reconocimiento
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
