import React from 'react';

export default function NotificationsSkeleton() {
    return (
        <main className="min-h-screen bg-slate-50 pb-28 md:pb-8">
            <div className="max-w-md mx-auto p-4">

                {/* STATIC HEADER */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        🔔 Notificaciones
                    </h1>
                </div>

                {/* SKELETON LIST */}
                <div className="space-y-2 animate-pulse">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="w-full text-left p-4 rounded-xl border bg-emerald-50 border-emerald-100 shadow-sm"
                        >
                            <div className="flex items-start gap-3">
                                <div className="text-xl mt-0.5 opacity-40">
                                    🔔
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
                                        <div className="h-2 w-2 bg-slate-200 rounded-full flex-shrink-0"></div>
                                    </div>
                                    <div className="h-3 w-full bg-slate-200 rounded mt-1.5 mb-1"></div>
                                    <div className="h-3 w-5/6 bg-slate-200 rounded"></div>

                                    <div className="mt-3">
                                        <div className="h-2 w-16 bg-slate-200 rounded"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
