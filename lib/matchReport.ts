/**
 * ========================
 * MATCH REPORT API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Genera reportes de partido para compartir por WhatsApp.
 * Usa tipos del dominio (`lib/domain/match.ts`).
 */

import type { Player } from "./domain/player";

interface ReportMatchData {
  date?: string;
  time?: string;
  teams?: { A: Player[]; B: Player[] };
  score?: { A: number; B: number };
}

/**
 * Genera un reporte de partido formateado para WhatsApp.
 */
export function buildWhatsAppReport(match: ReportMatchData): string {
  if (!match.teams) return "";

  const { A, B } = match.teams;

  const scoreA = match.score?.A ?? 0;
  const scoreB = match.score?.B ?? 0;

  const teamAList = A.map((p: Player) => `• ${p.name}`).join("\n");
  const teamBList = B.map((p: Player) => `• ${p.name}`).join("\n");

  return `
⚽ *RESULTADO DEL PARTIDO*

📅 ${match.date}
⏰ ${match.time}

🔴 Equipo A (${scoreA})
${teamAList}

🔵 Equipo B (${scoreB})
${teamBList}

🏆 Resultado final:
${scoreA} - ${scoreB}
  `.trim();
}
