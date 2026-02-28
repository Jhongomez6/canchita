import Link from "next/link";
import { formatTime12h } from "@/lib/date";
import type { Match } from "@/lib/domain/match";
import type { Location } from "@/lib/domain/location";

interface MatchCardProps {
    match: Match;
    location?: Location;
    href: string;
}

export default function MatchCard({ match, location, href }: MatchCardProps) {
    const dateObj = new Date(`${match.date}T12:00:00`);
    const month = dateObj.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '').toUpperCase();
    const day = dateObj.getDate();

    // Day of the week (e.g., "Domingo")
    const weekDayRaw = dateObj.toLocaleDateString('es-CO', { weekday: 'long' });
    const weekDay = weekDayRaw.charAt(0).toUpperCase() + weekDayRaw.slice(1);

    const isClosed = match.status === 'closed';

    return (
        <Link
            href={href}
            className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 active:scale-[0.99] transition-transform hover:border-emerald-200 hover:shadow-md"
        >
            {/* DATE BOX */}
            <div className="bg-slate-50 rounded-lg p-2 text-center min-w-[3.5rem] mr-4 border border-slate-100 flex flex-col items-center justify-center min-h-[50px]">
                <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    {month}
                </span>
                <span className="block text-lg font-black text-slate-800 leading-none mt-0.5">
                    {day}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 text-sm truncate">
                    {location?.name || "Ubicación por definir"}
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 capitalize">
                    🗓️ {weekDay} • ⏰ {formatTime12h(match.time)}
                </p>
            </div>

            <div>
                <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${isClosed
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-[#1f7a4f]'
                    }`}>
                    {isClosed ? 'Cerrado' : 'Abierto'}
                </span>
            </div>
        </Link>
    );
}
