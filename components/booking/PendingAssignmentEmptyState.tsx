"use client";

import { Clock4, Mail } from "lucide-react";

export default function PendingAssignmentEmptyState() {
    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
                    <h1 className="text-xl font-bold text-white">Tu cuenta está activa</h1>
                    <p className="text-sm text-white/70 mt-1">
                        Estamos preparando tu sede
                    </p>
                </div>

                <div className="px-4 mt-8">
                    <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
                            <Clock4 className="w-8 h-8 text-amber-500" />
                        </div>

                        <h2 className="text-lg font-bold text-slate-800 mb-2">
                            Esperando asignación de sede
                        </h2>
                        <p className="text-sm text-slate-500 leading-relaxed mb-6">
                            Un administrador de La Canchita está revisando tu cuenta y asignando tu sede. Te avisaremos en cuanto puedas empezar a gestionar reservas.
                        </p>

                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5" />
                                ¿Necesitas ayuda?
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Si llevas más de 24 horas esperando, contáctanos para acelerar el proceso.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
