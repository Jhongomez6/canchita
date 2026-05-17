"use client";

import Image from "next/image";
import { Star, Flag } from "lucide-react";
import type { KudoType, ReportReason } from "@/lib/domain/matchReview";
import { KUDO_META } from "@/lib/domain/matchReview";
import { POSITION_ICONS } from "@/lib/domain/player";
import type { Position } from "@/lib/domain/player";


export interface Teammate {
    uid: string;
    name: string;
    photoURL?: string;
    primaryPosition?: string;
}

interface ReportPayload {
    reason: ReportReason;
    comment: string;
}

interface Props {
    teammates: Teammate[];
    kudos: Record<string, KudoType | null>;
    reports: Record<string, ReportPayload | null>;
    onKudoTap: (teammate: Teammate) => void;
    onReportTap: (teammate: Teammate) => void;
    onPlayerTap?: (teammate: Teammate) => void;
    disabled?: boolean;
}

export default function TeammateFeedbackList({
    teammates,
    kudos,
    reports,
    onKudoTap,
    onReportTap,
    onPlayerTap,
    disabled = false,
}: Props) {
    if (teammates.length === 0) {
        return (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm text-slate-400 text-center">No hay compañeros registrados para reconocer</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="px-5 pt-4 pb-2">
                <h2 className="text-sm font-bold text-slate-700">Jugadores del partido</h2>
                <p className="text-xs text-slate-400 mt-0.5">Reconoce a alguien que se destacó hoy</p>
            </div>

            <ul className="divide-y divide-slate-50">
                {teammates.map((tm) => {
                    const kudo = kudos[tm.uid] ?? null;
                    const report = reports[tm.uid] ?? null;
                    const positionEmoji = POSITION_ICONS[tm.primaryPosition as Position] ?? null;

                    return (
                        <li key={tm.uid} className="flex items-center gap-3 px-5 py-3">
                            {/* Avatar + name — tappable to open FIFA card */}
                            <button
                                type="button"
                                onClick={() => onPlayerTap?.(tm)}
                                disabled={!onPlayerTap || disabled}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity disabled:cursor-default"
                            >
                                <div className="relative w-10 h-10 shrink-0">
                                    {tm.photoURL ? (
                                        <Image
                                            src={tm.photoURL}
                                            alt={tm.name}
                                            fill
                                            className="rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-500">
                                            {tm.name[0]?.toUpperCase()}
                                        </div>
                                    )}
                                    {positionEmoji && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center border border-slate-100 text-[8px] leading-none">
                                            {positionEmoji}
                                        </div>
                                    )}
                                </div>

                                {/* Name + kudo badge */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 truncate">{tm.name}</p>
                                    {kudo && (
                                        <p className="text-xs text-amber-600 font-medium mt-0.5">
                                            {KUDO_META[kudo].emoji} {KUDO_META[kudo].label}
                                        </p>
                                    )}
                                </div>
                            </button>

                            {/* Action buttons */}
                            <div className="flex gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => !disabled && onKudoTap(tm)}
                                    disabled={disabled}
                                    aria-label={`Dar kudo a ${tm.name}`}
                                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${
                                        kudo
                                            ? "bg-amber-50 border-amber-300"
                                            : "bg-slate-50 border-slate-200 hover:border-amber-200"
                                    } ${disabled ? "cursor-default" : ""}`}
                                >
                                    <Star
                                        size={16}
                                        className={kudo ? "text-amber-400 fill-amber-400" : "text-slate-300"}
                                        strokeWidth={1.5}
                                    />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => !disabled && onReportTap(tm)}
                                    disabled={disabled}
                                    aria-label={`Reportar a ${tm.name}`}
                                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${
                                        report
                                            ? "bg-red-50 border-red-300"
                                            : "bg-slate-50 border-slate-200 hover:border-red-200"
                                    } ${disabled ? "cursor-default" : ""}`}
                                >
                                    <Flag
                                        size={16}
                                        className={report ? "text-red-500" : "text-slate-300"}
                                        fill={report ? "currentColor" : "none"}
                                        strokeWidth={1.5}
                                    />
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
