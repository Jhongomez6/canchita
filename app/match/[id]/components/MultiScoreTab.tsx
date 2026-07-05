"use client";

import { Trophy, ListChecks } from "lucide-react";
import {
  computeStandings,
  allFixturesPlayed,
  pendingFixturesCount,
  getChampion,
  type MultiTeamTournament,
} from "@/lib/domain/multiTeam";
import { saveFixtureScore, reorderFixtures } from "@/lib/matches";
import { handleError } from "@/lib/utils/error";
import FixtureList from "./FixtureList";
import StandingsTable from "./StandingsTable";

interface MultiScoreTabProps {
  matchId: string;
  isOwner: boolean;
  isClosed: boolean;
  multiTeam?: MultiTeamTournament;
}

/**
 * Tab "Marcador" en modo multi-equipo: el admin registra el marcador de cada
 * enfrentamiento (round-robin) y ve la tabla de posiciones y el campeón.
 */
export default function MultiScoreTab({ matchId, isOwner, isClosed, multiTeam }: MultiScoreTabProps) {
  const confirmed = !!multiTeam?.confirmed;
  const fixtures = multiTeam?.fixtures ?? [];
  const teams = multiTeam?.teams ?? [];

  if (!confirmed || fixtures.length === 0) {
    return (
      <div role="tabpanel" id="panel-score" className="animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center flex flex-col items-center">
          <ListChecks size={44} className="text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">
            Confirmá los equipos en la pestaña <strong>Equipos</strong> para registrar los marcadores.
          </p>
        </div>
      </div>
    );
  }

  const standings = computeStandings(teams, fixtures);
  const allPlayed = allFixturesPlayed(fixtures);
  const pending = pendingFixturesCount(fixtures);
  const championId = getChampion(standings, allPlayed);
  const champion = championId ? teams.find((t) => t.id === championId) : null;

  return (
    <div role="tabpanel" id="panel-score" className="space-y-4 animate-in fade-in duration-200">
      <FixtureList
        teams={teams}
        fixtures={fixtures}
        readOnly={!isOwner || isClosed}
        onSaveScore={async (fixtureId, sh, sa) => {
          try {
            await saveFixtureScore(matchId, fixtureId, sh, sa);
          } catch (err) {
            handleError(err, "Error al guardar el marcador");
          }
        }}
        onReorder={async (fixtureId, direction) => {
          try {
            await reorderFixtures(matchId, fixtureId, direction);
          } catch (err) {
            handleError(err, "Error al reordenar el enfrentamiento");
          }
        }}
      />

      <StandingsTable teams={teams} standings={standings} final={allPlayed} />

      {champion ? (
        <div className="flex items-center justify-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-bold border border-amber-200">
          <Trophy size={16} className="text-amber-500" /> Campeón: {champion.name}
        </div>
      ) : (
        isOwner && !isClosed && pending > 0 && (
          <p className="text-center text-xs text-slate-400 font-medium">
            Faltan {pending} marcador{pending > 1 ? "es" : ""} para cerrar el partido
          </p>
        )
      )}
    </div>
  );
}
