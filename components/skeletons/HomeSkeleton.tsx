import React from 'react';

export default function HomeSkeleton() {
    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-8 flex flex-col pt-safe">
            <div className="max-w-md mx-auto w-full flex-grow flex flex-col relative z-20 animate-pulse">
                {/* HEADER / GREETING */}
                <div className="bg-[#1f7a4f] text-white p-6 rounded-b-[2.5rem] shadow-lg mb-6 pt-safe">
                    <div className="flex justify-between items-start mb-4 mt-safe">
                        <div>
                            <div className="h-4 bg-emerald-700/50 rounded w-12 mb-1"></div>
                            <div className="h-8 bg-emerald-600/50 rounded w-48"></div>
                        </div>
                    </div>

                    {/* NEXT MATCH HERO CARD SKELETON */}
                    <div className="bg-white/90 rounded-2xl p-5 shadow-xl">
                        <div className="flex justify-between items-center mb-3">
                            <div className="h-6 bg-slate-200 rounded w-28"></div>
                            <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-11 h-11 bg-slate-200 rounded-full shrink-0"></div>
                            <div className="flex-1">
                                <div className="h-[24px] bg-slate-200 rounded w-11/12 mb-1"></div>
                                <div className="h-[20px] bg-slate-200 rounded w-2/3"></div>
                            </div>
                        </div>

                        <div className="h-12 bg-slate-200 rounded-xl w-full"></div>
                    </div>
                </div>

                {/* UPCOMING MATCHES TITLE */}
                <div className="px-5 mb-3 flex justify-between items-center">
                    <div className="h-5 bg-slate-200 rounded w-24"></div>
                    <div className="h-4 bg-slate-200 rounded w-12"></div>
                </div>

                {/* Match Cards Skeleton (Horizontal format) */}
                <div className="px-5 space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden h-[87px]">
                            {/* Date Box */}
                            <div className="bg-slate-50 rounded-lg p-2 min-w-[3.5rem] mr-4 border border-slate-100 flex flex-col items-center justify-center min-h-[54px]">
                                <div className="h-[10px] bg-slate-200 rounded w-8"></div>
                                <div className="h-[18px] bg-slate-200 rounded w-6 mt-1.5"></div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="h-[20px] bg-slate-200 rounded w-3/4"></div>
                                <div className="h-[18px] bg-slate-200 rounded w-11/12 mt-1"></div>
                            </div>

                            {/* Status Pill */}
                            <div>
                                <div className="h-[24px] w-[54px] bg-slate-200 rounded-md"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
