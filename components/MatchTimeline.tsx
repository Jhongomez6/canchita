"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Users, Shield, Trophy, Lock } from "lucide-react";
import type { Match } from "@/lib/domain/match";
import { getMatchTimelineState, type TimelineStep } from "@/lib/domain/match";

interface MatchTimelineProps {
  match: Match;
  confirmedCount: number;
}

const STEP_CONFIG: Record<
  TimelineStep,
  {
    icon: typeof Users;
    label: string;
    getSubtitle: (match: Match, confirmedCount: number) => string;
  }
> = {
  joining: {
    icon: Users,
    label: "Confirmando jugadores",
    getSubtitle: (match, confirmedCount) =>
      `${confirmedCount}/${match.maxPlayers} confirmados`,
  },
  teams_confirmed: {
    icon: Shield,
    label: "Equipos definidos",
    getSubtitle: () => "Revisa tu equipo abajo",
  },
  mvp_voting: {
    icon: Trophy,
    label: "Votación MVP",
    getSubtitle: () => "Vota por la figura del partido",
  },
  closed: {
    icon: Lock,
    label: "Partido cerrado",
    getSubtitle: () => "Resultado final registrado",
  },
};

const STEPS: TimelineStep[] = [
  "joining",
  "teams_confirmed",
  "mvp_voting",
  "closed",
];

export default function MatchTimeline({
  match,
  confirmedCount,
}: MatchTimelineProps) {
  const { currentStep, stepIndex, totalSteps } = getMatchTimelineState(match);
  const config = STEP_CONFIG[currentStep];
  const Icon = config.icon;
  const subtitle = config.getSubtitle(match, confirmedCount);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-100">
      {/* Estado actual */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-3 mb-4"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Icon size={20} />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{config.label}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <motion.div
              key={step}
              className={`h-2 rounded-full transition-colors ${
                i <= stepIndex
                  ? "bg-emerald-500"
                  : "bg-slate-200"
              } ${i === stepIndex ? "w-6" : "w-2"}`}
              layout
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            />
          ))}
        </div>
        <span className="text-[10px] text-slate-400 font-medium ml-1">
          {stepIndex + 1} de {totalSteps}
        </span>
      </div>
    </div>
  );
}
