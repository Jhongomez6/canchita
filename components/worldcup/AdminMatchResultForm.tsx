"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2 } from "lucide-react";
import { updateMatchResult } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";
import { flagEmoji, type WCMatch } from "@/lib/domain/worldcup";
import GoalStepper from "./GoalStepper";

/**
 * Form del admin para cargar/corregir el resultado de un partido.
 * Llama a la CF updateWorldCupMatchResult, que dispara el recálculo del leaderboard.
 */
export default function AdminMatchResultForm({
    match,
    onSaved,
}: {
    match: WCMatch;
    onSaved?: () => void;
}) {
    const [home, setHome] = useState(match.score.home ?? 0);
    const [away, setAway] = useState(match.score.away ?? 0);
    const [saving, setSaving] = useState(false);

    const isFinished = match.status === "FINISHED";

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateMatchResult(match.id, home, away);
            toast.success(isFinished ? "Resultado corregido" : "Resultado cargado");
            onSaved?.();
        } catch (err) {
            handleError(err, "No se pudo guardar el resultado");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-400">{match.group}</span>
                {isFinished && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#1f7a4f] bg-[#1f7a4f]/10 px-2 py-0.5 rounded-full">
                        Finalizado
                    </span>
                )}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-4">
                <GoalStepper
                    label={`${flagEmoji(match.homeTeam.code)} ${match.homeTeam.name}`}
                    value={home}
                    onChange={setHome}
                    disabled={saving}
                />
                <span className="text-gray-300 font-bold">vs</span>
                <GoalStepper
                    label={`${flagEmoji(match.awayTeam.code)} ${match.awayTeam.name}`}
                    value={away}
                    onChange={setAway}
                    disabled={saving}
                />
            </div>

            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-[#1f7a4f] text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition"
            >
                {saving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <>
                        <Check className="w-5 h-5" />
                        {isFinished ? "Corregir resultado" : "Confirmar resultado"}
                    </>
                )}
            </button>
        </div>
    );
}
