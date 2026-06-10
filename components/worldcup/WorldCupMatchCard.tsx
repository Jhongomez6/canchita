"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lock, Clock } from "lucide-react";
import {
    flagEmoji,
    isPredictionLocked,
    isResultPending,
    scoreForPrediction,
    type WCMatch,
    type WCPrediction,
} from "@/lib/domain/worldcup";
import PredictionInput from "./PredictionInput";
import OthersPredictionsList from "./OthersPredictionsList";
import MatchResultBadge from "./MatchResultBadge";

const timeFmt = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
});

function TeamRow({ name, code, goals }: { name: string; code: string; goals: number | null }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{flagEmoji(code)}</span>
            <span className="flex-1 font-semibold text-gray-900 truncate">{name}</span>
            {goals != null && <span className="text-lg font-bold tabular-nums text-gray-900">{goals}</span>}
        </div>
    );
}

export default function WorldCupMatchCard({
    match,
    userId,
    snapshot,
    userPrediction,
    onPredictionSaved,
}: {
    match: WCMatch;
    userId: string;
    snapshot: { displayName: string; photoURLThumb?: string };
    userPrediction?: WCPrediction;
    onPredictionSaved: (matchId: string, home: number, away: number) => void;
}) {
    const locked = isPredictionLocked(match);
    const finished = match.status === "FINISHED";
    const pendingResult = isResultPending(match);
    const [expanded, setExpanded] = useState(false);

    // Puntos del usuario en este partido (si finalizado y predijo)
    const myPoints =
        finished && userPrediction && match.score.home != null && match.score.away != null
            ? scoreForPrediction(userPrediction, { home: match.score.home, away: match.score.away })
            : null;

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            {/* Cabecera: grupo + estado */}
            <div className="flex items-center justify-between px-4 pt-3 text-xs">
                <span className="font-semibold text-gray-400">{match.group}</span>
                {finished ? (
                    <span className="font-bold uppercase tracking-wide text-[#1f7a4f]">Finalizado</span>
                ) : pendingResult ? (
                    <span className="font-bold uppercase tracking-wide text-amber-500">Resultado pendiente</span>
                ) : locked ? (
                    <span className="flex items-center gap-1 font-bold uppercase tracking-wide text-green-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> En juego
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-gray-400">
                        <Clock className="w-3 h-3" /> {timeFmt.format(new Date(match.kickoffMs))}
                    </span>
                )}
            </div>

            {/* Equipos + marcador */}
            <div className="px-4 py-3 space-y-2">
                <TeamRow name={match.homeTeam.name} code={match.homeTeam.code} goals={match.score.home} />
                <TeamRow name={match.awayTeam.name} code={match.awayTeam.code} goals={match.score.away} />
            </div>

            {/* Estado de predicción del usuario */}
            <div className="px-4 pb-3">
                {!locked ? (
                    // ABIERTO — predecir o editar
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-[#1f7a4f]"
                    >
                        <span>
                            {userPrediction
                                ? `Tu predicción: ${userPrediction.homeGoals}-${userPrediction.awayGoals} · Editar`
                                : "Predecir"}
                        </span>
                        <motion.span animate={{ rotate: expanded ? 180 : 0 }}>
                            <ChevronDown className="w-4 h-4" />
                        </motion.span>
                    </button>
                ) : (
                    // CERRADO — mostrar predicción propia (o sin predicción) + ver las de todos
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            {userPrediction ? (
                                <span className="text-gray-600">
                                    Tu predicción:{" "}
                                    <span className="font-bold text-gray-900">
                                        {userPrediction.homeGoals}-{userPrediction.awayGoals}
                                    </span>
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-gray-400">
                                    <Lock className="w-3.5 h-3.5" /> Sin predicción
                                </span>
                            )}
                            {myPoints != null && <MatchResultBadge points={myPoints} />}
                        </div>
                        <button
                            type="button"
                            onClick={() => setExpanded((v) => !v)}
                            className="w-full flex items-center justify-between text-sm font-semibold text-gray-500"
                        >
                            <span>Ver predicciones de todos</span>
                            <motion.span animate={{ rotate: expanded ? 180 : 0 }}>
                                <ChevronDown className="w-4 h-4" />
                            </motion.span>
                        </button>
                    </div>
                )}
            </div>

            {/* Panel expandible */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-gray-100"
                    >
                        <div className="p-4">
                            {!locked ? (
                                <PredictionInput
                                    match={match}
                                    userId={userId}
                                    snapshot={snapshot}
                                    existing={userPrediction}
                                    onSaved={(h, a) => {
                                        onPredictionSaved(match.id, h, a);
                                        setExpanded(false);
                                    }}
                                />
                            ) : (
                                <OthersPredictionsList match={match} />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
