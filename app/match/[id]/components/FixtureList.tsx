"use client";

import { useState } from "react";
import { Loader2, Check, ChevronUp, ChevronDown } from "lucide-react";
import { TEAM_COLOR_CONFIG, type TeamColor } from "@/lib/domain/team-colors";
import { multiTeamName, type MultiTeam, type Fixture } from "@/lib/domain/multiTeam";

interface FixtureListProps {
  teams: MultiTeam[];
  fixtures: Fixture[];
  readOnly: boolean;
  onSaveScore: (fixtureId: string, scoreHome: number, scoreAway: number) => Promise<void>;
  /** Si se provee (y no readOnly), muestra flechas para reordenar el fixture. */
  onReorder?: (fixtureId: string, direction: "up" | "down") => Promise<void>;
}

/** Lista de enfrentamientos del round-robin. El admin carga cada marcador y define el orden. */
export default function FixtureList({ teams, fixtures, readOnly, onSaveScore, onReorder }: FixtureListProps) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const canReorder = !readOnly && !!onReorder && fixtures.length > 1;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Enfrentamientos
        </h4>
        {canReorder && (
          <span className="text-[10px] text-slate-400 font-medium">Ordena con ↑↓</span>
        )}
      </div>
      <div className="divide-y divide-slate-50">
        {fixtures.map((f, i) => (
          <FixtureRow
            key={f.id}
            fixture={f}
            home={teamById.get(f.home)}
            away={teamById.get(f.away)}
            readOnly={readOnly}
            onSaveScore={onSaveScore}
            onReorder={canReorder ? onReorder : undefined}
            isFirst={i === 0}
            isLast={i === fixtures.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function FixtureRow({
  fixture,
  home,
  away,
  readOnly,
  onSaveScore,
  onReorder,
  isFirst,
  isLast,
}: {
  fixture: Fixture;
  home?: MultiTeam;
  away?: MultiTeam;
  readOnly: boolean;
  onSaveScore: (fixtureId: string, scoreHome: number, scoreAway: number) => Promise<void>;
  onReorder?: (fixtureId: string, direction: "up" | "down") => Promise<void>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [h, setH] = useState<string>(fixture.scoreHome != null ? String(fixture.scoreHome) : "");
  const [a, setA] = useState<string>(fixture.scoreAway != null ? String(fixture.scoreAway) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reordering, setReordering] = useState(false);

  const cfgH = TEAM_COLOR_CONFIG[(home?.color ?? "slate") as TeamColor];
  const cfgA = TEAM_COLOR_CONFIG[(away?.color ?? "slate") as TeamColor];
  const pending = fixture.scoreHome == null || fixture.scoreAway == null;

  async function commit() {
    const nh = parseInt(h, 10);
    const na = parseInt(a, 10);
    if (Number.isNaN(nh) || Number.isNaN(na)) return;
    if (nh === fixture.scoreHome && na === fixture.scoreAway) return; // sin cambios
    setSaving(true);
    setSaved(false);
    try {
      await onSaveScore(fixture.id, nh, na);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  }

  async function move(direction: "up" | "down") {
    if (!onReorder) return;
    setReordering(true);
    try {
      await onReorder(fixture.id, direction);
    } finally {
      setReordering(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      {/* Reordenar */}
      {onReorder && (
        <div className="flex flex-col shrink-0 -my-1">
          <button
            onClick={() => move("up")}
            disabled={isFirst || reordering}
            className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:hover:text-slate-300 p-0.5"
            aria-label="Subir enfrentamiento"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => move("down")}
            disabled={isLast || reordering}
            className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:hover:text-slate-300 p-0.5"
            aria-label="Bajar enfrentamiento"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      {/* Home */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className="font-bold text-slate-700 text-sm truncate text-right">{home ? multiTeamName(home.color) : fixture.home}</span>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfgH.dot}`} />
      </div>

      {/* Score */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={h}
          disabled={readOnly}
          onChange={(e) => setH(e.target.value)}
          onBlur={commit}
          className="w-11 text-center text-base font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-lg py-1.5 disabled:bg-transparent disabled:border-transparent tabular-nums"
          aria-label={`Goles ${home ? multiTeamName(home.color) : fixture.home}`}
        />
        <span className="text-slate-300 font-bold text-sm">-</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={a}
          disabled={readOnly}
          onChange={(e) => setA(e.target.value)}
          onBlur={commit}
          className="w-11 text-center text-base font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-lg py-1.5 disabled:bg-transparent disabled:border-transparent tabular-nums"
          aria-label={`Goles ${away ? multiTeamName(away.color) : fixture.away}`}
        />
      </div>

      {/* Away */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfgA.dot}`} />
        <span className="font-bold text-slate-700 text-sm truncate">{away ? multiTeamName(away.color) : fixture.away}</span>
      </div>

      {/* Status */}
      <div className="w-4 shrink-0 flex items-center justify-center">
        {saving ? (
          <Loader2 size={13} className="animate-spin text-slate-400" />
        ) : saved ? (
          <Check size={13} className="text-emerald-500" />
        ) : pending && !readOnly ? (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Pendiente" />
        ) : null}
      </div>
    </div>
  );
}
