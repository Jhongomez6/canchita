import React from 'react';

export default function FeedbackListSkeleton() {
    return (
        <main className="min-h-screen bg-slate-50 pb-28 md:pb-8">
            <div className="max-w-4xl mx-auto p-4 md:p-8">

                {/* STATIC HEADER */}
                <div className="mb-6 bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 text-amber-50 shadow-lg text-center md:text-left flex flex-col md:flex-row items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
                            <span className="text-3xl drop-shadow-sm">📣</span> Feedback Recibido
                        </h1>
                        <p className="text-sm text-amber-100 font-medium mt-1 md:mt-0">
                            Bugs e ideas reportadas por los jugadores (Beta).
                        </p>
                    </div>

                    <div className="mt-4 md:mt-0 flex gap-3 animate-pulse">
                        <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/20 flex gap-2 items-center">
                            <div className="h-6 w-8 bg-white/30 rounded"></div>
                            <span className="text-white">totales</span>
                        </div>
                        <div className="bg-red-500/30 px-4 py-2 rounded-xl backdrop-blur-sm border border-red-300/30 flex gap-2 items-center">
                            <div className="h-6 w-6 bg-white/30 rounded"></div>
                            <span className="text-white">pendientes</span>
                        </div>
                    </div>
                </div>

                {/* SKELETON CARDS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                            key={i}
                            className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 relative overflow-hidden"
                        >
                            {/* TAG SKELETON */}
                            <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 rounded-bl-xl h-6 w-16"></div>

                            {/* DATE */}
                            <div className="mb-3 mt-1 pr-16 h-3 w-20 bg-slate-200 rounded"></div>

                            {/* MESSAGE SKELETON */}
                            <div className="mb-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="h-4 w-full bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-5/6 bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-2/3 bg-slate-200 rounded"></div>
                            </div>

                            {/* USER SKELETON */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                <div className="h-4 w-16 bg-slate-100 rounded"></div>
                            </div>

                            {/* BUTTON SKELETON */}
                            <div className="w-full mt-3 h-9 bg-slate-100 rounded-xl"></div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
