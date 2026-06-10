"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Trophy, Lock, Loader2, Check } from "lucide-react";
import { saveBracketPrediction } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";
import {
    flagEmoji,
    isBracketLocked,
    WC_CHAMPION_POINTS,
    WC_RUNNERUP_POINTS,
    type WCMatch,
    type WCBracketPrediction,
    type WCConfig,
} from "@/lib/domain/worldcup";

/**
 * Card de predicción de campeón y subcampeón del torneo (bonus).
 * Editable hasta el deadline (inicio del 2º día). Tras el deadline se bloquea;
 * cuando el admin carga el resultado real, muestra el bonus obtenido.
 */
export default function BracketPredictor({
    matches,
    userId,
    snapshot,
    config,
    existing,
    onSaved,
}: {
    matches: WCMatch[];
    userId: string;
    snapshot: { displayName: string; photoURLThumb?: string };
    config: WCConfig;
    existing?: WCBracketPrediction | null;
    onSaved: (champion: string, runnerUp: string) => void;
}) {
    // Lista de selecciones únicas (ordenadas) derivada de los partidos
    const teams = useMemo(() => {
        const map = new Map<string, string>(); // name -> code
        for (const m of matches) {
            map.set(m.homeTeam.name, m.homeTeam.code);
            map.set(m.awayTeam.name, m.awayTeam.code);
        }
        return Array.from(map.entries())
            .map(([name, code]) => ({ name, code }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [matches]);

    const [champion, setChampion] = useState(existing?.champion ?? "");
    const [runnerUp, setRunnerUp] = useState(existing?.runnerUp ?? "");
    const [saving, setSaving] = useState(false);

    const locked = isBracketLocked(config.bracketDeadlineMs);
    const resolved = Boolean(config.champion && config.runnerUp);

    const handleSave = async () => {
        if (!champion || !runnerUp) {
            toast.error("Elegí campeón y subcampeón");
            return;
        }
        if (champion === runnerUp) {
            toast.error("Campeón y subcampeón deben ser distintos");
            return;
        }
        setSaving(true);
        try {
            await saveBracketPrediction(userId, champion, runnerUp, snapshot, existing?.createdAt);
            toast.success("¡Predicción de campeón guardada!");
            onSaved(champion, runnerUp);
        } catch (err) {
            handleError(err, "No se pudo guardar tu predicción de campeón");
        } finally {
            setSaving(false);
        }
    };

    const codeOf = (name: string) => teams.find((t) => t.name === name)?.code ?? "";

    return (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-gray-900">Campeón y Subcampeón</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">
                Bonus: campeón {WC_CHAMPION_POINTS} pts · subcampeón {WC_RUNNERUP_POINTS} pts.
                {!locked && " Editable hasta el inicio del 2º día."}
            </p>

            {/* Resuelto: mostrar resultado real + acierto */}
            {resolved ? (
                <div className="space-y-2 text-sm">
                    <ResultRow
                        label="Campeón"
                        real={config.champion!}
                        realCode={codeOf(config.champion!)}
                        mine={existing?.champion}
                        mineCode={existing ? codeOf(existing.champion) : ""}
                        points={WC_CHAMPION_POINTS}
                        hit={existing?.champion === config.champion}
                    />
                    <ResultRow
                        label="Subcampeón"
                        real={config.runnerUp!}
                        realCode={codeOf(config.runnerUp!)}
                        mine={existing?.runnerUp}
                        mineCode={existing ? codeOf(existing.runnerUp) : ""}
                        points={WC_RUNNERUP_POINTS}
                        hit={existing?.runnerUp === config.runnerUp}
                    />
                </div>
            ) : locked ? (
                // Cerrado, sin resultado aún: mostrar mi elección
                <div className="text-sm text-gray-700">
                    {existing ? (
                        <ul className="space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="text-gray-400 w-24">Campeón:</span>
                                <span className="text-lg">{flagEmoji(codeOf(existing.champion))}</span>
                                <span className="font-semibold">{existing.champion}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-gray-400 w-24">Subcampeón:</span>
                                <span className="text-lg">{flagEmoji(codeOf(existing.runnerUp))}</span>
                                <span className="font-semibold">{existing.runnerUp}</span>
                            </li>
                        </ul>
                    ) : (
                        <p className="flex items-center gap-1 text-gray-400">
                            <Lock className="w-4 h-4" /> No elegiste a tiempo
                        </p>
                    )}
                </div>
            ) : (
                // Abierto: selectores
                <div className="space-y-3">
                    <TeamSelect label="Campeón" value={champion} teams={teams} disabled={saving} onChange={setChampion} />
                    <TeamSelect label="Subcampeón" value={runnerUp} teams={teams} disabled={saving} onChange={setRunnerUp} />
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" />{existing ? "Actualizar" : "Guardar"}</>}
                    </button>
                </div>
            )}
        </div>
    );
}

function TeamSelect({
    label,
    value,
    teams,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    teams: { name: string; code: string }[];
    disabled: boolean;
    onChange: (v: string) => void;
}) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-gray-500">{label}</span>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-xl w-7 text-center">{value ? flagEmoji(teams.find((t) => t.name === value)?.code ?? "") : "🏆"}</span>
                <select
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    className="flex-1 h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900"
                >
                    <option value="">Elegir…</option>
                    {teams.map((t) => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                </select>
            </div>
        </label>
    );
}

function ResultRow({
    label, real, realCode, mine, mineCode, points, hit,
}: {
    label: string; real: string; realCode: string;
    mine?: string; mineCode: string; points: number; hit: boolean;
}) {
    return (
        <div className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-3 py-2">
            <div>
                <p className="text-[11px] text-gray-400">{label} real</p>
                <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                    <span className="text-lg">{flagEmoji(realCode)}</span>{real}
                </p>
                {mine && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                        Tu elección: {flagEmoji(mineCode)} {mine}
                    </p>
                )}
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${hit ? "bg-[#1f7a4f] text-white" : "bg-gray-200 text-gray-500"}`}>
                {hit ? `+${points}` : "0"}
            </span>
        </div>
    );
}
