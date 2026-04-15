"use client";

import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/lib/AuthContext";
import { generateTopupCodes } from "@/lib/wallet";
import { formatCOP, CODE_DENOMINATIONS_COP } from "@/lib/domain/wallet";
import { isSuperAdmin } from "@/lib/domain/user";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import { Ticket, Copy, Check, Loader2 } from "lucide-react";

export default function AdminCodesPage() {
  const { profile, loading: authLoading } = useAuth();

  const [count, setCount] = useState(10);
  const [amountCOP, setAmountCOP] = useState<number>(CODE_DENOMINATIONS_COP[0]);
  const [submitting, setSubmitting] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  if (authLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin" />
        </div>
      </AuthGuard>
    );
  }

  if (!profile || !isSuperAdmin(profile)) {
    return (
      <AuthGuard>
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-5 text-center">
          <p className="text-lg font-bold text-slate-800">Acceso denegado</p>
          <p className="text-slate-500 text-sm mt-1">Solo super_admin puede generar codigos.</p>
        </div>
      </AuthGuard>
    );
  }

  async function handleGenerate() {
    setSubmitting(true);
    try {
      const result = await generateTopupCodes(count, amountCOP);
      setGeneratedCodes(result.codes);
      toast.success(`${result.count} codigos generados`);
    } catch (e: unknown) {
      handleError(e, "Error al generar codigos");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyAll() {
    const text = generatedCodes.join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success("Codigos copiados al portapapeles");
    setTimeout(() => setCopiedAll(false), 2000);
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-md mx-auto">
          {/* HEADER */}
          <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-6 pb-8 rounded-b-3xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <h2 className="text-2xl font-bold relative z-10 flex items-center gap-2">
              <Ticket className="w-6 h-6" />
              Generar Codigos de Recarga
            </h2>
            <p className="relative z-10 text-emerald-100 text-sm mt-1">
              Crea codigos fisicos para venta en canchas.
            </p>
          </div>

          <div className="px-4 -mt-4 relative z-20 space-y-4">
            {/* FORM */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
              {/* Denomination */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Denominacion
                </label>
                <div className="flex gap-3">
                  {CODE_DENOMINATIONS_COP.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAmountCOP(d)}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                        amountCOP === d
                          ? "bg-[#1f7a4f] text-white shadow-md"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {formatCOP(d)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Count */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Cantidad de codigos
                </label>
                <input
                  type="number"
                  value={count}
                  min={1}
                  max={500}
                  onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value))))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] text-base font-medium"
                />
              </div>

              {/* Generate button */}
              <button
                disabled={submitting}
                onClick={handleGenerate}
                className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${
                  submitting
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                }`}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                ) : (
                  <><Ticket className="w-4 h-4" /> Generar {count} codigos de {formatCOP(amountCOP)}</>
                )}
              </button>
            </div>

            {/* GENERATED CODES */}
            {generatedCodes.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800">
                    {generatedCodes.length} codigos generados
                  </h3>
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#1f7a4f] hover:text-[#145c3a] transition-colors"
                  >
                    {copiedAll ? (
                      <><Check className="w-4 h-4" /> Copiados</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copiar todos</>
                    )}
                  </button>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 max-h-60 overflow-y-auto font-mono text-sm text-slate-700 space-y-1">
                  {generatedCodes.map((code) => (
                    <div key={code} className="px-2 py-1 hover:bg-slate-100 rounded">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
