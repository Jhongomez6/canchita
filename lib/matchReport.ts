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

import type { Player, Position } from "./domain/player";
import type { Match } from "./domain/match";
import type { Guest } from "./domain/guest";
import { guestToPlayer } from "./domain/guest";
import { formatDateSpanish, formatTime12h } from "./date";

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

/**
 * Icons mapping for player positions
 */
const POSITION_ICONS: Record<Position, string> = {
  GK: "🧤",
  DEF: "🛡️",
  MID: "⚙️",
  FWD: "⚡",
};

/**
 * Builds the text string used to share confirmed players + waitlist via WhatsApp.
 */
export function buildRosterReport(
  match: Match,
  locationName: string,
  confirmedCount: number
): string {
  const dateStr = formatDateSpanish(match.date || "");
  const timeStr = formatTime12h(match.time || "");
  const locName = locationName || match.locationSnapshot?.name || "Cancha por definir";
  let text = `⚽ *PARTIDO EN LA CANCHITA* 🏟️\n`;
  text += `📅 *${dateStr}* ⏰ *${timeStr}*\n📍 *${locName}*\n\n`;
  text += `📋 *Confirmados (${confirmedCount}/${match.maxPlayers || "?"})*\n\n`;

  const confirmed = match.players?.filter((p: Player) => p.confirmed) || [];
  confirmed.forEach((p: Player, i: number) => {
    const icon = POSITION_ICONS[(p.positions?.[0] as Position) || "MID"];
    text += `${i + 1}. ${icon} ${p.name}\n`;
  });

  const guests = (match.guests || []).filter((g: Guest) => !g.isWaitlist);
  guests.forEach((g: Guest, i: number) => {
    const icon = POSITION_ICONS[(g.positions?.[0] as Position) || "MID"];
    const hostName = match.players?.find((player: Player) => player.uid === g.invitedBy)?.name;
    const guestStr = hostName ? ` (Invitado de ${hostName})` : " (Invitado)";
    text += `${confirmed.length + i + 1}. ${icon} ${g.name.replace(" (inv)", "")}${guestStr}\n`;
  });

  // WAITLIST PLAYERS
  const waitlistPlayers: Player[] = [
    ...(match.players?.filter((p: Player) => p.isWaitlist && !p.confirmed) || []),
    ...(match.guests?.filter((g: Guest) => g.isWaitlist && !g.confirmed).map((g: Guest) => guestToPlayer(g, 2)) || [])
  ].sort((a: Player, b: Player) => {
    const tA = a.waitlistJoinedAt ? new Date(a.waitlistJoinedAt).getTime() : 0;
    const tB = b.waitlistJoinedAt ? new Date(b.waitlistJoinedAt).getTime() : 0;
    return tA - tB;
  });

  if (waitlistPlayers.length > 0) {
    text += `\n⏳ *Lista de espera (Suplentes) (${waitlistPlayers.length})*\n`;
    waitlistPlayers.forEach((p: Player, i: number) => {
      const isGuest = p.id?.startsWith("guest-");
      let cleanName = p.name;
      let hostStr = "";
      if (isGuest) {
        const inviterUid = p.id?.split("-")[1];
        const hostName = match.players?.find((player: Player) => player.uid === inviterUid)?.name;
        cleanName = cleanName.replace(" (inv)", "");
        if (hostName) hostStr = ` (Invitado de ${hostName})`;
        else hostStr = ` (Invitado)`;
      }
      text += `${i + 1}. ${cleanName}${hostStr}\n`;
    });
  }

  return text;
}

/**
 * Builds the roster report formatted for Telegram (no *bold* markers).
 */
export function buildRosterReportTelegram(
  match: Match,
  locationName: string,
  confirmedCount: number
): string {
  return buildRosterReport(match, locationName, confirmedCount).replace(/\*/g, "");
}
