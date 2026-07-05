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
import { formatDateSpanish, formatTime12h, formatEndTime } from "./date";
import { getTeamColors, TEAM_COLOR_EMOJI, type TeamColor } from "./domain/team-colors";
import { computeStandings, allFixturesPlayed, multiTeamName } from "./domain/multiTeam";

interface ReportMatchData {
  date?: string;
  time?: string;
  teams?: { A: Player[]; B: Player[] };
  score?: { A: number; B: number };
  teamColors?: { A: string; B: string };
}

/**
 * Genera un reporte de partido formateado para WhatsApp.
 */
export function buildWhatsAppReport(match: ReportMatchData): string {
  if (!match.teams) return "";

  const { A, B } = match.teams;

  const scoreA = match.score?.A ?? 0;
  const scoreB = match.score?.B ?? 0;

  const tc = getTeamColors(match.teamColors);
  const emojiA = TEAM_COLOR_EMOJI[tc.A];
  const emojiB = TEAM_COLOR_EMOJI[tc.B];

  const teamAList = A.map((p: Player, i: number) => `${i + 1}. ${p.name}`).join("\n");
  const teamBList = B.map((p: Player, i: number) => `${i + 1}. ${p.name}`).join("\n");

  return `
⚽ *RESULTADO DEL PARTIDO*

📅 ${match.date}
⏰ ${match.time}

${emojiA} Equipo A (${scoreA})
${teamAList}

${emojiB} Equipo B (${scoreB})
${teamBList}

🏆 Resultado final:
${scoreA} - ${scoreB}
  `.trim();
}

/**
 * Genera un reporte del torneo multi-equipo (round-robin) para compartir:
 * equipos conformados + fixtures + tabla de posiciones (si hay marcadores).
 * Con `plain=true` quita los `*` (para Telegram / texto plano).
 */
export function buildMultiTeamReport(
  match: Pick<Match, "id" | "date" | "time" | "multiTeam" | "locationSnapshot">,
  plain = false,
): string {
  const mt = match.multiTeam;
  if (!mt?.teams?.length) return "";

  const teamName = new Map(mt.teams.map((t) => [t.id, multiTeamName(t.color)]));
  const emojiOf = (id: string) => {
    const t = mt.teams.find((x) => x.id === id);
    return t ? (TEAM_COLOR_EMOJI[t.color as TeamColor] ?? "⚫") : "⚫";
  };

  let text = `🏆 *TORNEO — TODOS CONTRA TODOS*\n`;
  if (match.date) text += `📅 ${formatDateSpanish(match.date)}\n`;
  if (match.time) text += `⏰ ${formatTime12h(match.time)}\n`;
  const locName = match.locationSnapshot?.name;
  if (locName) text += `📍 ${locName}\n`;
  text += `\n`;

  // Equipos conformados
  for (const t of mt.teams) {
    const emoji = TEAM_COLOR_EMOJI[t.color as TeamColor] ?? "⚫";
    text += `${emoji} *${multiTeamName(t.color)}* (${t.players.length})\n`;
    t.players.forEach((p, i) => {
      text += `${i + 1}. ${p.name}\n`;
    });
    text += `\n`;
  }

  // Fixtures
  if (mt.fixtures?.length) {
    text += `📋 *Enfrentamientos*\n`;
    mt.fixtures.forEach((f, i) => {
      const home = `${emojiOf(f.home)} ${teamName.get(f.home) ?? f.home}`;
      const away = `${teamName.get(f.away) ?? f.away} ${emojiOf(f.away)}`;
      const mid =
        f.scoreHome != null && f.scoreAway != null ? `${f.scoreHome} - ${f.scoreAway}` : "vs";
      text += `${i + 1}. ${home}  ${mid}  ${away}\n`;
    });
    text += `\n`;

    // Tabla (si hay al menos un marcador)
    const anyPlayed = mt.fixtures.some((f) => f.scoreHome != null && f.scoreAway != null);
    if (anyPlayed) {
      const standings = computeStandings(mt.teams, mt.fixtures);
      const final = allFixturesPlayed(mt.fixtures);
      text += `📊 *Tabla${final ? "" : " (provisional)"}*\n`;
      standings.forEach((s) => {
        text += `${s.position}. ${emojiOf(s.teamId)} ${teamName.get(s.teamId)} — ${s.points} pts (${s.won}G ${s.drawn}E ${s.lost}P)\n`;
      });
      text += `\n`;
      if (final && standings[0]) {
        text += `🏆 Campeón: ${emojiOf(standings[0].teamId)} ${teamName.get(standings[0].teamId)}\n\n`;
      }
    }
  }

  if (match.id) text += `🔑 *Código del partido:* ${match.id}.ai\n`;

  const result = text.trim();
  return plain ? result.replace(/\*/g, "") : result;
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
  const endTimeStr = match.duration ? ` — hasta las ${formatEndTime(match.time || "", match.duration)}` : "";
  let text = `⚽ *PARTIDO EN LA CANCHITA* 🏟️\n`;
  text += `📅 *${dateStr}*\n⏰ *${timeStr}${endTimeStr}*\n📍 *${locName}*\n\n`;
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

  text += `\n🔑 *Código del partido:* ${match.id}.ai\n`;

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
