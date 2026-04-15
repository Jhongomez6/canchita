"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Scale, Shield, Star,
  AlertTriangle, Bell, LogOut,
  ClipboardList, Loader2, CheckCircle2, Pin, Wallet, Info,
} from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";

const JOURNEY_STEPS = [
  {
    icon: Clock,
    color: "text-blue-500 bg-blue-50",
    title: "Sé puntual",
    description: "Llega 10 minutos antes. Tu compromiso está en juego.",
  },
  {
    icon: Scale,
    color: "text-violet-500 bg-violet-50",
    title: "Equipos balanceados automáticamente",
    description: "Revisa tu asignación en la app antes de llegar.",
  },
  {
    icon: Shield,
    color: "text-emerald-500 bg-emerald-50",
    title: "Juego limpio",
    description: "Respeto en todo momento. El árbitro somos todos.",
  },
  {
    icon: Star,
    color: "text-amber-500 bg-amber-50",
    title: "Vota por el MVP",
    description: "Al terminar, reconoce al jugador que marcó la diferencia.",
  },
];

const WAITLIST_CONDITIONS = [
  {
    icon: AlertTriangle,
    color: "text-amber-500 bg-amber-50",
    title: "El partido está lleno",
    description: "Entras a la lista de espera. Solo juegas si alguien cancela y el organizador te aprueba.",
  },
  {
    icon: Bell,
    color: "text-blue-500 bg-blue-50",
    title: "Te notificamos si hay lugar",
    description: "Recibirás una notificación si un cupo queda disponible. Revisa la app antes del partido.",
  },
  {
    icon: LogOut,
    color: "text-slate-500 bg-slate-100",
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
  deposit?: number;
  userBalanceCOP?: number;
  onRecharge?: () => void;
}

export default function JoinConfirmModal({
  isOpen,
  instructions,
  isWaitlist = false,
  submitting,
  onClose,
  onConfirm,
  deposit,
  userBalanceCOP,
  onRecharge,
}: JoinConfirmModalProps) {
  const hasDeposit = !!deposit && deposit > 0;
  const balance = userBalanceCOP ?? 0;
  const insufficientBalance = hasDeposit && balance < deposit;
  const balanceAfter = hasDeposit ? balance - deposit : balance;
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
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-slate-500" />
                {isWaitlist ? "Lista de espera — condiciones" : "Antes de anotarte"}
              </h2>

              {/* Condiciones de suplencia */}
              {isWaitlist && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 space-y-3">
                  {WAITLIST_CONDITIONS.map((c) => {
                    const Icon = c.icon;
                    return (
                      <div key={c.title} className="flex gap-3 items-start">
                        <span className={`p-1.5 rounded-lg shrink-0 ${c.color}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 leading-tight">{c.title}</p>
                          <p className="text-xs text-slate-500 leading-snug mt-0.5">{c.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Nota del organizador */}
              {instructions?.trim() && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 mb-4">
                  <p className="text-xs font-bold text-emerald-700 mb-1 flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5" /> Nota del organizador
                  </p>
                  <p className="text-sm text-emerald-800 whitespace-pre-line leading-snug">
                    {instructions}
                  </p>
                </div>
              )}

              {/* Deposit info */}
              {hasDeposit && !isWaitlist && (
                insufficientBalance ? (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <p className="text-sm font-bold text-red-700">Saldo insuficiente</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-red-600">Depósito:</span>
                        <span className="font-semibold text-red-700">{formatCOP(deposit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-600">Tu saldo:</span>
                        <span className="font-semibold text-red-700">{formatCOP(balance)}</span>
                      </div>
                      <div className="flex justify-between border-t border-red-200 pt-1 mt-1">
                        <span className="text-red-600 font-semibold">Te faltan:</span>
                        <span className="font-bold text-red-800">{formatCOP(deposit - balance)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-bold text-emerald-700">Depósito requerido</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-emerald-600">Depósito:</span>
                        <span className="font-semibold text-emerald-700">{formatCOP(deposit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-600">Tu saldo:</span>
                        <span className="font-semibold text-emerald-700">{formatCOP(balance)}</span>
                      </div>
                      <div className="flex justify-between border-t border-emerald-200 pt-1 mt-1">
                        <span className="text-emerald-600">Saldo tras unirte:</span>
                        <span className="font-bold text-emerald-800">{formatCOP(balanceAfter)}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-emerald-200">
                      <Info className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-emerald-700 leading-snug">
                        Si cancelas con <span className="font-semibold">menos de 24 horas</span> de anticipación, el depósito no será reembolsado.
                      </p>
                    </div>
                  </div>
                )
              )}

              {/* Journey steps — solo para confirmacion normal */}
              {!isWaitlist && (
                <div className="space-y-3.5 mb-6">
                  {JOURNEY_STEPS.map((step) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.title} className="flex gap-3 items-start">
                        <span className={`p-1.5 rounded-lg shrink-0 ${step.color}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 leading-tight">{step.title}</p>
                          <p className="text-xs text-slate-500 leading-snug mt-0.5">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {insufficientBalance ? (
                  <>
                    <button
                      onClick={onRecharge}
                      className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                    >
                      <Wallet className="w-4 h-4" /> Recargar billetera
                    </button>
                    <button
                      onClick={onClose}
                      className="w-full py-3 rounded-2xl font-semibold text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={submitting}
                      onClick={onConfirm}
                      className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${
                        submitting
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                          : isWaitlist
                            ? "bg-amber-500 text-white hover:bg-amber-600"
                            : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                      }`}
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Uniéndome...</>
                      ) : isWaitlist ? (
                        <><ClipboardList className="w-4 h-4" /> Entendido, anotarme como suplente</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4" /> {hasDeposit ? "Entendido, me anoto!" : "Entendido, me anoto!"}</>
                      )}
                    </button>
                    <button
                      disabled={submitting}
                      onClick={onClose}
                      className="w-full py-3 rounded-2xl font-semibold text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
