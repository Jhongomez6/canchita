"use client";

import { 
  Share2, 
  Scale, 
  Check, 
  Trophy, 
  Lock, 
  DollarSign, 
  FileText 
} from "lucide-react";

export type FABPhase =
  | "recruiting"
  | "can_balance"
  | "can_confirm"
  | "can_score"
  | "can_close"
  | "can_collect"
  | "all_set";

interface MatchFABProps {
  phase: FABPhase;
  onAction: () => void;
  disabled?: boolean;
}

const FAB_CONFIG: Record<FABPhase, { icon: React.ElementType; label: string; color: string }> = {
  recruiting: { icon: Share2, label: "Compartir", color: "bg-amber-500 hover:bg-amber-600" },
  can_balance: { icon: Scale, label: "Balancear", color: "bg-[#16a34a] hover:bg-[#15803d]" },
  can_confirm: { icon: Check, label: "Publicar", color: "bg-[#16a34a] hover:bg-[#15803d]" },
  can_score: { icon: Trophy, label: "Marcador", color: "bg-blue-600 hover:bg-blue-700" },
  can_close: { icon: Lock, label: "Cerrar partido", color: "bg-red-600 hover:bg-red-700" },
  can_collect: { icon: DollarSign, label: "Cobrar", color: "bg-emerald-600 hover:bg-emerald-700" },
  all_set: { icon: FileText, label: "Reporte Final", color: "bg-[#25D366] hover:bg-[#20bd5a]" },
};

export default function MatchFAB({ phase, onAction, disabled }: MatchFABProps) {
  const config = FAB_CONFIG[phase];
  const Icon = config.icon;

  return (
    <button
      onClick={onAction}
      disabled={disabled}
      className={`fixed bottom-24 right-4 z-40 flex items-center gap-2 px-5 py-3 rounded-full text-white font-bold shadow-lg transition-all active:scale-[0.95] disabled:opacity-50 ${config.color}`}
      aria-label={config.label}
    >
      <Icon size={18} strokeWidth={2.5} />
      <span className="text-sm">{config.label}</span>
    </button>
  );
}
