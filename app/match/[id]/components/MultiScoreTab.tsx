"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Trophy, ListChecks, Repeat, Loader2 } from "lucide-react";
import {
  computeStandings,
  allFixturesPlayed,
  pendingFixturesCount,
  getChampion,
  multiTeamName,
  type MultiTeamTournament,
} from "@/lib/domain/multiTeam";
import { saveFixtureScore, reorderFixtures, addReturnLeg } from "@/lib/matches";
import { handleError } from "@/lib/utils/error";
import FixtureList from "./FixtureList";
import StandingsTable from "./StandingsTable";
import ShareReportButtons from "./ShareReportButtons";

interface MultiScoreTabProps {
  matchId: string;
  isOwner: boolean;
  isClosed: boolean;
  multiTeam?: MultiTeamTournament;
  /** Genera el reporte (equipos + fixtures + tabla) para compartir. */
  onGetReportText: () => string;
}

/**
 * Tab "Marcador" en modo multi-equipo: el admin registra el marcador de cada
 * enfrentamiento (round-robin) y ve la tabla de posiciones y el campeón.
 */
export default function MultiScoreTab({ matchId, isOwner, isClosed, multiTeam, onGetReportText }: MultiScoreTabProps) {
  const [addingReturn, setAddingReturn] = useState(false);
  const confirmed = !!multiTeam?.confirmed;
  const fixtures = multiTeam?.fixtures ?? [];
  const teams = multiTeam?.teams ?? [];
  const isSingleLeg = (multiTeam?.legs ?? 1) === 1;

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

      {/* Ampliar a ida y vuelta (agrega la vuelta sin borrar la ida) */}
      {isOwner && !isClosed && isSingleLeg && (
        <button
          disabled={addingReturn}
          onClick={async () => {
            if (!confirm("Se agregarán los partidos de vuelta (cada par juega una vez más). Los marcadores actuales se conservan. ¿Continuar?")) return;
            setAddingReturn(true);
            try {
              await addReturnLeg(matchId);
              toast.success("Partidos de vuelta agregados");
            } catch (err) {
              handleError(err, "No se pudo agregar la vuelta");
            } finally {
              setAddingReturn(false);
            }
          }}
          className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.98] ${
            addingReturn
              ? "bg-slate-100 border-slate-200 text-slate-400"
              : "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          {addingReturn ? <Loader2 size={16} className="animate-spin" /> : <Repeat size={16} />}
          {addingReturn ? "Agregando..." : "Agregar partidos de vuelta"}
        </button>
      )}

      {isOwner && <ShareReportButtons getText={onGetReportText} />}

      {champion ? (
        <div className="flex items-center justify-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-bold border border-amber-200">
          <Trophy size={16} className="text-amber-500" /> Campeón: {multiTeamName(champion.color)}
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
