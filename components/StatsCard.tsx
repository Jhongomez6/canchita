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
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                📊 Estadísticas
            </h3>
            <div className="flex divide-x divide-slate-100">
                <StatItem label="PJ" value={stats.played || 0} colorClass="text-slate-800" />
                <StatItem label="PG" value={stats.won || 0} colorClass="text-emerald-600" />
                <StatItem label="PE" value={stats.draw || 0} colorClass="text-amber-500" />
                <StatItem label="PP" value={stats.lost || 0} colorClass="text-red-500" />
            </div>
        </div>
    );
}
