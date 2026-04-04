"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface JourneyStep {
  icon: string;
  title: string;
  description: string;
}

const JOURNEY_STEPS: JourneyStep[] = [
  {
    icon: "⏰",
    title: "Sé puntual",
    description: "Llega 10 minutos antes. Tu puntaje de compromiso está en juego.",
  },
  {
    icon: "⚽",
    title: "Equipos automáticos",
    description: "Cuando el cupo esté completo, el organizador balancea los equipos. Revisa tu camiseta en la app antes de llegar.",
  },
  {
    icon: "🤝",
    title: "Juego limpio",
    description: "Respeto en todo momento. El árbitro somos todos.",
  },
  {
    icon: "⭐",
    title: "Votá por el MVP",
    description: "Al terminar, reconocé al jugador que marcó la diferencia.",
  },
];

interface MatchInstructionsPanelProps {
  instructions?: string;
}

export default function MatchInstructionsPanel({ instructions }: MatchInstructionsPanelProps) {
  const hasInstructions = Boolean(instructions?.trim());
  const [isOpen, setIsOpen] = useState(hasInstructions);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 font-semibold text-slate-700 text-sm">
          📋 ¿Cómo funciona el partido?
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400 text-xs"
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Nota del organizador */}
              {hasInstructions && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-emerald-700 mb-1">📌 Nota del organizador</p>
                  <p className="text-sm text-emerald-800 whitespace-pre-line leading-snug">
                    {instructions}
                  </p>
                </div>
              )}

              {/* Journey steps */}
              <div className="space-y-2.5">
                {JOURNEY_STEPS.map((step) => (
                  <div key={step.title} className="flex gap-3 items-start">
                    <span className="text-lg leading-none mt-0.5 shrink-0">{step.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 leading-tight">{step.title}</p>
                      <p className="text-xs text-slate-500 leading-snug mt-0.5">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
