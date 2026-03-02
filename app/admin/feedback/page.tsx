"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/lib/AuthContext";
import { getAllFeedback, resolveFeedback } from "@/lib/admin-feedback";
import type { Feedback } from "@/lib/domain/feedback";
import { formatDateSpanish } from "@/lib/date";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import FeedbackListSkeleton from "@/components/skeletons/FeedbackListSkeleton";

export default function AdminFeedbackPage() {
    const { user, profile } = useAuth();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    useEffect(() => {
        if (!profile) return;
        const admin = profile.roles.includes("admin");
        setIsAdmin(admin);
        if (admin) {
            loadData();
        } else {
            setLoading(false);
        }
    }, [profile]);

    async function loadData() {
        try {
            setLoading(true);
            const data = await getAllFeedback();
            setFeedbacks(data);
        } catch (error) {
            console.error("Error loading feedback", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleResolve(feedbackId: string) {
        setResolvingId(feedbackId);
        try {
            const result = await resolveFeedback(feedbackId);
            if (result.pushSent) {
                toast.success("✅ Resuelto y usuario notificado (push + in-app)");
            } else {
                toast.success("✅ Resuelto y notificación in-app creada");
            }
            await loadData();
        } catch (err: unknown) {
            handleError(err, "Error al resolver feedback");
        } finally {
            setResolvingId(null);
        }
    }

    function getResolveLabel(type: string): string {
        switch (type) {
            case "bug": return "🔧 Marcar Solucionado";
            case "idea": return "💡 Marcar Aplicado";
            default: return "✅ Marcar Atendido";
        }
    }

    if (loading) {
        return (
            <AuthGuard>
                <FeedbackListSkeleton />
            </AuthGuard>
        );
    }

    // 🛡️ Protección Admin-only
    if (isAdmin === false) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado 🛑</h1>
                <p className="text-slate-500">No tienes permisos para ver el panel de Feedback.</p>
            </div>
        );
    }

    const unresolvedCount = feedbacks.filter(f => f.status !== "resolved").length;

    return (
        <AuthGuard>
            <main className="min-h-screen bg-slate-50 pb-28 md:pb-8">
                <div className="max-w-4xl mx-auto p-4 md:p-8">

                    <div className="mb-6 bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 text-amber-50 shadow-lg text-center md:text-left flex flex-col md:flex-row items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                <span className="text-3xl drop-shadow-sm">📣</span> Feedback Recibido
                            </h1>
                            <p className="text-sm text-amber-100 font-medium">Bugs e ideas reportadas por los jugadores (Beta).</p>
                        </div>

                        <div className="mt-4 md:mt-0 flex gap-3">
                            <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/20">
                                <span className="text-xl font-bold text-white">{feedbacks.length}</span> totales
                            </div>
                            {unresolvedCount > 0 && (
                                <div className="bg-red-500/30 px-4 py-2 rounded-xl backdrop-blur-sm border border-red-300/30">
                                    <span className="text-xl font-bold text-white">{unresolvedCount}</span> pendientes
                                </div>
                            )}
                        </div>
                    </div>

                    {feedbacks.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-300">
                            <span className="text-4xl block mb-2 opacity-50">🦗</span>
                            <p className="text-slate-500 font-bold mb-1">Aún no hay feedback</p>
                            <p className="text-xs text-slate-400">Todo parece funcionar de maravilla.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {feedbacks.map((f) => (
                                <div key={f.id} className={`bg-white border rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden group ${f.status === "resolved" ? "border-emerald-200 opacity-75" : "border-slate-200"}`}>
                                    {/* Etiqueta Visual por tipo */}
                                    <div className={`absolute top-0 right-0 px-3 py-1 text-[10px] font-bold rounded-bl-xl uppercase tracking-wider ${f.type === 'bug' ? 'bg-red-100 text-red-700' :
                                        f.type === 'idea' ? 'bg-emerald-100 text-emerald-700' :
                                            'bg-blue-100 text-blue-700'
                                        }`}>
                                        {f.type === 'bug' ? '🐛 Bug' : f.type === 'idea' ? '💡 Idea' : '💬 Otro'}
                                    </div>

                                    {/* Badge Resuelto */}
                                    {f.status === "resolved" && (
                                        <div className="absolute top-0 left-0 px-3 py-1 text-[10px] font-bold rounded-br-xl bg-emerald-500 text-white uppercase tracking-wider">
                                            ✅ Resuelto
                                        </div>
                                    )}

                                    <div className="mb-3 pr-16 text-xs text-slate-400 font-medium">
                                        {formatDateSpanish(f.createdAt.split('T')[0])}
                                    </div>

                                    <p className="text-sm font-semibold text-slate-700 mb-3 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                                        &quot;{f.message}&quot;
                                    </p>

                                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                        <div className="text-xs font-bold text-slate-500">
                                            👤 {f.userName}
                                        </div>
                                        {f.urlContext && (
                                            <div className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded truncate max-w-[120px]" title={f.urlContext}>
                                                {f.urlContext.replace('https://la-canchita.vercel.app', '')}
                                            </div>
                                        )}
                                    </div>

                                    {/* BOTÓN DE RESOLUCIÓN */}
                                    {f.status !== "resolved" && f.id && (
                                        <button
                                            onClick={() => handleResolve(f.id!)}
                                            disabled={resolvingId === f.id}
                                            className={`w-full mt-3 py-2.5 rounded-xl text-xs font-bold transition-all ${resolvingId === f.id
                                                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                : f.type === "bug"
                                                    ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                                                    : f.type === "idea"
                                                        ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200"
                                                        : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                                                }`}
                                        >
                                            {resolvingId === f.id ? "⏳ Notificando..." : getResolveLabel(f.type)}
                                        </button>
                                    )}

                                    {/* TIMESTAMP RESUELTO */}
                                    {f.status === "resolved" && f.resolvedAt && (
                                        <div className="mt-3 text-[10px] text-emerald-600 font-medium text-center">
                                            Resuelto el {formatDateSpanish(f.resolvedAt.split('T')[0])}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </AuthGuard>
    );
}
