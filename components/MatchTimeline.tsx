"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Shield, Trophy, Lock, Check } from "lucide-react";
import type { Match } from "@/lib/domain/match";
import { getMatchTimelineState, type TimelineStep } from "@/lib/domain/match";
import { logTooltipOpened } from "@/lib/analytics";

interface MatchTimelineProps {
  match: Match;
  confirmedCount: number;
}

const STEP_CONFIG: Record<
  TimelineStep,
  {
    icon: typeof Users;
    label: string;
    tooltip: string;
    getSubtitle: (match: Match, confirmedCount: number) => string;
  }
> = {
  joining: {
    icon: Users,
    label: "Confirmando jugadores",
    tooltip: "Los jugadores están confirmando asistencia. El partido avanza cuando se completen los cupos.",
    getSubtitle: (match, confirmedCount) =>
      `${confirmedCount}/${match.maxPlayers} confirmados`,
  },
  teams_confirmed: {
    icon: Shield,
    label: "Equipos definidos",
    tooltip: "El organizador ya armó los equipos. Revisa abajo a qué equipo perteneces.",
    getSubtitle: () => "Revisa tu equipo abajo",
  },
  mvp_voting: {
    icon: Trophy,
    label: "Votación MVP",
    tooltip: "MVP (Most Valuable Player) es el Jugador Más Valioso del partido. Vota por la figura de la cancha antes de que cierre la votación.",
    getSubtitle: () => "Vota por la figura del partido",
  },
  closed: {
    icon: Lock,
    label: "Partido completado",
    tooltip: "El partido finalizó y las estadísticas fueron procesadas. ¡Nos vemos en un siguiente partido en La Canchita!",
    getSubtitle: () => "Resultado final registrado",
  },
};

const STEPS: TimelineStep[] = [
  "joining",
  "teams_confirmed",
  "mvp_voting",
  "closed",
];

const STEP_LABELS: Record<TimelineStep, string> = {
  joining: "Jugadores",
  teams_confirmed: "Equipos",
  mvp_voting: "MVP",
  closed: "Completado",
};

export default function MatchTimeline({
  match,
  confirmedCount,
}: MatchTimelineProps) {
  const { currentStep, stepIndex } = getMatchTimelineState(match);
  const config = STEP_CONFIG[currentStep];
  const Icon = config.icon;
  const subtitle = config.getSubtitle(match, confirmedCount);
  const [activeTooltip, setActiveTooltip] = useState<TimelineStep | null>(null);

  const handleStepTap = (step: TimelineStep) => {
    if (activeTooltip !== step) {
      logTooltipOpened(`timeline_${step}`);
    }
    setActiveTooltip(prev => prev === step ? null : step);
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-100" onClick={() => setActiveTooltip(null)}>
      {/* Estado actual */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 mb-5"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Icon size={18} />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{config.label}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Timeline visual */}
      <div className="flex items-center justify-between w-full">
        {STEPS.map((step, i) => {
          const isCompleted = i < stepIndex;
          const isCurrent = i === stepIndex;
          const StepIcon = STEP_CONFIG[step].icon;
          const isTooltipOpen = activeTooltip === step;

          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 relative">
                <button
                  onClick={(e) => { e.stopPropagation(); handleStepTap(step); }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? "bg-emerald-500 text-white shadow-sm"
                      : isCurrent
                        ? "bg-emerald-50 text-emerald-600 ring-2 ring-emerald-500 ring-offset-1"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isCompleted
                    ? <Check size={14} strokeWidth={2.5} />
                    : <StepIcon size={14} />
                  }
                </button>
                <span className={`text-[10px] font-medium ${
                  isCompleted
                    ? "text-emerald-600"
                    : isCurrent
                      ? "text-emerald-700 font-bold"
                      : "text-slate-400"
                }`}>
                  {STEP_LABELS[step]}
                </span>

                {/* Tooltip */}
                <AnimatePresence>
                  {isTooltipOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className={`absolute bottom-full mb-3 w-44 bg-slate-800 text-white text-[11px] rounded-xl px-3 py-2.5 shadow-xl z-50 leading-relaxed pointer-events-none ${
                        i === 0
                          ? "left-0"
                          : i === STEPS.length - 1
                            ? "right-0"
                            : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      <p className="font-bold text-emerald-400 mb-1">{STEP_CONFIG[step].label}</p>
                      <p className="text-slate-300">{STEP_CONFIG[step].tooltip}</p>
                      <div className={`absolute top-full border-4 border-transparent border-t-slate-800 ${
                        i === 0
                          ? "left-4"
                          : i === STEPS.length - 1
                            ? "right-4"
                            : "left-1/2 -translate-x-1/2"
                      }`} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Línea conectora */}
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mb-5 ${
                  i < stepIndex ? "bg-emerald-400" : "bg-slate-200"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
