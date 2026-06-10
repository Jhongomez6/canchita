"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Trophy, Gift, Target } from "lucide-react";
import {
    WC_CHAMPION_POINTS,
    WC_RUNNERUP_POINTS,
    WC_PRIZE_FREE_MATCHES,
} from "@/lib/domain/worldcup";

/**
 * Bottom sheet con las reglas de puntaje, el bonus de campeón y el premio.
 */
export default function WorldCupRules({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/40"
                    />
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto md:max-w-lg md:mx-auto"
                    >
                        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-bold text-gray-900">¿Cómo funciona?</h2>
                            <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-5 py-5 space-y-6 pb-8">
                            {/* Puntaje por partido */}
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <Target className="w-5 h-5 text-[#1f7a4f]" />
                                    <h3 className="font-bold text-gray-900">Puntaje por partido</h3>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">Predecí el marcador de cada partido antes de que empiece.</p>
                                <ul className="space-y-2">
                                    <RuleRow points="3" color="bg-[#1f7a4f]" text="Marcador exacto (ej. predecís 2-1 y sale 2-1)" />
                                    <RuleRow points="1" color="bg-blue-500" text="Resultado correcto: acertás quién gana o el empate, pero no el marcador exacto" />
                                    <RuleRow points="0" color="bg-gray-300" text="Sin acierto" />
                                </ul>
                            </section>

                            {/* Bonus campeón */}
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <Trophy className="w-5 h-5 text-amber-500" />
                                    <h3 className="font-bold text-gray-900">Bonus: Campeón y Subcampeón</h3>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">
                                    Elegí quién sale campeón y subcampeón <strong>antes del 2º día</strong> del Mundial. Después se cierra.
                                </p>
                                <ul className="space-y-2">
                                    <RuleRow points={`+${WC_CHAMPION_POINTS}`} color="bg-amber-500" text="Acertás el campeón" />
                                    <RuleRow points={`+${WC_RUNNERUP_POINTS}`} color="bg-amber-400" text="Acertás el subcampeón" />
                                </ul>
                            </section>

                            {/* Premio */}
                            <section className="rounded-2xl bg-gradient-to-br from-[#1f7a4f] to-[#155c3b] p-5 text-white">
                                <div className="flex items-center gap-2 mb-2">
                                    <Gift className="w-5 h-5" />
                                    <h3 className="font-bold">El premio</h3>
                                </div>
                                <p className="text-sm text-white/90">
                                    Quien quede <strong>1º en la tabla</strong> al final del Mundial gana{" "}
                                    <strong>{WC_PRIZE_FREE_MATCHES} partidos gratis</strong>: no paga su cuota en esos {WC_PRIZE_FREE_MATCHES} partidos. 🎉
                                </p>
                            </section>

                            <p className="text-xs text-gray-400 text-center">
                                Una vez que empieza un partido ya no podés cambiar tu predicción, y se revelan las de todos.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function RuleRow({ points, color, text }: { points: string; color: string; text: string }) {
    return (
        <li className="flex items-center gap-3">
            <span className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-white text-sm font-bold ${color}`}>
                {points}
            </span>
            <span className="text-sm text-gray-700">{text}</span>
        </li>
    );
}
