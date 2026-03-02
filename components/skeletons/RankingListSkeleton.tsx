import React from 'react';

export default function RankingListSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe">
            <div className="max-w-4xl mx-auto p-5 relative z-20 pb-24">

                {/* HEADER AREA */}
                <div className="flex items-center gap-3 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="h-10 w-10 bg-slate-200 rounded-xl"></div>
                    <div className="flex-1">
                        <div className="h-6 w-48 bg-slate-200 rounded mb-1"></div>
                        <div className="h-4 w-32 bg-slate-200 rounded"></div>
                    </div>
                </div>

                {/* CONTROLS */}
                <div className="flex justify-end gap-2 mb-4">
                    <div className="h-10 w-32 bg-white border border-slate-100 rounded-xl shadow-sm"></div>
                    <div className="h-10 w-32 bg-white border border-slate-100 rounded-xl shadow-sm"></div>
                </div>

                {/* DESKTOP TABLE SKELETON */}
                <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
                    <div className="w-full h-12 bg-slate-100 flex items-center px-6 gap-4">
                        <div className="h-4 w-8 bg-slate-200 rounded"></div>
                        <div className="h-4 w-48 bg-slate-200 rounded flex-1"></div>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-4 w-16 bg-slate-200 rounded"></div>
                        ))}
                    </div>

                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="w-full h-16 border-t border-slate-100 flex items-center px-6 gap-4">
                            <div className="h-6 w-8 bg-slate-200 rounded"></div>
                            <div className="flex items-center gap-3 flex-1">
                                <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
                                <div className="h-5 w-32 bg-slate-200 rounded"></div>
                            </div>
                            {[1, 2, 3, 4, 5, 6].map(j => (
                                <div key={j} className="h-5 w-12 bg-slate-200 rounded"></div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* MOBILE CARDS SKELETON */}
                <div className="md:hidden space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 bg-emerald-100 rounded-lg flex items-center justify-center font-black text-emerald-700">#</div>
                                <div className="h-12 w-12 bg-slate-200 rounded-full"></div>
                                <div className="h-5 w-32 bg-slate-200 rounded"></div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl">
                                <div className="h-8 w-full bg-slate-200 rounded"></div>
                                <div className="h-8 w-full bg-slate-200 rounded"></div>
                                <div className="h-8 w-full bg-slate-200 rounded"></div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
