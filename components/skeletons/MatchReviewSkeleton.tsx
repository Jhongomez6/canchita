export default function MatchReviewSkeleton() {
    return (
        <main className="min-h-screen bg-slate-50 pb-24">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-[#1f7a4f] text-white px-5 pt-safe pb-5">
                    <div className="h-6 w-6 bg-white/20 rounded mb-3" />
                    <div className="h-6 w-48 bg-white/20 rounded mb-1" />
                    <div className="h-4 w-32 bg-white/10 rounded" />
                </div>

                <div className="px-4 py-5 space-y-4 animate-pulse">
                    {/* Rating card */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
                        <div className="flex gap-2 justify-center mb-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="w-10 h-10 bg-slate-200 rounded-full" />
                            ))}
                        </div>
                        <div className="flex gap-3 mb-4">
                            <div className="flex-1 h-10 bg-slate-100 rounded-xl" />
                            <div className="flex-1 h-10 bg-slate-100 rounded-xl" />
                        </div>
                        <div className="h-20 bg-slate-100 rounded-xl" />
                    </div>

                    {/* Teammates card */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
                                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                                <div className="flex-1 h-4 bg-slate-200 rounded" />
                                <div className="w-8 h-8 bg-slate-100 rounded-full" />
                                <div className="w-8 h-8 bg-slate-100 rounded-full" />
                            </div>
                        ))}
                    </div>

                    {/* Submit button */}
                    <div className="h-12 bg-slate-200 rounded-xl" />
                </div>
            </div>
        </main>
    );
}
