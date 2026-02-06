type Position = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  name: string;
  level: 1 | 2 | 3;
  positions: Position[];
};

type Team = {
  name: string;
  players: Player[];
  score: number;
};

export function balanceTeams(players: Player[]) {
  const teamA: Team = { name: "Equipo A", players: [], score: 0 };
  const teamB: Team = { name: "Equipo B", players: [], score: 0 };

  const warnings: string[] = [];

  // ---- Helpers ----
  const addToTeam = (team: Team, player: Player) => {
    team.players.push(player);
    team.score += player.level;
  };

  const weakerTeam = () =>
    teamA.score <= teamB.score ? teamA : teamB;

  // ---- 1. Arqueros ----
  const gks = players.filter(
    p => p.positions && p.positions.includes("GK")
  );

  const rest = players.filter(
    p => !p.positions || !p.positions.includes("GK")
  );


  if (gks.length >= 2) {
    addToTeam(teamA, gks[0]);
    addToTeam(teamB, gks[1]);

    gks.slice(2).forEach(gk =>
      addToTeam(weakerTeam(), gk)
    );
  } else if (gks.length === 1) {
    addToTeam(weakerTeam(), gks[0]);
    warnings.push("⚠️ Solo hay 1 arquero confirmado");
  } else {
    warnings.push("⚠️ No hay arqueros confirmados");
  }

  // ---- 2. Resto de jugadores ----
  const byPosition = (pos: Position) =>
    rest
      .filter(p => p.positions?.includes(pos))
      .sort((a, b) => b.level - a.level);

  const used = new Set<string>();

  const assignGroup = (players: Player[]) => {
    players.forEach(p => {
      if (used.has(p.name)) return;
      addToTeam(weakerTeam(), p);
      used.add(p.name);
    });
  };

  // 2️⃣ DEFENSAS
  assignGroup(byPosition("DEF"));

  // 3️⃣ MEDIOS
  assignGroup(byPosition("MID"));

  // 4️⃣ DELANTEROS
  assignGroup(byPosition("FWD"));

  // 5️⃣ RESTANTES (comodines)
  rest.forEach(p => {
    if (used.has(p.name)) return;
    addToTeam(weakerTeam(), p);
  });


  return {
    teamA,
    teamB,
    warnings,
  };
}
