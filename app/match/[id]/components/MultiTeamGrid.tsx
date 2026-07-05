"use client";

import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import PlayerAvatar from "@/components/PlayerAvatar";
import { POSITION_ICONS, type Player } from "@/lib/domain/player";
import { TEAM_COLOR_CONFIG, type TeamColor } from "@/lib/domain/team-colors";
import { Shield, Zap, Users, Crown } from "lucide-react";
import { multiTeamName, type MultiTeam } from "@/lib/domain/multiTeam";
import TeamColorPicker from "./TeamColorPicker";

/** Orden de display por posición primaria (la misma que muestra el ícono del avatar). */
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
function sortByPrimaryPosition(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const pa = POS_ORDER[a.primaryPosition ?? a.positions?.[0] ?? "MID"] ?? 99;
    const pb = POS_ORDER[b.primaryPosition ?? b.positions?.[0] ?? "MID"] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.level ?? 0) - (a.level ?? 0);
  });
}

interface MultiTeamGridProps {
  teams: MultiTeam[];
  editable: boolean;
  /** Mueve un jugador (por key) a otro equipo. */
  onMovePlayer?: (playerKey: string, fromTeamId: string, toTeamId: string) => void;
  // Estado de MVP (solo lectura, para vista cerrada)
  currentMVPs?: string[];
  voteCounts?: Record<string, number>;
  votingClosed?: boolean;
  /** Muestra el nivel por jugador y el puntaje total del equipo. Solo para admins. */
  showLevels?: boolean;
  /** Si se provee (y no editable), los jugadores con uid abren su profile card al tocarlos. */
  onPlayerTap?: (uid?: string) => void;
  /** Si se provee, cada equipo muestra un selector de color (el peto real). */
  onColorChange?: (teamId: string, color: TeamColor) => void;
}

const keyOf = (p: Player) => p.id || p.uid || p.name;

export default function MultiTeamGrid({
  teams,
  editable,
  onMovePlayer,
  currentMVPs = [],
  voteCounts = {},
  votingClosed = false,
  showLevels = true,
  onPlayerTap,
  onColorChange,
}: MultiTeamGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !onMovePlayer) return;

    const from = (active.data.current?.teamId as string) ?? "";
    const playerKey = (active.data.current?.playerKey as string) ?? "";
    const overId = String(over.id);

    // El destino puede ser un equipo (droppable "t:<id>") o un jugador ("p:<team>:<key>")
    let to = "";
    if (overId.startsWith("t:")) to = overId.slice(2);
    else if (overId.startsWith("p:")) to = overId.split(":")[1] ?? "";

    if (to && from && to !== from) onMovePlayer(playerKey, from, to);
  }

  const grid = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {teams.map((team) => (
        <MultiTeamColumn
          key={team.id}
          team={team}
          editable={editable}
          currentMVPs={currentMVPs}
          voteCounts={voteCounts}
          votingClosed={votingClosed}
          showLevels={showLevels}
          onPlayerTap={onPlayerTap}
          onColorChange={onColorChange}
          otherColors={teams.filter((t) => t.id !== team.id).map((t) => t.color as TeamColor)}
        />
      ))}
    </div>
  );

  if (!editable) return grid;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
}

