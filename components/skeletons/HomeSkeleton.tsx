import React from 'react';

export default function HomeSkeleton() {
    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-8 flex flex-col pt-safe">
            <div className="max-w-md mx-auto w-full flex-grow flex flex-col relative z-20 animate-pulse">
                {/* HEADER / IDENTITY */}
                <div className="bg-[#1f7a4f] text-white p-5 rounded-b-[2.5rem] shadow-lg pt-safe">
                    <div className="flex items-center gap-3">
                        {/* Avatar skeleton */}
                        <div className="w-12 h-12 rounded-full bg-white/20 shrink-0"></div>
                        <div className="flex-1">
                            <div className="h-5 bg-emerald-600/50 rounded w-32 mb-1"></div>
                            <div className="h-3 bg-emerald-700/50 rounded w-24"></div>
                        </div>
                    </div>
                </div>

                <div className="px-5">
                    {/* HERO CARD SKELETON */}
                    <div className="bg-white rounded-3xl p-5 shadow-[0_8px_40px_-8px_rgba(31,122,79,0.15)] mb-5">
                        {/* Badge */}
                        <div className="mb-3">
                            <div className="h-6 bg-slate-200 rounded-md w-32"></div>
                        </div>
                        {/* Date box + info */}
                        <div className="flex items-start gap-4 mb-3">
                            <div className="bg-slate-50 rounded-xl w-24 h-24 shrink-0 flex flex-col items-center justify-center gap-1.5 border border-slate-100">
                                <div className="h-2.5 bg-slate-200 rounded w-14"></div>
                                <div className="h-9 bg-slate-200 rounded w-8"></div>
                                <div className="h-2.5 bg-slate-200 rounded w-8"></div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="h-7 bg-slate-200 rounded w-24"></div>
                                <div className="h-4 bg-slate-200 rounded w-4/5 mt-2"></div>
                                <div className="flex gap-3 mt-2">
                                    <div className="h-3 bg-slate-200 rounded w-16"></div>
                                    <div className="h-3 bg-slate-200 rounded w-16"></div>
                                </div>
                            </div>
                        </div>

                        {/* Capacity bar */}
                        <div className="mb-3 h-1.5 bg-slate-200 rounded-full w-full"></div>

                        {/* Status chip */}
                        <div className="mb-3">
                            <div className="h-6 bg-slate-200 rounded-lg w-24"></div>
                        </div>

                        {/* Avatars */}
                        <div className="flex items-center gap-2 mb-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="w-8 h-8 rounded-full bg-slate-200"></div>
                            ))}
                        </div>

                        {/* CTA Button */}
                        <div className="h-12 bg-slate-200 rounded-xl w-full"></div>
                    </div>

                    {/* QUICK STATS SKELETON */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-5">
                        {/* Header */}
                        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-slate-200 rounded"></div>
                                <div className="h-3.5 bg-slate-200 rounded w-12"></div>
                            </div>
                            <div className="h-3 bg-slate-200 rounded w-24"></div>
                        </div>
                        {/* Stats */}
                        <div className="flex divide-x divide-slate-100">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex-1 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <div className="w-7 h-7 bg-slate-200 rounded"></div>
                                        <div className="h-8 bg-slate-200 rounded w-8"></div>
                                    </div>
                                    <div className="h-2 bg-slate-200 rounded w-14 mx-auto"></div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ACTIVE MATCHES SECTION */}
                    <div className="mb-3">
                        <div className="h-4 bg-slate-200 rounded w-28 mb-3"></div>
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <div className="bg-slate-50 rounded-lg w-20 h-20 shrink-0 mr-4 border border-slate-100 flex flex-col gap-1.5"></div>
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="h-4 bg-slate-200 rounded w-24"></div>
                                        <div className="h-3 bg-slate-200 rounded w-4/5"></div>
                                    </div>
                                    <div className="w-6 h-6 bg-slate-200 rounded shrink-0"></div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* HISTORY SECTION */}
                    <div className="mt-6 pb-3">
                        <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-100">
                                    <div className="w-14 h-14 bg-slate-200 rounded-lg shrink-0"></div>
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-3 bg-slate-200 rounded w-32"></div>
                                        <div className="h-2 bg-slate-200 rounded w-20"></div>
                                    </div>
                                    <div className="w-7 h-7 bg-slate-200 rounded shrink-0"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
