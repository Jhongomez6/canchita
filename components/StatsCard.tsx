import type { UserStats } from "@/lib/domain/user";

interface StatsCardProps {
    stats: UserStats;
}

const StatItem = ({ label, value, colorClass }: { label: string, value: number, colorClass: string }) => (
    <div className="flex flex-col items-center flex-1">
        <span className={`text-2xl font-black ${colorClass}`}>{value}</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
);

export default function StatsCard({ stats }: StatsCardProps) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    📊 Estadísticas
                </h3>
                <div className="group relative flex items-center" tabIndex={0}>
                    <span className="cursor-pointer w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                        ?
                    </span>
                    <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-56 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50 text-left">
                        <div className="mb-1"><span className="font-bold text-slate-300">PJ:</span> Partidos Jugados</div>
                        <div className="mb-1"><span className="font-bold text-emerald-400">PG:</span> Partidos Ganados</div>
                        <div className="mb-1"><span className="font-bold text-amber-300">PE:</span> Partidos Empatados</div>
                        <div><span className="font-bold text-red-400">PP:</span> Partidos Perdidos</div>
                        <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                </div>
            </div>
            <div className="flex divide-x divide-slate-100">
                <StatItem label="PJ" value={stats.played || 0} colorClass="text-slate-800" />
                <StatItem label="PG" value={stats.won || 0} colorClass="text-emerald-600" />
                <StatItem label="PE" value={stats.draw || 0} colorClass="text-amber-500" />
                <StatItem label="PP" value={stats.lost || 0} colorClass="text-red-500" />
            </div>
        </div>
    );
}