function MultiTeamColumn({
  team,
  editable,
  currentMVPs,
  voteCounts,
  votingClosed,
  showLevels,
  onPlayerTap,
  onColorChange,
  otherColors,
}: {
  team: MultiTeam;
  editable: boolean;
  currentMVPs: string[];
  voteCounts: Record<string, number>;
  votingClosed: boolean;
  showLevels: boolean;
  onPlayerTap?: (uid?: string) => void;
  onColorChange?: (teamId: string, color: TeamColor) => void;
  otherColors: TeamColor[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `t:${team.id}`, disabled: !editable });
  const cfg = TEAM_COLOR_CONFIG[(team.color ?? "slate") as TeamColor];
  const totalLevel = team.players.reduce((s, p) => s + (p.level ?? 0), 0);
  const sorted = sortByPrimaryPosition(team.players);

  return (
    <div
      ref={setNodeRef}
      className={`${cfg.bg} rounded-xl p-3 border ${cfg.border} min-w-0 transition-colors duration-200 ${isOver ? `ring-2 ${cfg.dotRing}` : ""}`}
    >
      <h4 className={`font-bold ${cfg.text} mb-1 text-sm flex items-center gap-1.5`}>
        <Shield size={14} fill={cfg.shieldFill} className={cfg.shieldText} />
        {multiTeamName(team.color)}
      </h4>
      <div className={`text-[10px] ${cfg.subtext} mb-2 opacity-80 font-medium flex items-center gap-3`}>
        {showLevels && (
          <span className="flex items-center gap-1"><Zap size={10} /> <strong>{totalLevel}</strong> pts</span>
        )}
        <span className="flex items-center gap-1"><Users size={10} /> {team.players.length}</span>
      </div>

      {onColorChange && (
        <div className="mb-2">
          <TeamColorPicker
            value={(team.color ?? "slate") as TeamColor}
            disabledColors={otherColors}
            onChange={(color) => onColorChange(team.id, color)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.map((p, i) => {
          const pk = keyOf(p);
          const targetId = p.uid || p.name;
          const isMvp = votingClosed && currentMVPs.includes(targetId);
          const votes = voteCounts[targetId] || 0;
          return (
            <MultiDraggablePlayer
              key={`${pk}_${i}`}
              player={p}
              teamId={team.id}
              editable={editable}
              isMvp={isMvp}
              votes={votes}
              showLevel={showLevels}
              onPlayerTap={onPlayerTap}
            />
          );
        })}
      </div>
    </div>
  );
}

function MultiDraggablePlayer({
  player,
  teamId,
  editable,
  isMvp,
  votes,
  showLevel,
  onPlayerTap,
}: {
  player: Player;
  teamId: string;
  editable: boolean;
  isMvp: boolean;
  votes: number;
  showLevel: boolean;
  onPlayerTap?: (uid?: string) => void;
}) {
  const pk = keyOf(player);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `p:${teamId}:${pk}`,
    data: { teamId, playerKey: pk },
    disabled: !editable,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, opacity: 0.85 }
    : undefined;

  const pos = player.primaryPosition || player.positions?.[0] || "MID";
  const isGuest = !player.uid || player.uid.startsWith("guest_");
  const clickable = !editable && !!onPlayerTap && !isGuest;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(editable ? { ...attributes, ...listeners } : {})}
      onClick={clickable ? () => onPlayerTap!(player.uid) : undefined}
      className={`p-2.5 bg-white border rounded-lg shadow-sm flex justify-between items-center ${editable ? "cursor-grab active:cursor-grabbing hover:border-slate-300" : clickable ? "cursor-pointer hover:border-slate-300" : "cursor-default"} ${isDragging ? "ring-2 ring-emerald-500 rotate-2" : "border-slate-200"} ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border-amber-200" : ""} transition-colors`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative shrink-0">
          {(player.photoURLThumb ?? player.photoURL) ? (
            <PlayerAvatar
              src={player.photoURLThumb ?? player.photoURL!}
              alt={player.name}
              className="w-8 h-8 rounded-full overflow-hidden relative border border-slate-200 shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-slate-100 z-10">
            {POSITION_ICONS[pos]}
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5 truncate">
            {player.name}
            {isMvp && <Crown size={12} className="text-amber-500 fill-amber-300 shrink-0" />}
          </div>
          {/* La posición ya la indica el ícono del avatar; solo el creador ve el nivel. */}
          {showLevel && (
            <div className="text-[10px] text-slate-500 font-medium flex items-center gap-0.5">
              <Zap size={10} className="text-amber-500" />{player.level ?? 2}
            </div>
          )}
        </div>
      </div>
      {votes ? (
        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">{votes} v.</span>
      ) : null}
    </div>
  );
}
