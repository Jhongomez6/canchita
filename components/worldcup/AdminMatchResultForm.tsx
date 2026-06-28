"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2 } from "lucide-react";
import { updateMatchResult } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";
import { flagEmoji, matchStageLabel, type WCMatch } from "@/lib/domain/worldcup";
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
    const [advanced, setAdvanced] = useState<"home" | "away" | null>(match.advancedTeam ?? null);
    const [saving, setSaving] = useState(false);

    const isFinished = match.status === "FINISHED";
    // En eliminación, un empate se define por penales → hay que indicar quién avanzó.
    const isKnockout = match.phase !== "GROUP_STAGE";
    const needsAdvance = isKnockout && home === away;

    const handleSave = async () => {
        if (needsAdvance && advanced === null) {
            toast.error("Indicá qué equipo avanzó por penales");
            return;
        }
        setSaving(true);
        try {
            await updateMatchResult(match.id, home, away, needsAdvance ? advanced! : undefined);
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
                <span className="text-xs font-semibold text-gray-400">{matchStageLabel(match)}</span>
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

            {needsAdvance && (
                <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">
                        Empate — ¿quién avanzó por penales?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {(["home", "away"] as const).map((side) => {
                            const team = side === "home" ? match.homeTeam : match.awayTeam;
                            const selected = advanced === side;
                            return (
                                <button
                                    key={side}
                                    type="button"
                                    onClick={() => setAdvanced(side)}
                                    disabled={saving}
                                    className={`h-11 rounded-xl border text-base font-semibold transition active:scale-[0.99] ${
                                        selected
                                            ? "border-[#1f7a4f] bg-[#1f7a4f]/10 text-[#1f7a4f]"
                                            : "border-gray-200 text-gray-600"
                                    }`}
                                >
                                    {flagEmoji(team.code)} {team.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

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
