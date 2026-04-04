"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const JOURNEY_STEPS = [
  {
    icon: "⏰",
    title: "Sé puntual",
    description: "Llega 10 minutos antes. Tu compromiso está en juego.",
  },
  {
    icon: "⚽",
    title: "Equipos balanceados automáticamente",
    description: "Revisa tu asignación en la app antes de llegar.",
  },
  {
    icon: "🤝",
    title: "Juego limpio",
    description: "Respeto en todo momento. El árbitro somos todos.",
  },
  {
    icon: "⭐",
    title: "Vota por el MVP",
    description: "Al terminar, reconoce al jugador que marcó la diferencia.",
  },
];

const WAITLIST_CONDITIONS = [
  {
    icon: "⚠️",
    title: "El partido está lleno",
    description: "Entras a la lista de espera. Solo juegas si alguien cancela y el organizador te aprueba.",
  },
  {
    icon: "🔔",
    title: "Te notificamos si hay lugar",
    description: "Recibirás una notificación si un cupo queda disponible. Revisa la app antes del partido.",
  },
  {
    icon: "🚪",
    title: "Puedes salir cuando quieras",
    description: "Si no puedes ir, sal de la lista antes del partido para liberar el lugar.",
  },
];

interface JoinConfirmModalProps {
  isOpen: boolean;
  instructions?: string;
  isWaitlist?: boolean;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function JoinConfirmModal({
  isOpen,
  instructions,
  isWaitlist = false,
  submitting,
  onClose,
  onConfirm,
}: JoinConfirmModalProps) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(isOpen ? "bottomsheet:open" : "bottomsheet:close"));
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            <div className="px-5 pt-2 pb-8">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                {isWaitlist ? "📋 Lista de espera - condiciones" : "📋 Antes de unirte"}
              </h2>

              {/* Condiciones de suplencia */}
              {isWaitlist && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 space-y-3">
                  {WAITLIST_CONDITIONS.map((c) => (
                    <div key={c.title} className="flex gap-3 items-start">
                      <span className="text-lg leading-none mt-0.5 shrink-0">{c.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 leading-tight">{c.title}</p>
                        <p className="text-xs text-slate-500 leading-snug mt-0.5">{c.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Nota del organizador */}
              {instructions?.trim() && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 mb-4">
                  <p className="text-xs font-bold text-emerald-700 mb-1">📌 Nota del organizador</p>
                  <p className="text-sm text-emerald-800 whitespace-pre-line leading-snug">
                    {instructions}
                  </p>
                </div>
              )}

              {/* Journey steps — solo para confirmacion normal */}
              {!isWaitlist && (
                <div className="space-y-3.5 mb-6">
                  {JOURNEY_STEPS.map((step) => (
                    <div key={step.title} className="flex gap-3 items-start">
                      <span className="text-xl leading-none mt-0.5 shrink-0">{step.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 leading-tight">{step.title}</p>
                        <p className="text-xs text-slate-500 leading-snug mt-0.5">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  disabled={submitting}
                  onClick={onConfirm}
                  className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] shadow-lg ${
                    submitting
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      : isWaitlist
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                  }`}
                >
                  {submitting
                    ? "⏳ Uniéndome..."
                    : isWaitlist
                      ? "📋 Entendido, anotarme como suplente"
                      : "✅ Entendido, me anoto!"}
                </button>
                <button
                  disabled={submitting}
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl font-semibold text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
