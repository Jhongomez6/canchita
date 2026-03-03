import React from 'react';

interface JoinSkeletonProps {
    isClosedTemplate?: boolean;
}

export default function JoinSkeleton({ isClosedTemplate = false }: JoinSkeletonProps) {
    return (
        <main className="min-h-screen bg-slate-50 pb-24 md:pb-8 pt-safe animate-pulse">
            <div className="max-w-3xl mx-auto p-4 md:p-6">

                {/* MATCH INFO CARD SKELETON */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-3">
                            <div className="h-8 w-32 bg-slate-200 rounded"></div>
                            <div className="flex gap-2">
                                <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                                <div className="h-6 w-24 bg-slate-200 rounded-full"></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
                            <div className="space-y-2">
                                <div className="h-5 w-40 bg-slate-200 rounded"></div>
                                <div className="h-4 w-48 bg-slate-200 rounded"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {isClosedTemplate ? (
                    /* CLOSED MATCH SKELETON (SCORE + TEAMS) */
                    <>
                        <div className="bg-[#1f7a4f] rounded-2xl p-6 shadow-md mb-6 flex flex-col items-center">
                            <div className="h-6 w-32 bg-emerald-600/50 rounded mb-4"></div>
                            <div className="flex items-center justify-center gap-6 w-full">
                                <div className="flex flex-col items-center">
                                    <div className="h-8 w-8 bg-emerald-600/50 rounded-full mb-2"></div>
                                    <div className="h-4 w-16 bg-emerald-600/50 rounded"></div>
                                </div>
                                <div className="h-12 w-24 bg-white/20 rounded-xl"></div>
                                <div className="flex flex-col items-center">
                                    <div className="h-8 w-8 bg-blue-500/50 rounded-full mb-2"></div>
                                    <div className="h-4 w-16 bg-blue-500/50 rounded"></div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[1, 2].map(team => (
                                <div key={team} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="bg-slate-50 p-4 border-b border-slate-200">
                                        <div className="h-6 w-32 bg-slate-200 rounded"></div>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {[1, 2, 3, 4, 5].map(p => (
                                            <div key={p} className="flex items-center gap-3 p-2 border-b border-slate-100 last:border-0">
                                                <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
                                                <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    /* OPEN MATCH SKELETON (CONFIRM CARD + PLAYERS) */
                    <>
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6 text-center">
                            <div className="h-6 w-48 bg-slate-200 rounded mx-auto mb-2"></div>
                            <div className="h-4 w-64 bg-slate-200 rounded mx-auto mb-6"></div>
                            <div className="h-14 w-full bg-slate-200 rounded-xl"></div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                            <div className="flex justify-between items-center mb-6">
                                <div className="h-6 w-48 bg-slate-200 rounded"></div>
                                <div className="h-6 w-12 bg-slate-200 rounded"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <div key={i} className="flex items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="h-10 w-10 bg-slate-200 rounded-full mr-3"></div>
                                        <div className="space-y-2">
                                            <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                            <div className="h-3 w-16 bg-slate-200 rounded"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
