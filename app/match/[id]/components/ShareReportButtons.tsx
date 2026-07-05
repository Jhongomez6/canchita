"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "react-hot-toast";

interface ShareReportButtonsProps {
  /** Genera el texto del reporte (con *negritas* para WhatsApp). */
  getText: () => string;
}

/** Botones para copiar el reporte al portapapeles o compartirlo por WhatsApp. */
export default function ShareReportButtons({ getText }: ShareReportButtonsProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Reporte copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el reporte");
    }
  }

  function whatsapp() {
    const text = getText();
    if (!text) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={copy}
        className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border transition-colors ${
          copied
            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
        }`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? "Copiado" : "Copiar equipos y fixtures"}</span>
      </button>
      <button
        onClick={whatsapp}
        className="py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border bg-green-50 border-green-200 text-green-600 hover:bg-green-100 transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-4 h-4" />
        <span>WhatsApp</span>
      </button>
    </div>
  );
}
