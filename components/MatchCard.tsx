import Link from "next/link";
import { formatTime12h } from "@/lib/date";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";
import { Clock, Users, LandPlot, ChevronRight } from "lucide-react";

interface MatchCardProps {
    match: Match;
    location?: Location;
    href: string;
}

export default function MatchCard({ match, location, href }: MatchCardProps) {
    const dateObj = new Date(`${match.date}T12:00:00`);
    const month = dateObj.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '').toUpperCase();
    const day = dateObj.getDate();

    // Día de semana completo para la caja (ej: "MIÉRCOLES")
    const weekDay = dateObj.toLocaleDateString('es-CO', { weekday: 'long' }).toUpperCase();

    const isClosed = match.status === 'closed';

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
            className={`flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 active:scale-[0.99] transition-transform hover:border-emerald-200 hover:shadow-md${isClosed ? ' opacity-75' : ''}`}
        >
            {/* DATE BOX */}
            <div className="bg-slate-50 rounded-lg p-2 text-center w-[4.5rem] h-[4.5rem] shrink-0 mr-4 border border-slate-100 flex flex-col items-center justify-center">
                <span className="block text-[9px] text-emerald-700 font-black uppercase tracking-widest">
                    {weekDay}
                </span>
                <span className="block text-xl font-black text-slate-800 leading-none mt-0.5">
                    {day}
                </span>
                <span className="block text-[9px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                    {month}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-sm font-black text-slate-800">
                    <Clock size={13} />
                    {formatTime12h(match.time)}
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                    {locationName}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                        <Users size={11} />
                        {confirmedCount}/{match.maxPlayers}
                    </span>
                    <span className="flex items-center gap-1">
                        <LandPlot size={11} />
                        {matchFormat}
                    </span>

                </div>
            </div>

            <ChevronRight size={16} className="text-slate-300 shrink-0 ml-2" />
        </Link>
    );
}
