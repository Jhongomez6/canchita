"use client";

import type { MatchPhase } from "@/lib/domain/match";

interface MatchFABProps {
  phase: MatchPhase;
  onAction: () => void;
  disabled?: boolean;
}

const FAB_CONFIG: Record<MatchPhase, { icon: string; label: string; color: string }> = {
  recruiting: { icon: "📲", label: "Compartir", color: "bg-amber-500 hover:bg-amber-600" },
  full: { icon: "⚖️", label: "Balancear", color: "bg-[#16a34a] hover:bg-[#15803d]" },
  gameday: { icon: "✅", label: "Pasar lista", color: "bg-emerald-600 hover:bg-emerald-700" },
  postgame: { icon: "🔒", label: "Cerrar", color: "bg-red-600 hover:bg-red-700" },
  closed: { icon: "📋", label: "Reporte", color: "bg-[#25D366] hover:bg-[#20bd5a]" },
};

export default function MatchFAB({ phase, onAction, disabled }: MatchFABProps) {
  const config = FAB_CONFIG[phase];

  return (
    <button
      onClick={onAction}
      disabled={disabled}
      className={`fixed bottom-24 right-4 z-40 flex items-center gap-2 px-5 py-3 rounded-full text-white font-bold shadow-lg transition-all active:scale-[0.95] disabled:opacity-50 ${config.color}`}
      aria-label={config.label}
    >
      <span className="text-lg">{config.icon}</span>
      <span className="text-sm">{config.label}</span>
    </button>
  );
}
