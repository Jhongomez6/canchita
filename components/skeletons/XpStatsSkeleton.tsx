/**
 * Skeleton de carga para XpStatsSection.
 */

export default function XpStatsSkeleton() {
    return (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <div className="h-5 w-28 bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="px-5 pb-3 flex items-center justify-between">
                <div className="space-y-1.5">
                    <div className="h-7 w-32 bg-slate-200 rounded-full animate-pulse" />
                    <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="space-y-1 text-right">
                    <div className="h-2 w-8 bg-slate-100 rounded ml-auto animate-pulse" />
                    <div className="h-10 w-14 bg-slate-200 rounded animate-pulse" />
                </div>
            </div>
            <div className="px-5 pb-4">
                <div className="h-2.5 bg-slate-200 rounded-full animate-pulse" />
            </div>
            <div className="h-12 bg-slate-100 border-t border-slate-100 animate-pulse" />
        </section>
    );
}
