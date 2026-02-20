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
    // Format date: "ENE 18"
    const dateObj = new Date(`${match.date}T12:00:00`);
    const month = dateObj.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '').toUpperCase();
    const day = dateObj.getDate();

    const isClosed = match.status === 'closed';

    return (
        <Link
            href={href}
            className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 active:scale-[0.99] transition-transform hover:border-emerald-200 hover:shadow-md"
        >
            {/* DATE BOX */}
            <div className="bg-slate-50 rounded-lg p-2 text-center min-w-[3.5rem] mr-4 border border-slate-100">
                <span className="block text-xs text-slate-500 font-bold uppercase">
                    {month}
                </span>
                <span className="block text-lg font-black text-slate-800 leading-none">
                    {day}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 text-sm truncate">
                    {location?.name || "Ubicación por definir"}
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                    ⏰ {formatTime12h(match.time)}
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
