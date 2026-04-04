"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { usePathname } from "next/navigation";
import { submitFeedback } from "@/lib/feedback";
import { handleError } from "@/lib/utils/error";
import { toast } from "react-hot-toast";

export default function BetaFeedbackWidget() {
    const { user, profile } = useAuth();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<'bug' | 'idea' | 'other'>('idea');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hiddenByModal, setHiddenByModal] = useState(false);

    useEffect(() => {
        const show = () => setHiddenByModal(true);
        const hide = () => setHiddenByModal(false);
        window.addEventListener("bottomsheet:open", show);
        window.addEventListener("bottomsheet:close", hide);
        return () => {
            window.removeEventListener("bottomsheet:open", show);
            window.removeEventListener("bottomsheet:close", hide);
        };
    }, []);

    // Si no está autenticado, no mostramos el widget
    if (!user) return null;

    // Ocultar en la página admin de partido (tiene su propio FAB)
    if (pathname.startsWith("/match/")) return null;

    // Ocultar cuando hay un bottom sheet abierto
    if (hiddenByModal) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        try {
            await submitFeedback(
                user.uid,
                profile?.name || user.displayName || 'Usuario',
                type,
                message,
                window.location.pathname + window.location.search
            );
            toast.success("¡Gracias por tu feedback! Nos ayuda muchísimo.");
            setIsOpen(false);
            setMessage('');
            setType('idea');
        } catch (error) {
            handleError(error, "No pudimos enviar tu feedback, intenta de nuevo.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {/* Botón flotante */}
            <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-[100]">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-14 h-14 bg-gradient-to-tr from-amber-500 to-amber-400 text-amber-950 rounded-full shadow-xl flex items-center justify-center text-2xl border-2 border-amber-300 transform transition-all hover:scale-105 active:scale-95 ${isOpen ? 'rotate-45' : ''}`}
                    aria-label="Dar feedback"
                >
                    {isOpen ? '❌' : '💬'}
                </button>
            </div>

            {/* Modal / Formulario */}
            {isOpen && (
                <>
                    {/* Overlay transparente para cerrar al tocar fuera */}
                    <div
                        className="fixed inset-0 z-[90] bg-black/10 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />

                    <div className="fixed bottom-40 right-4 left-4 md:left-auto md:bottom-28 md:right-8 md:w-96 z-[100] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-in slide-in-from-bottom-5 fade-in duration-200">
                        <div className="bg-gradient-to-r from-amber-100 to-amber-50 p-5 border-b border-amber-200">
                            <h3 className="font-bold text-amber-900 flex items-center gap-2">
                                <span className="text-xl">🚀</span> Beta Feedback
                            </h3>
                            <p className="text-xs text-amber-700/80 mt-1 font-medium">Ayúdanos a mejorar La Canchita</p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                    ¿Qué nos quieres contar?
                                </label>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setType('idea')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'idea' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"}`}
                                    >
                                        💡 Idea
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('bug')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'bug' ? "bg-white text-red-600 shadow-sm" : "text-slate-500"}`}
                                    >
                                        🐛 Error
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('other')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'other' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                                    >
                                        💬 Otro
                                    </button>
                                </div>
                            </div>

                            <div className="mb-4">
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder={
                                        type === 'bug' ? "¿Qué falló y qué hacías?" :
                                            type === 'idea' ? "¿Qué podríamos agregar o mejorar?" :
                                                "Cuéntanos tu opinión..."
                                    }
                                    required
                                    rows={4}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors resize-none"
                                />
                            </div>

                            <div className="flex gap-2 antialiased">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-3 bg-slate-100 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !message.trim()}
                                    className="flex-1 py-3 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                                >
                                    {isSubmitting ? "Enviando..." : "Enviar Feedback"}
                                </button>
                            </div>
                        </form>
                    </div>
                </>
            )}
        </>
    );
}
