"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface TeamBalanceFeedbackProps {
  feedback: Record<string, "up" | "down">;
  userUid: string;
  canVote: boolean;
  /** El creador ve el conteo siempre; los demás, solo después de votar. */
  isCreator: boolean;
  onVote: (value: "up" | "down") => Promise<void>;
}

const LABEL: Record<"up" | "down", string> = { up: "Parejos", down: "Desbalanceados" };

/**
 * Termómetro rápido: ¿los equipos quedaron parejos? Un 👍/👎 por jugador.
 * El voto es definitivo (no se puede cambiar) y pide una confirmación inline no invasiva.
 * El conteo se revela al votar (evita sesgo de arrastre); el creador lo ve siempre.
 */
export default function TeamBalanceFeedback({
  feedback,
  userUid,
  canVote,
  isCreator,
  onVote,
}: TeamBalanceFeedbackProps) {
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<"up" | "down" | null>(null);

  const myVote = feedback[userUid] ?? null;
  const up = Object.values(feedback).filter((v) => v === "up").length;
  const down = Object.values(feedback).filter((v) => v === "down").length;
  const total = up + down;

  const locked = myVote !== null;
  const revealed = locked || isCreator;
  const active = (v: "up" | "down") => myVote === v || pending === v;
  const pctUp = total > 0 ? Math.round((up / total) * 100) : 0;
  const pctDown = 100 - pctUp;

  async function confirm() {
    if (!pending || submitting) return;
    setSubmitting(true);
    try {
      await onVote(pending);
    } finally {
      setSubmitting(false);
      setPending(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4">
      <p className="text-sm font-bold text-slate-700 text-center mb-3">
        ¿Los equipos quedaron parejos?
      </p>

      <div className="flex gap-2">
        <button
          disabled={locked || submitting || !canVote}
          onClick={() => !locked && canVote && setPending("up")}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.98] disabled:opacity-60 ${
            active("up")
              ? "bg-emerald-50 border-emerald-400 text-emerald-700"
              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
          }`}
        >
          <ThumbsUp size={18} /> Parejos
        </button>
        <button
          disabled={locked || submitting || !canVote}
          onClick={() => !locked && canVote && setPending("down")}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.98] disabled:opacity-60 ${
            active("down")
              ? "bg-red-50 border-red-400 text-red-700"
              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
          }`}
        >
          <ThumbsDown size={18} /> Desbalanceados
        </button>
      </div>

      {/* Confirmación inline no invasiva */}
      {pending && !locked && (
        <div className="mt-2 flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="text-[11px] font-medium text-slate-600 leading-tight">
            Confirmar &quot;{LABEL[pending]}&quot;. Tu opinión no se puede cambiar.
          </span>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={confirm}
              disabled={submitting}
              className="text-xs font-bold text-white bg-emerald-600 px-3 py-1 rounded-full active:scale-95 transition-transform disabled:opacity-50"
            >
              Sí
            </button>
            <button
              onClick={() => setPending(null)}
              className="text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1 rounded-full"
            >
              No
            </button>
          </div>
        </div>
      )}

      {/* Resultado revelado: barra + porcentajes */}
      {revealed && total > 0 && (
        <div className="mt-3">
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
            {up > 0 && <div className="bg-emerald-400" style={{ width: `${pctUp}%` }} />}
            {down > 0 && <div className="bg-red-400" style={{ width: `${pctDown}%` }} />}
          </div>
          <div className="flex justify-between text-[11px] font-bold mt-1">
            <span className="text-emerald-600">{pctUp}% parejos ({up})</span>
            <span className="text-red-500">({down}) {pctDown}% desbalanceados</span>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1">
            {total} {total === 1 ? "opinión" : "opiniones"}
          </p>
        </div>
      )}

      {/* Estado */}
      {locked ? (
        <p className="text-[11px] text-emerald-600 font-medium text-center mt-2">
          ¡Gracias por tu opinión!
        </p>
      ) : !canVote ? (
        <p className="text-[11px] text-slate-400 text-center mt-2">
          Confirma tu asistencia para opinar
        </p>
      ) : null}
    </div>
  );
}
