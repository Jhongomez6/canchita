export default function VenueAnalyticsSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            {/* Period chips */}
            <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-8 bg-slate-100 rounded-full w-24" />
                ))}
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-3 space-y-2 border border-slate-100">
                        <div className="h-7 w-7 bg-slate-200 rounded-lg" />
                        <div className="h-3 bg-slate-200 rounded w-16" />
                        <div className="h-5 bg-slate-200 rounded w-20" />
                    </div>
                ))}
            </div>

            {/* Trend card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                <div className="h-3.5 bg-slate-200 rounded w-32" />
                <div className="h-28 bg-slate-50 rounded-lg" />
            </div>

            {/* Heatmap card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                <div className="h-3.5 bg-slate-200 rounded w-40" />
                <div className="h-40 bg-slate-50 rounded-lg" />
            </div>

            {/* Breakdown cards */}
            {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                    <div className="h-3.5 bg-slate-200 rounded w-28" />
                    {[1, 2, 3].map((j) => (
                        <div key={j} className="space-y-1.5">
                            <div className="h-3 bg-slate-100 rounded w-full" />
                            <div className="h-2 bg-slate-100 rounded-full w-full" />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
