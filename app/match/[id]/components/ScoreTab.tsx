"use client";

import { useState } from "react";
import ScoreInput from "./ScoreInput";
import { Trophy, CheckCircle2, AlertCircle, Undo2, Save, Loader2, Lock } from "lucide-react";

interface ScoreTabProps {
  scoreA: number;
  scoreB: number;
  isClosed: boolean;
  hasUnsavedScore: boolean;
  onScoreAChange: (score: number) => void;
  onScoreBChange: (score: number) => void;
  onSaveScore: (sa: number, sb: number) => Promise<void>;
  onDiscardScore: () => void;
}

export default function ScoreTab({
  scoreA,
  scoreB,
  isClosed,
  hasUnsavedScore,
  onScoreAChange,
  onScoreBChange,
  onSaveScore,
  onDiscardScore,
}: ScoreTabProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await onSaveScore(scoreA, scoreB);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="tabpanel" id="panel-score" className="space-y-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Trophy size={18} className="text-[#1f7a4f]" /> Marcador del partido
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          {isClosed
            ? "El partido está cerrado. El marcador no se puede modificar."
            : "Ingresa el resultado final antes de cerrar el partido."}
        </p>

        <ScoreInput
          scoreA={scoreA}
          scoreB={scoreB}
          onScoreAChange={onScoreAChange}
          onScoreBChange={onScoreBChange}
          disabled={isClosed}
        />

        {!isClosed && (
          <div className="mt-4">
            {hasUnsavedScore ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                <span className="text-xs font-bold text-amber-600 flex-1 flex items-center gap-1.5">
                  {saved ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {saved ? "Marcador guardado" : "Marcador sin guardar"}
                </span>
                <button
                  onClick={onDiscardScore}
                  className="text-xs font-bold px-2.5 py-1.5 bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Undo2 size={14} /> Deshacer
                </button>
                <button
                  disabled={saving}
                  onClick={handleSave}
                  className="text-xs font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold border border-emerald-200 text-center">
                <CheckCircle2 size={14} /> Marcador guardado — listo para cerrar el partido
              </div>
            )}
          </div>
        )}

        {isClosed && (
          <div className="mt-4 bg-slate-50 text-slate-500 px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 text-center flex items-center justify-center gap-2">
            <Lock size={14} /> Partido cerrado
          </div>
        )}
      </div>
    </div>
  );
}
