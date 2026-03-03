import React from 'react';

export default function NotificationsSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe">
            <div className="max-w-md mx-auto relative z-20 pb-24">

                {/* HEADER */}
                <div className="flex items-center justify-between mb-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] px-5">
                    <div className="h-7 w-40 bg-slate-200 rounded"></div>
                </div>

                {/* CONTROLS */}
                <div className="px-5 mb-4 mt-6 flex justify-end">
                    <div className="h-4 w-24 bg-slate-200 rounded"></div>
                </div>

                {/* NOTIFICATIONS LIST */}
                <div className="px-4 space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="w-full text-left p-4 rounded-xl border border-slate-100 bg-white flex items-start gap-3">
                            <div className="h-6 w-6 bg-slate-200 rounded-full flex-shrink-0 mt-0.5"></div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="h-4 w-2/3 bg-slate-200 rounded"></div>
                                    <div className="h-2 w-2 bg-slate-200 rounded-full flex-shrink-0"></div>
                                </div>
                                <div className="h-3 w-full bg-slate-200 rounded mb-1.5"></div>
                                <div className="h-3 w-4/5 bg-slate-200 rounded"></div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
