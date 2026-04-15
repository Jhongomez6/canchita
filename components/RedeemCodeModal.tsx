"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ticket, Loader2, X, AlertCircle } from "lucide-react";
import { redeemCode } from "@/lib/wallet";
import { formatCOP } from "@/lib/domain/wallet";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

interface RedeemCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (amountCOP: number) => void;
}

export default function RedeemCodeModal({ isOpen, onClose, onSuccess }: RedeemCodeModalProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCode("");
      setErrorMsg(null);
    }
  }, [isOpen]);

  async function handleRedeem() {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const result = await redeemCode(code);
      toast.success(`${formatCOP(result.amountCOP)} acreditados en tu billetera`);
      setCode("");
      onSuccess?.(result.amountCOP);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      const code_ = (e as { code?: string }).code ?? "";

      if (code_.includes("not-found") || msg.includes("no válido")) {
        setErrorMsg("Código incorrecto. Revisa que lo hayas escrito bien.");
      } else if (code_.includes("already-exists") || msg.includes("ya fue canjeado")) {
        setErrorMsg("Este código ya fue canjeado anteriormente.");
      } else if (code_.includes("resource-exhausted") || msg.includes("Demasiados")) {
        setErrorMsg("Demasiados intentos fallidos. Espera un momento e intenta de nuevo.");
      } else {
        handleError(e, "Error al canjear código");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl pb-safe"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            <div className="px-5 pt-2 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-emerald-600" />
                  Canjear Código
                </h2>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-slate-500 mb-4">
                Ingresa el código que encontraste en tu tarjeta de recarga.
              </p>

              {/* Input enmascarado estilo XXXX-XXXX */}
              <div className="relative">
                {/* Display visual de la máscara */}
                <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-1.5 font-mono text-2xl font-bold tracking-widest select-none">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const char = code[i];
                    return (
                      <span
                        key={i}
                        className={char ? "text-slate-800" : "text-slate-300 animate-pulse"}
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        {char ?? "X"}
                      </span>
                    );
                  })}
                  <span className="text-slate-300 text-lg mx-0.5">—</span>
                  {Array.from({ length: 4 }).map((_, i) => {
                    const char = code[i + 5]; // +5 por el guión en posición 4
                    return (
                      <span
                        key={i + 4}
                        className={char ? "text-slate-800" : "text-slate-300 animate-pulse"}
                        style={{ animationDelay: `${(i + 4) * 100}ms` }}
                      >
                        {char ?? "X"}
                      </span>
                    );
                  })}
                </div>

                {/* Input invisible encima para capturar teclado */}
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
                    const formatted = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
                    setCode(formatted);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  maxLength={9}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                />
              </div>

              {errorMsg && (
                <p className="mt-2 text-sm text-red-500 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                </p>
              )}

              <button
                disabled={submitting || code.trim().length < 9}
                onClick={handleRedeem}
                className={`w-full mt-4 py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${
                  submitting || code.trim().length < 9
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                }`}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Canjeando...</>
                ) : (
                  "Canjear Código"
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
