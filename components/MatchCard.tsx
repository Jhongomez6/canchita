import Link from "next/link";
import { formatTime12h } from "@/lib/date";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import { Clock, Users, LandPlot, ChevronRight } from "lucide-react";

interface MatchCardProps {
    match: Match;
    location?: Location;
    href: string;
    userConfirmed?: boolean;
}

export default function MatchCard({ match, location, href, userConfirmed }: MatchCardProps) {
    const dateObj = new Date(`${match.date}T12:00:00`);
    const month = dateObj.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '').toUpperCase();
    const day = dateObj.getDate();

    // Día de semana completo para la caja (ej: "MIÉRCOLES")
    const weekDay = dateObj.toLocaleDateString('es-CO', { weekday: 'long' }).toUpperCase();

    const locationName = location?.name
        ? location.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : "Ubicación por definir";

    const playersPerTeam = Math.floor(match.maxPlayers / 2);
    const matchFormat = `Fútbol ${playersPerTeam}`;
    const confirmedCount = (match.players?.filter(p => p.confirmed).length ?? 0)
        + (match.guests?.filter(g => !g.isWaitlist).length ?? 0);

    return (
        <Link
            href={href}
            className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 active:scale-[0.99] transition-transform hover:border-emerald-200 hover:shadow-md"
        >
            {/* DATE BOX */}
            <div className="bg-slate-50 rounded-lg p-2 text-center w-20 h-20 shrink-0 mr-4 border border-slate-100 flex flex-col items-center justify-center">
                <span className="block text-xs text-emerald-700 font-black uppercase tracking-widest">
                    {weekDay}
                </span>
                <span className="block text-2xl font-black text-slate-800 leading-none mt-0.5">
                    {day}
                </span>
                <span className="block text-[11px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                    {month}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-base font-black text-slate-800">
                    <Clock size={14} />
                    {formatTime12h(match.time)}
                </div>
                <p className="text-sm text-slate-500 font-medium mt-0.5 truncate">
                    {locationName}
                </p>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                        <Users size={13} />
                        {confirmedCount}/{match.maxPlayers}
                    </span>
                    <span className="flex items-center gap-1">
                        <LandPlot size={13} />
                        {matchFormat}
                    </span>

                </div>
            </div>

            {/* User confirmation status */}
            {userConfirmed !== undefined && (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ml-2 ${
                    userConfirmed
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-amber-100 text-amber-600'
                }`}>
                    {userConfirmed ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                    )}
                </div>
            )}

            {!userConfirmed && (
                <ChevronRight size={16} className="text-slate-300 shrink-0 ml-2" />
            )}
        </Link>
    );
}
