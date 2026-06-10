"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { savePrediction } from "@/lib/worldcup";
import { logWorldCupPredictionSaved } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import { flagEmoji, type WCMatch, type WCPrediction } from "@/lib/domain/worldcup";
import GoalStepper from "./GoalStepper";

/**
 * Inputs +/- para que el usuario ingrese o edite su predicción de un partido.
 * Solo se renderiza cuando el partido está abierto (now < kickoff).
 */
export default function PredictionInput({
    match,
    userId,
    snapshot,
    existing,
    onSaved,
}: {
    match: WCMatch;
    userId: string;
    snapshot: { displayName: string; photoURLThumb?: string };
    existing?: WCPrediction;
    onSaved?: (home: number, away: number) => void;
}) {
    const [home, setHome] = useState(existing?.homeGoals ?? 0);
    const [away, setAway] = useState(existing?.awayGoals ?? 0);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await savePrediction(userId, match.id, home, away, snapshot);
            logWorldCupPredictionSaved(match.id, home, away);
            toast.success(existing ? "Predicción actualizada" : "¡Predicción guardada!");
            onSaved?.(home, away);
        } catch (err) {
            handleError(err, "No se pudo guardar tu predicción");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-4">
                <GoalStepper
                    label={`${flagEmoji(match.homeTeam.code)} ${match.homeTeam.name}`}
                    value={home}
                    onChange={setHome}
                    disabled={saving}
                />
                <span className="text-gray-300 font-bold">-</span>
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
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : existing ? "Actualizar predicción" : "Guardar predicción"}
            </button>
        </div>
    );
}
