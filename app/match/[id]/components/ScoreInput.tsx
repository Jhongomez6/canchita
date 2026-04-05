import { Shield, Plus, Minus } from "lucide-react";

interface ScoreInputProps {
  scoreA: number;
  scoreB: number;
  onScoreAChange: (score: number) => void;
  onScoreBChange: (score: number) => void;
  disabled?: boolean;
}

export default function ScoreInput({
  scoreA,
  scoreB,
  onScoreAChange,
  onScoreBChange,
  disabled = false,
}: ScoreInputProps) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mb-3">
        Marcador
      </h4>
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-bold text-red-500 uppercase mb-1 flex items-center gap-1">
            <Shield size={10} fill="#ef4444" /> A
          </div>
          <div className="flex items-center gap-1.5">
            {!disabled && (
              <button
                onClick={() => onScoreAChange(Math.max(0, scoreA - 1))}
                disabled={scoreA <= 0}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors disabled:opacity-50"
              >
                <Minus size={14} />
              </button>
            )}
            <input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => onScoreAChange(Math.max(0, Number(e.target.value)))}
              disabled={disabled}
              className="w-14 h-14 text-2xl text-center font-black bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 outline-none transition-all disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {!disabled && (
              <button
                onClick={() => onScoreAChange(scoreA + 1)}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="text-3xl text-slate-300 font-thin mt-4">—</div>

        <div className="flex flex-col items-center">
          <div className="text-[10px] font-bold text-blue-500 uppercase mb-1 flex items-center gap-1">
            <Shield size={10} fill="#3b82f6" /> B
          </div>
          <div className="flex items-center gap-1.5">
            {!disabled && (
              <button
                onClick={() => onScoreBChange(Math.max(0, scoreB - 1))}
                disabled={scoreB <= 0}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors disabled:opacity-50"
              >
                <Minus size={14} />
              </button>
            )}
            <input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => onScoreBChange(Math.max(0, Number(e.target.value)))}
              disabled={disabled}
              className="w-14 h-14 text-2xl text-center font-black bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none transition-all disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {!disabled && (
              <button
                onClick={() => onScoreBChange(scoreB + 1)}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
