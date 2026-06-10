"use client";

import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { getMatchPredictions } from "@/lib/worldcup";
import { logWorldCupOthersViewed } from "@/lib/analytics";
import MatchResultBadge from "./MatchResultBadge";
import type { WCMatch, WCPrediction } from "@/lib/domain/worldcup";

/**
 * Lista de predicciones de todos los usuarios para un partido.
 * Las Firestore rules solo devuelven datos si el partido ya arrancó.
 */
export default function OthersPredictionsList({ match }: { match: WCMatch }) {
    const [preds, setPreds] = useState<WCPrediction[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        logWorldCupOthersViewed(match.id);
        getMatchPredictions(match.id)
            .then((list) => {
                // Ordenar: más puntos primero (si hay), luego por nombre
                list.sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.displayName.localeCompare(b.displayName));
                setPreds(list);
            })
            .catch(() => setError(true));
    }, [match.id]);

    if (error) {
        return <p className="text-sm text-gray-400 text-center py-4">No se pudieron cargar las predicciones.</p>;
    }
    if (preds === null) {
        return (
            <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
        );
    }
    if (preds.length === 0) {
        return <p className="text-sm text-gray-400 text-center py-4">Nadie predijo este partido.</p>;
    }

    return (
        <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-gray-500">
                <Users className="w-3.5 h-3.5" />
                {preds.length} {preds.length === 1 ? "predicción" : "predicciones"}
            </div>
            <ul className="space-y-1.5">
                {preds.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                        {p.photoURLThumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photoURLThumb} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                            <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                {p.displayName.charAt(0).toUpperCase()}
                            </span>
                        )}
                        <span className="flex-1 truncate text-gray-700">{p.displayName}</span>
                        <span className="font-bold tabular-nums text-gray-900">
                            {p.homeGoals}-{p.awayGoals}
                        </span>
                        {p.points != null && <MatchResultBadge points={p.points as 0 | 1 | 3} />}
                    </li>
                ))}
            </ul>
        </div>
    );
}
