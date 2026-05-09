export default function DailyBalanceSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            {/* Date picker skeleton */}
            <div className="h-12 bg-slate-100 rounded-xl" />

            {/* 3 cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4 space-y-2">
                        <div className="h-3 bg-slate-200 rounded w-20" />
                        <div className="h-6 bg-slate-200 rounded w-28" />
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                    </div>
                ))}
            </div>

            {/* Lista de pagos skeleton */}
            <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="h-3.5 bg-slate-200 rounded w-32" />
                            <div className="h-3.5 bg-slate-200 rounded w-20" />
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded w-40" />
                        <div className="flex gap-2">
                            <div className="h-5 bg-emerald-50 rounded-full w-20" />
                            <div className="h-5 bg-blue-50 rounded-full w-20" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
