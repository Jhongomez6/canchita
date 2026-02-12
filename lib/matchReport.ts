export function buildWhatsAppReport(match: any) {
  if (!match.teams) return "";

  const { A, B } = match.teams;

  const scoreA = match.score?.A ?? 0;
  const scoreB = match.score?.B ?? 0;

  const teamAList = A.map((p: any) => `• ${p.name}`).join("\n");
  const teamBList = B.map((p: any) => `• ${p.name}`).join("\n");

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
