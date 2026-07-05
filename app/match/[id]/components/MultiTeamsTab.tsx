"use client";

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Scale,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Trophy,
  ArrowLeft,
  Users,
  ListChecks,
} from "lucide-react";
import type { Player } from "@/lib/domain/player";
import {
  balanceIntoTeams,
  computeStandings,
  allFixturesPlayed,
  getChampion,
  getMultiTeamQuality,
  validTeamCounts,
  multiTeamName,
  type MultiTeam,
  type MultiTeamTournament,
} from "@/lib/domain/multiTeam";
import { TEAM_COLOR_CONFIG, type TeamColor } from "@/lib/domain/team-colors";
import { saveMultiTeams, confirmMultiTeams, updateMultiTeamRoster, updateMultiTeamColor } from "@/lib/matches";
import { handleError } from "@/lib/utils/error";
import MultiTeamGrid from "./MultiTeamGrid";
import ShareReportButtons from "./ShareReportButtons";

interface MultiTeamsTabProps {
  matchId: string;
  isOwner: boolean;
  isClosed: boolean;
  confirmedCount: number;
  eligiblePlayers: Player[];
  multiTeam?: MultiTeamTournament;
  currentMVPs: string[];
  voteCounts: Record<string, number>;
  votingClosed: boolean;
  /** Volver al modo clásico (solo disponible antes de guardar equipos multi). */
  onExitMulti: () => void;
  /** Genera el reporte (equipos + fixtures) para compartir. */
  onGetReportText: () => string;
}

const cleanObject = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));
const keyOf = (p: Player) => p.id || p.uid || p.name;

