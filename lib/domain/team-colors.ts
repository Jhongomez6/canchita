export type TeamColor = "red" | "blue" | "green" | "orange" | "purple" | "yellow" | "pink" | "slate";

export interface TeamColorStyle {
  label: string;
  hex: string;
  bg: string;
  border: string;
  text: string;
  subtext: string;
  shieldFill: string;
  shieldText: string;
  dot: string;
  dotRing: string;
  highlight: string;
  highlightBorder: string;
}

export const TEAM_COLOR_CONFIG: Record<TeamColor, TeamColorStyle> = {
  red:    { label: "Rojo",     hex: "#ef4444", bg: "bg-red-50",    border: "border-red-100",    text: "text-red-800",    subtext: "text-red-600",    shieldFill: "#ef4444", shieldText: "text-red-500",    dot: "bg-red-500",    dotRing: "ring-red-300",    highlight: "bg-red-100",    highlightBorder: "border-red-300"    },
  blue:   { label: "Azul",     hex: "#3b82f6", bg: "bg-blue-50",   border: "border-blue-100",   text: "text-blue-800",   subtext: "text-blue-600",   shieldFill: "#3b82f6", shieldText: "text-blue-500",   dot: "bg-blue-500",   dotRing: "ring-blue-300",   highlight: "bg-blue-100",   highlightBorder: "border-blue-300"   },
  green:  { label: "Verde",    hex: "#22c55e", bg: "bg-green-50",  border: "border-green-100",  text: "text-green-800",  subtext: "text-green-600",  shieldFill: "#22c55e", shieldText: "text-green-500",  dot: "bg-green-500",  dotRing: "ring-green-300",  highlight: "bg-green-100",  highlightBorder: "border-green-300"  },
  orange: { label: "Naranja",  hex: "#f97316", bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-800", subtext: "text-orange-600", shieldFill: "#f97316", shieldText: "text-orange-500", dot: "bg-orange-500", dotRing: "ring-orange-300", highlight: "bg-orange-100", highlightBorder: "border-orange-300" },
  purple: { label: "Morado",   hex: "#a855f7", bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-800", subtext: "text-purple-600", shieldFill: "#a855f7", shieldText: "text-purple-500", dot: "bg-purple-500", dotRing: "ring-purple-300", highlight: "bg-purple-100", highlightBorder: "border-purple-300" },
  yellow: { label: "Amarillo", hex: "#eab308", bg: "bg-yellow-50", border: "border-yellow-100", text: "text-yellow-800", subtext: "text-yellow-600", shieldFill: "#eab308", shieldText: "text-yellow-500", dot: "bg-yellow-500", dotRing: "ring-yellow-300", highlight: "bg-yellow-100", highlightBorder: "border-yellow-300" },
  pink:   { label: "Rosa",     hex: "#ec4899", bg: "bg-pink-50",   border: "border-pink-100",   text: "text-pink-800",   subtext: "text-pink-600",   shieldFill: "#ec4899", shieldText: "text-pink-500",   dot: "bg-pink-500",   dotRing: "ring-pink-300",   highlight: "bg-pink-100",   highlightBorder: "border-pink-300"   },
  slate:  { label: "Gris",     hex: "#64748b", bg: "bg-slate-100", border: "border-slate-200",  text: "text-slate-800",  subtext: "text-slate-600",  shieldFill: "#64748b", shieldText: "text-slate-500",  dot: "bg-slate-500",  dotRing: "ring-slate-300",  highlight: "bg-slate-200",  highlightBorder: "border-slate-400"  },
};

export const DEFAULT_TEAM_COLORS: { A: TeamColor; B: TeamColor } = { A: "red", B: "blue" };

export const TEAM_COLOR_EMOJI: Record<TeamColor, string> = {
  red:    "🔴",
  blue:   "🔵",
  green:  "🟢",
  orange: "🟠",
  purple: "🟣",
  yellow: "🟡",
  pink:   "🩷",
  slate:  "⚫",
};

export function getTeamColors(teamColors?: { A: string; B: string }): { A: TeamColor; B: TeamColor } {
  const validColors = Object.keys(TEAM_COLOR_CONFIG) as TeamColor[];
  const a = validColors.includes(teamColors?.A as TeamColor) ? (teamColors!.A as TeamColor) : DEFAULT_TEAM_COLORS.A;
  const b = validColors.includes(teamColors?.B as TeamColor) ? (teamColors!.B as TeamColor) : DEFAULT_TEAM_COLORS.B;
  return { A: a, B: b };
}
