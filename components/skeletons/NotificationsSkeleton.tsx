import React from 'react';

export default function NotificationsSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe">
            <div className="max-w-md mx-auto relative z-20 pb-24">

                {/* HEADER */}
                <div className="bg-[#1f7a4f] text-white p-6 rounded-b-[2.5rem] shadow-lg mb-6 relative overflow-hidden pt-[calc(env(safe-area-inset-top)+1.5rem)]">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <div className="h-8 w-40 bg-white/20 rounded mb-2"></div>
                            <div className="h-4 w-48 bg-white/20 rounded"></div>
                        </div>
                        <div className="h-10 w-10 bg-white/20 rounded-2xl"></div>
                    </div>
                </div>

                {/* CONTROLS */}
                <div className="px-5 mb-4 flex justify-end">
                    <div className="h-5 w-24 bg-slate-200 rounded"></div>
                </div>

                {/* NOTIFICATIONS LIST */}
                <div className="px-5 space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                            <div className="h-12 w-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                            <div className="flex-1 space-y-2 py-1">
                                <div className="h-5 w-3/4 bg-slate-200 rounded"></div>
                                <div className="h-4 w-full bg-slate-200 rounded"></div>
                                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                                <div className="h-3 w-16 bg-slate-200 rounded mt-2"></div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
