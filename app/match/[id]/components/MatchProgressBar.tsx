"use client";

import type { MatchPhase } from "@/lib/domain/match";

interface MatchProgressBarProps {
  phase: MatchPhase;
}

const STEPS = [
  { key: "recruiting", label: "Jugadores", icon: "👥" },
  { key: "full", label: "Equipos", icon: "⚖️" },
  { key: "gameday", label: "Juego", icon: "⚽" },
  { key: "postgame", label: "Marcador", icon: "🏆" },
  { key: "closed", label: "Cerrado", icon: "🔒" },
] as const;

const PHASE_INDEX: Record<MatchPhase, number> = {
  recruiting: 0,
  full: 1,
  gameday: 2,
  postgame: 3,
  closed: 4,
};

export default function MatchProgressBar({ phase }: MatchProgressBarProps) {
  const currentIndex = PHASE_INDEX[phase];

  return (
    <div className="flex items-center justify-between w-full py-3">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isCompleted
                    ? "bg-emerald-500 text-white shadow-sm"
                    : isCurrent
                      ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500 ring-offset-1 animate-pulse"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {isCompleted ? "✓" : step.icon}
              </div>
              <span
                className={`text-[10px] font-bold ${
                  isCompleted
                    ? "text-emerald-600"
                    : isCurrent
                      ? "text-emerald-700"
                      : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 mt-[-16px] ${
                  i < currentIndex ? "bg-emerald-500" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
