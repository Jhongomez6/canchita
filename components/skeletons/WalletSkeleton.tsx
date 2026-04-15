export default function WalletSkeleton() {
    return (
        <div className="min-h-screen bg-slate-50 pb-24 animate-pulse">
            <div className="max-w-md mx-auto">
                {/* Header verde */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-10 rounded-b-3xl shadow-lg">
                    <div className="h-5 bg-white/20 rounded w-32 mb-1" />
                    <div className="h-3 bg-white/15 rounded w-48 mt-1" />
                    <div className="mt-6 flex justify-center">
                        <div className="h-10 bg-white/20 rounded w-40" />
                    </div>
                </div>

                <div className="px-4 -mt-4 relative z-20 space-y-4">
                    {/* Botones acción */}
                    <div className="flex gap-3">
                        <div className="flex-1 h-12 bg-slate-200 rounded-2xl" />
                        <div className="flex-1 h-12 bg-slate-200 rounded-2xl" />
                    </div>

                    {/* Card movimientos */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <div className="h-4 bg-slate-200 rounded w-28" />
                        </div>
                        <div className="divide-y divide-slate-50">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="px-5 py-3.5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                                        <div>
                                            <div className="h-3.5 bg-slate-200 rounded w-28 mb-1.5" />
                                            <div className="h-2.5 bg-slate-100 rounded w-20" />
                                        </div>
                                    </div>
                                    <div className="h-3.5 bg-slate-200 rounded w-16" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
