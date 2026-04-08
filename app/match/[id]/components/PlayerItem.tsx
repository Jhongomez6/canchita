"use client";

import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { POSITION_ICONS, type Position } from "@/lib/domain/player";
import { Zap, Crown } from "lucide-react";

interface PlayerItemProps {
  id: string;
  name: string;
  photoURL?: string;
  photoURLThumb?: string;
  level: number;
  primaryPosition?: Position;
  positions: Position[];
  isMvp?: boolean;
  votes?: number;
  disabled?: boolean;
}

export default function PlayerItem({
  id,
  name,
  photoURL,
  photoURLThumb,
  level,
  primaryPosition,
  positions,
  isMvp,
  votes,
  disabled
}: PlayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto" as const,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 bg-white border rounded-lg shadow-sm flex justify-between items-center ${disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing hover:border-slate-300 transition-colors"} ${isDragging ? "ring-2 ring-emerald-500 rotate-2" : "border-slate-200"} ${isMvp ? "bg-gradient-to-r from-amber-50 to-transparent border-amber-200 ring-1 ring-amber-100" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {(photoURLThumb ?? photoURL) ? (
            <div className="w-8 h-8 rounded-full overflow-hidden relative border border-slate-200 shadow-sm">
              <Image src={photoURLThumb ?? photoURL!} alt={name} fill className="object-cover" sizes="48px" unoptimized />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] shadow-sm border border-slate-100 z-10">
            {POSITION_ICONS[primaryPosition || positions[0] || "MID"]}
          </div>
        </div>
        <div>
          <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
            {name}
            {isMvp && <Crown size={12} className="text-amber-500 fill-amber-300" />}
          </div>
          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
            <span className="flex items-center gap-0.5"><Zap size={10} className="text-amber-500" />{level}</span>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1">
              {primaryPosition && (
                <span className="text-blue-600 font-bold">{primaryPosition}</span>
              )}
              {positions.filter(p => p !== primaryPosition).map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                  {(primaryPosition || i > 0) && <span className="text-slate-300">/</span>}
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {votes ? (
        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{votes} v.</span>
      ) : null}
    </div>
  );
}
