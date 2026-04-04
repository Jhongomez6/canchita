import Link from "next/link";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import { Trophy } from "lucide-react";

interface HistoryRowProps {
    match: Match;
    location?: Location;
    href: string;
    userId?: string;
}

type ResultChip = "G" | "E" | "P" | null;

function getResult(match: Match, userId?: string): ResultChip {
    if (!match.score || !match.teams) return null;

    const scoreA = match.score.A ?? 0;
    const scoreB = match.score.B ?? 0;

    const isInTeamA = match.teams.A?.some((p) => p.uid === userId);
    const isInTeamB = match.teams.B?.some((p) => p.uid === userId);

    if (!isInTeamA && !isInTeamB) return null;

    const won = isInTeamA ? scoreA > scoreB : scoreB > scoreA;
    const draw = scoreA === scoreB;

    if (draw) return "E";
    return won ? "G" : "P";
}

/**
 * Obtiene todos los ganadores del MVP (puede haber empate).
 * Retorna array de UIDs que ganaron el MVP.
 */
function getMvpWinners(match: Match): string[] {
    if (!match.mvpVotes || typeof match.mvpVotes !== "object") {
        return [];
    }

    // mvpVotes es Record<string, string> donde value es el UID del MVP
    const votes = Object.values(match.mvpVotes).filter(v => typeof v === "string" && v.length > 0);

    if (votes.length === 0) {
        return [];
    }

    // Contar votos por UID
    const counts: Record<string, number> = {};
    for (const mvpUid of votes) {
        counts[mvpUid] = (counts[mvpUid] ?? 0) + 1;
    }

    // Encontrar el máximo de votos
    let maxVotes = 0;
    for (const count of Object.values(counts)) {
        if (count > maxVotes) {
            maxVotes = count;
        }
    }

    // Retornar todos los que tienen el máximo de votos (pueden ser múltiples si hay empate)
    return Object.entries(counts)
        .filter(([, count]) => count === maxVotes)
        .map(([uid]) => uid);
}

const resultStyles: Record<NonNullable<ResultChip>, { bg: string; text: string; label: string }> = {
    G: { bg: "bg-emerald-100", text: "text-emerald-700", label: "G" },
    E: { bg: "bg-amber-100", text: "text-amber-700", label: "E" },
    P: { bg: "bg-red-100", text: "text-red-600", label: "P" },
};

export default function HistoryRow({ match, location, href, userId }: HistoryRowProps) {
    const dateObj = new Date(`${match.date}T12:00:00`);
    const weekDay = dateObj.toLocaleDateString("es-CO", { weekday: "short" }).replace(".", "").toUpperCase();
    const day = dateObj.getDate();
    const month = dateObj.toLocaleDateString("es-CO", { month: "short" }).replace(".", "").toUpperCase();

    const locationName = location?.name
        ? location.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
        : "Ubicación por definir";

    const result = getResult(match, userId);
    const mvpWinners = getMvpWinners(match);
    const isUserMvp = mvpWinners.includes(userId ?? "");

    return (
        <Link
            href={href}
            className="flex items-center gap-3 bg-white p-3.5 rounded-xl shadow-sm border border-slate-100 active:scale-[0.99] transition-transform hover:border-slate-200"
        >
            {/* Compact date box */}
            <div className="bg-slate-50 rounded-lg border border-slate-100 w-14 h-14 shrink-0 flex flex-col items-center justify-center">
                <span className="text-[9px] text-emerald-700 font-black uppercase tracking-widest">{weekDay}</span>
                <span className="text-xl font-black text-slate-800 leading-none">{day}</span>
                <span className="text-[9px] text-slate-400 font-semibold uppercase">{month}</span>
            </div>

            {/* Match info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 truncate">{locationName}</p>
                <span className="text-xs text-slate-400">
                    Fútbol {Math.floor(match.maxPlayers / 2)}
                </span>
            </div>

            {/* Result + score + MVP */}
            <div className="flex items-center gap-1.5 shrink-0">
                {isUserMvp && (
                    <div className="flex items-center justify-center w-7 h-7 bg-amber-100 rounded-lg" title="MVP">
                        <Trophy size={14} className="text-amber-600" />
                    </div>
                )}
                {match.score && (
                    <span className="text-sm font-bold text-slate-500 tabular-nums">
                        {match.score.A}-{match.score.B}
                    </span>
                )}
                {result && (
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${resultStyles[result].bg} ${resultStyles[result].text}`}>
                        {resultStyles[result].label}
                    </span>
                )}
            </div>
        </Link>
    );
}
