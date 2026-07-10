"use client";

import { RotateCcw } from "lucide-react";
import { DEFAULT_BOOKING_POLICIES, MAX_BOOKING_POLICIES } from "@/lib/domain/venue";

interface BookingPoliciesEditorProps {
    /** Lista actual de políticas (una por línea en el textarea). */
    policies: string[];
    onChange: (policies: string[]) => void;
}

/**
 * Editor de políticas de reserva de la sede. Una política por línea.
 * El jugador debe aceptarlas antes de reservar. Dejar vacío = sin políticas.
 * Ref: docs/RESERVAS_APROBACION_CREA_RESERVA_SDD.md
 */
export default function BookingPoliciesEditor({ policies, onChange }: BookingPoliciesEditorProps) {
    const nonEmpty = policies.filter((p) => p.trim().length > 0).length;

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="text-sm font-semibold text-slate-700">
                    Políticas de reserva
                </h3>
                <button
                    type="button"
                    onClick={() => onChange([...DEFAULT_BOOKING_POLICIES])}
                    className="flex items-center gap-1 text-xs font-semibold text-[#1f7a4f] hover:underline flex-shrink-0"
                >
                    <RotateCcw className="w-3 h-3" />
                    Usar sugeridas
                </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
                El jugador debe aceptarlas antes de reservar. Escribe <strong>una política por línea</strong>.
                Déjalo vacío para no pedir aceptación.
            </p>
            <textarea
                value={policies.join("\n")}
                onChange={(e) => onChange(e.target.value.split("\n"))}
                rows={8}
                placeholder="Ej: No se permite el uso de guayos con taches."
                className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50 resize-y leading-relaxed"
            />
            <p className={`text-[11px] mt-2 ${nonEmpty > MAX_BOOKING_POLICIES ? "text-rose-500" : "text-slate-400"}`}>
                {nonEmpty} / {MAX_BOOKING_POLICIES} políticas
            </p>
        </div>
    );
}