export default function MultiTeamsTab({
  matchId,
  isOwner,
  isClosed,
  confirmedCount,
  eligiblePlayers,
  multiTeam,
  currentMVPs,
  voteCounts,
  votingClosed,
  onExitMulti,
  onGetReportText,
}: MultiTeamsTabProps) {
  const options = validTeamCounts(confirmedCount);
  const [numTeams, setNumTeams] = useState<number>(options[0] ?? 3);
  const [legs, setLegs] = useState<1 | 2>(multiTeam?.legs ?? 1);
  const [balancing, setBalancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draftTeams, setDraftTeams] = useState<MultiTeam[]>(multiTeam?.teams ?? []);
  const saveRef = useRef<NodeJS.Timeout | null>(null);

  const isConfirmed = !!multiTeam?.confirmed;
  const hasTeams = (multiTeam?.teams?.length ?? draftTeams.length) > 0;
  const teamsForView = draftTeams.length ? draftTeams : (multiTeam?.teams ?? []);
  const fixtures = multiTeam?.fixtures ?? [];

  // ---- SETUP: aún sin equipos generados ----
  if (!hasTeams) {
    return (
      <div role="tabpanel" id="panel-teams" className="space-y-4 animate-in fade-in duration-200">
        {isOwner && !isClosed ? (
          <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-500/20 p-5">
            <h3 className="font-bold text-emerald-800 mb-1 flex items-center gap-2">
              <Trophy size={18} /> Varios equipos — Todos contra todos
            </h3>
            <p className="text-sm text-emerald-700 mb-4 opacity-80">
              Se arman <strong>N equipos parejos</strong> que juegan un round-robin. Total elegibles:{" "}
              <strong>{confirmedCount}</strong>
            </p>

            <TeamCountSelector value={numTeams} options={options} onChange={setNumTeams} />

            <div className="mt-3">
              <LegsToggle value={legs} onChange={setLegs} />
            </div>

            <button
              disabled={balancing || options.length === 0}
              onClick={async () => {
                setBalancing(true);
                try {
                  const result = balanceIntoTeams(eligiblePlayers, numTeams);
                  const tournament: MultiTeamTournament = {
                    format: "round_robin",
                    numTeams,
                    teams: result.teams,
                    fixtures: [],
                    legs,
                    confirmed: false,
                    createdAt: new Date().toISOString(),
                  };
                  setDraftTeams(result.teams);
                  await saveMultiTeams(matchId, cleanObject(tournament));
                  toast.success(`${numTeams} equipos generados`);
                } catch (err) {
                  handleError(err, "Error al generar los equipos");
                } finally {
                  setBalancing(false);
                }
              }}
              className={`w-full mt-4 py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 ${
                balancing ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-[#16a34a] hover:bg-[#15803d]"
              }`}
            >
              {balancing ? <Loader2 size={20} className="animate-spin" /> : <Scale size={20} />}
              {balancing ? "Balanceando..." : `Generar ${numTeams} equipos`}
            </button>

            <button
              onClick={onExitMulti}
              className="w-full mt-2 py-2 rounded-xl font-bold text-slate-500 hover:text-slate-700 text-sm flex items-center justify-center gap-1.5"
            >
              <ArrowLeft size={14} /> Volver a 2 equipos
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center flex flex-col items-center">
            <Users size={48} className="text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">Los equipos aún no han sido armados</p>
          </div>
        )}
      </div>
    );
  }

  // ---- Equipos generados ----
  const quality = getMultiTeamQuality(teamsForView);
  const isBalanced = quality.cost === 0;
  // Los equipos se pueden ajustar por drag incluso después de confirmar (mientras el
  // partido esté abierto). Post-confirmación se persiste SOLO el roster (fixtures intactos).
  const editable = isOwner && !isClosed;

  const standings = computeStandings(teamsForView, fixtures);
  const allPlayed = allFixturesPlayed(fixtures);
  const championId = getChampion(standings, allPlayed);
  const champion = championId ? teamsForView.find((t) => t.id === championId) : null;

  function scheduleSave(next: MultiTeam[]) {
    setSaving(true);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      try {
        if (isConfirmed) {
          // Solo actualizar el roster; preservar fixtures y marcadores
          await updateMultiTeamRoster(matchId, cleanObject(next));
        } else {
          const tournament: MultiTeamTournament = {
            format: "round_robin",
            numTeams: next.length,
            teams: next,
            fixtures: [],
            legs: multiTeam?.legs ?? legs,
            confirmed: false,
            createdAt: multiTeam?.createdAt ?? new Date().toISOString(),
          };
          await saveMultiTeams(matchId, cleanObject(tournament));
        }
      } catch (err) {
        handleError(err, "Error al guardar equipos");
      } finally {
        setSaving(false);
      }
    }, 1200);
  }

  function handleMove(playerKey: string, from: string, to: string) {
    setDraftTeams((prev) => {
      const next = prev.map((t) => ({ ...t, players: [...t.players] }));
      const fromT = next.find((t) => t.id === from);
      const toT = next.find((t) => t.id === to);
      if (!fromT || !toT) return prev;
      const idx = fromT.players.findIndex((p) => keyOf(p) === playerKey);
      if (idx === -1) return prev;
      const [moved] = fromT.players.splice(idx, 1);
      toT.players.push(moved);
      scheduleSave(next);
      return next;
    });
  }

  // Cambia el formato (ida / ida y vuelta) antes de confirmar; persiste el flag.
  async function persistLegs(newLegs: 1 | 2) {
    setLegs(newLegs);
    try {
      const tournament: MultiTeamTournament = {
        format: "round_robin",
        numTeams: teamsForView.length,
        teams: teamsForView,
        fixtures: [],
        legs: newLegs,
        confirmed: false,
        createdAt: multiTeam?.createdAt ?? new Date().toISOString(),
      };
      await saveMultiTeams(matchId, cleanObject(tournament));
    } catch (err) {
      handleError(err, "No se pudo cambiar el formato");
    }
  }

  const effectiveLegs: 1 | 2 = multiTeam?.legs ?? legs;
  const pairCount = (teamsForView.length * (teamsForView.length - 1)) / 2;
  const fixtureCount = pairCount * (effectiveLegs === 2 ? 2 : 1);

  return (
    <div role="tabpanel" id="panel-teams" className="space-y-4 animate-in fade-in duration-200">
      {/* Header de calidad */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale size={22} className="text-[#1f7a4f]" />
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {teamsForView.length} equipos · round-robin
            </div>
            {isBalanced ? (
              <span className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-bold border border-emerald-200">
                <ShieldCheck size={11} /> Equipos parejos
              </span>
            ) : (
              <span className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[11px] font-bold border border-amber-200">
                Nivel ±{quality.levelSpread}
              </span>
            )}
          </div>
        </div>
        {editable && !isConfirmed && (
          <button
            disabled={balancing}
            onClick={async () => {
              setBalancing(true);
              try {
                const result = balanceIntoTeams(eligiblePlayers, teamsForView.length);
                setDraftTeams(result.teams);
                scheduleSave(result.teams);
              } catch (err) {
                handleError(err, "Error al re-balancear");
              } finally {
                setBalancing(false);
              }
            }}
            className="text-xs font-bold px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            {balancing ? "..." : "Re-balancear"}
          </button>
        )}
      </div>

      {/* Hint de drag */}
      {editable && !saving && (
        <p className="text-center text-[11px] text-slate-400 font-medium">
          Mantén presionado y arrastra un jugador para moverlo de equipo
        </p>
      )}

      {/* Grilla de equipos */}
      <MultiTeamGrid
        teams={teamsForView}
        editable={editable}
        onMovePlayer={handleMove}
        currentMVPs={currentMVPs}
        voteCounts={voteCounts}
        votingClosed={votingClosed}
        onColorChange={
          isOwner && !isClosed
            ? async (teamId, color) => {
                try {
                  await updateMultiTeamColor(matchId, teamId, color);
                } catch (err) {
                  handleError(err, "No se pudo cambiar el color");
                }
              }
            : undefined
        }
      />

      {/* Compartir equipos + fixtures */}
      {isOwner && (
        <ShareReportButtons getText={onGetReportText} />
      )}

      {saving && (
        <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <Loader2 size={12} className="animate-spin" />
          <span>Sincronizando...</span>
        </div>
      )}

      {/* Formato del torneo (antes de confirmar) */}
      {isOwner && !isClosed && !isConfirmed && !saving && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Formato del torneo
          </p>
          <LegsToggle value={effectiveLegs} onChange={persistLegs} />
          <p className="text-[11px] text-slate-400 mt-2 text-center">
            Se generarán <strong>{fixtureCount}</strong> enfrentamiento{fixtureCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Confirmar equipos (genera fixtures) */}
      {isOwner && !isClosed && !isConfirmed && !saving && (
        <button
          disabled={confirming}
          onClick={async () => {
            if (!confirm("Al confirmar se generan los enfrentamientos y los jugadores verán los equipos. ¿Continuar?")) return;
            setConfirming(true);
            try {
              await confirmMultiTeams(matchId);
              toast.success("Equipos confirmados y fixtures generados");
            } catch (err) {
              handleError(err, "Error al confirmar equipos");
            } finally {
              setConfirming(false);
            }
          }}
          className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 ${
            confirming ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {confirming ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
          {confirming ? "Generando..." : "Confirmar equipos y generar fixtures"}
        </button>
      )}

      {/* Post-confirmación: los marcadores se registran en la pestaña Marcador */}
      {isConfirmed && fixtures.length > 0 && (
        <>
          {champion ? (
            <div className="flex items-center justify-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-bold border border-amber-200">
              <Trophy size={16} className="text-amber-500" />
              Campeón: {multiTeamName(champion.color)}
            </div>
          ) : (
            isOwner && !isClosed && (
              <div className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-bold border border-emerald-200 text-center">
                <ListChecks size={14} /> Registrá los marcadores en la pestaña <strong>Marcador</strong>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

function LegsToggle({ value, onChange }: { value: 1 | 2; onChange: (legs: 1 | 2) => void }) {
  const opts: { legs: 1 | 2; label: string; hint: string }[] = [
    { legs: 1, label: "Solo ida", hint: "cada par 1 vez" },
    { legs: 2, label: "Ida y vuelta", hint: "cada par 2 veces" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const active = value === o.legs;
        return (
          <button
            key={o.legs}
            onClick={() => onChange(o.legs)}
            className={`py-2 rounded-xl font-bold text-sm border-2 transition-all ${
              active
                ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {o.label}
            <span className="block text-[10px] font-medium opacity-70">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function TeamCountSelector({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (n: number) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-red-500 font-medium text-center py-2">
        Se necesitan al menos 15 confirmados para armar varios equipos
      </p>
    );
  }
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        ¿Cuántos equipos?
      </label>
      <div className="grid grid-cols-2 gap-2">
        {[3, 4].map((n) => {
          const enabled = options.includes(n);
          const active = value === n;
          const cfg = TEAM_COLOR_CONFIG[(["red", "blue", "green", "orange"][n - 1] ?? "slate") as TeamColor];
          return (
            <button
              key={n}
              disabled={!enabled}
              onClick={() => onChange(n)}
              className={`py-2.5 rounded-xl font-bold text-base border-2 transition-all ${
                active
                  ? `${cfg.bg} ${cfg.text} ${cfg.highlightBorder}`
                  : enabled
                  ? "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
              }`}
            >
              {n} equipos
            </button>
          );
        })}
      </div>
    </div>
  );
}
