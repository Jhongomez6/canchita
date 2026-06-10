"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Crown, Loader2, Check } from "lucide-react";
import { setChampions } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";
import { flagEmoji, type WCMatch, type WCConfig } from "@/lib/domain/worldcup";

/**
 * Form del admin para definir campeón y subcampeón reales del torneo (al final).
 * Llama a la CF setWorldCupChampions, que recalcula el bonus de todos.
 */
export default function AdminChampionsForm({
    matches,
    config,
    onSaved,
}: {
    matches: WCMatch[];
    config: WCConfig;
    onSaved?: () => void;
}) {
    const teams = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of matches) {
            map.set(m.homeTeam.name, m.homeTeam.code);
            map.set(m.awayTeam.name, m.awayTeam.code);
        }
        return Array.from(map.entries()).map(([name, code]) => ({ name, code })).sort((a, b) => a.name.localeCompare(b.name));
    }, [matches]);

    const [champion, setChampion] = useState(config.champion ?? "");
    const [runnerUp, setRunnerUp] = useState(config.runnerUp ?? "");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!champion || !runnerUp) return toast.error("Elegí campeón y subcampeón");
        if (champion === runnerUp) return toast.error("Deben ser distintos");
        setSaving(true);
        try {
            await setChampions(champion, runnerUp);
            toast.success("Campeón definido — leaderboard recalculado");
            onSaved?.();
        } catch (err) {
            handleError(err, "No se pudo definir el campeón");
        } finally {
            setSaving(false);
        }
    };

    const codeOf = (name: string) => teams.find((t) => t.name === name)?.code ?? "";

    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-gray-900">Definir campeón y subcampeón</h2>
            </div>

            {[{ label: "Campeón", value: champion, set: setChampion }, { label: "Subcampeón", value: runnerUp, set: setRunnerUp }].map((f) => (
                <label key={f.label} className="block mb-3">
                    <span className="text-xs font-semibold text-gray-500">{f.label}</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl w-7 text-center">{f.value ? flagEmoji(codeOf(f.value)) : "🏆"}</span>
                        <select
                            value={f.value}
                            disabled={saving}
                            onChange={(e) => f.set(e.target.value)}
                            className="flex-1 h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900"
                        >
                            <option value="">Elegir…</option>
                            {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                        </select>
                    </div>
                </label>
            ))}

            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition"
            >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" />{config.champion ? "Actualizar campeón" : "Definir campeón"}</>}
            </button>
        </div>
    );
}
