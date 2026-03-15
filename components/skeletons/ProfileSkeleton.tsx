import React from 'react';

function FifaCardSkeleton() {
    return (
        <div className="relative w-full max-w-[185px] animate-pulse" style={{ perspective: "1000px" }}>
            {/* Same SVG clip-path as FifaPlayerCard */}
            <svg width="0" height="0" className="absolute">
                <defs>
                    <clipPath id="fifa-card-outer-skel" clipPathUnits="objectBoundingBox">
                        <path d="M 0.1,0.05 Q 0.5,0 0.9,0.05 L 1,0.1 L 1,0.84 Q 1,0.87 0.96,0.89 Q 0.72,0.97 0.5,1 Q 0.28,0.97 0.04,0.89 Q 0,0.87 0,0.84 L 0,0.1 Z" />
                    </clipPath>
                    <clipPath id="fifa-card-inner-skel" clipPathUnits="objectBoundingBox">
                        <path d="M 0.1,0.05 Q 0.5,0 0.9,0.05 L 1,0.1 L 1,0.84 Q 1,0.87 0.96,0.89 Q 0.72,0.97 0.5,1 Q 0.28,0.97 0.04,0.89 Q 0,0.87 0,0.84 L 0,0.1 Z" />
                    </clipPath>
                </defs>
            </svg>

            {/* Card frame — same gradient as real card */}
            <div
                className="relative p-[2px]"
                style={{ clipPath: "url(#fifa-card-outer-skel)", background: "linear-gradient(to bottom, #4ade80, #1f7a4f, #0d3d26)" }}
            >
                <div
                    className="relative overflow-hidden"
                    style={{ clipPath: "url(#fifa-card-inner-skel)", background: "linear-gradient(to bottom, #145c3a, #0d3d26, #071e12)" }}
                >
                    {/* Photo area */}
                    <div className="mt-3 mb-1">
                        <div className="relative mx-1.5 h-[180px]">
                            {/* Photo circle */}
                            <div className="w-full h-full rounded-full bg-emerald-900/60" />
                            {/* OVR + position overlay — top-left */}
                            <div className="absolute top-0 left-0 -translate-x-[5%] flex flex-col items-center gap-0.5">
                                <div className="h-[38px] w-[28px] bg-green-700/50 rounded" />
                                <div className="h-[13px] w-[32px] bg-green-700/40 rounded" />
                            </div>
                        </div>
                    </div>

                    {/* Name bar */}
                    <div className="relative mx-2 mb-1">
                        <div className="h-[1px] bg-gradient-to-r from-transparent via-green-400/20 to-transparent mb-2" />
                        <div className="flex justify-center">
                            <div className="h-[13px] w-[100px] bg-green-700/50 rounded" />
                        </div>
                    </div>

                    {/* Stats row — 6 cells */}
                    <div className="flex justify-center gap-x-3 px-2 pb-1 mb-1">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="flex flex-col items-center gap-1">
                                <div className="h-[8px] w-[14px] bg-green-600/50 rounded" />
                                <div className="h-[15px] w-[16px] bg-green-500/40 rounded" />
                            </div>
                        ))}
                    </div>

                    {/* Logo area */}
                    <div className="flex justify-center pb-2">
                        <div className="w-9 h-9 bg-green-700/40 rounded-full opacity-70" />
                    </div>

                    <div className="h-[2px] bg-gradient-to-r from-green-400/0 via-green-400/20 to-green-400/0" />
                </div>
            </div>

            {/* Alt position pills placeholder */}
            <div className="absolute right-0 top-10 translate-x-[40%] flex flex-col gap-1 z-40">
                <div className="h-[16px] w-[28px] bg-emerald-800 rounded border border-green-400/30" />
                <div className="h-[16px] w-[28px] bg-emerald-800 rounded border border-green-400/30" />
            </div>

            {/* Foot pill placeholder */}
            <div className="absolute right-0 bottom-[6rem] translate-x-[40%] z-40">
                <div className="h-[16px] w-[28px] bg-emerald-800 rounded border border-green-400/30" />
            </div>
        </div>
    );
}

export default function ProfileSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe pb-24 md:pb-8">
            <div className="max-w-md mx-auto p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                    {/* Header */}
                    <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <div className="h-7 w-7 bg-slate-200 rounded-full"></div>
                            <div className="h-[28px] w-32 bg-slate-200 rounded"></div>
                        </div>
                        <div className="h-[20px] w-16 bg-slate-200 rounded"></div>
                    </div>

                    <div className="px-5 pt-2 pb-5">
                        {/* FIFA Card Skeleton — exact match */}
                        <div className="flex justify-center mb-4 mt-0">
                            <FifaCardSkeleton />
                        </div>

                        {/* Attribute pills */}
                        <div className="flex flex-wrap justify-center gap-2 mb-2 mt-1">
                            <div className="h-[30px] w-[100px] bg-slate-100 rounded-full border border-slate-200"></div>
                            <div className="h-[30px] w-[90px] bg-slate-100 rounded-full border border-slate-200"></div>
                            <div className="h-[30px] w-[110px] bg-slate-100 rounded-full border border-slate-200"></div>
                            <div className="h-[30px] w-[130px] bg-emerald-50 rounded-full border border-emerald-200"></div>
                        </div>

                        {/* Reeval link */}
                        <div className="mt-4 flex justify-center">
                            <div className="h-[15px] w-56 bg-slate-200 rounded"></div>
                        </div>
                    </div>
                </div>

                {/* Stats Card Skeleton */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-[28px] w-[26px] bg-slate-200 rounded-full"></div>
                        <div className="h-[28px] w-[115px] bg-slate-200 rounded"></div>
                        <div className="h-6 w-6 bg-slate-100 rounded-full"></div>
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex flex-col items-center gap-1.5">
                                <div className="h-4 w-6 bg-slate-200 rounded"></div>
                                <div className="h-7 w-8 bg-slate-100 rounded"></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Notifications Card Skeleton */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
                        <div className="flex-1">
                            <div className="h-4 w-28 bg-slate-200 rounded mb-1.5"></div>
                            <div className="h-3 w-48 bg-slate-100 rounded"></div>
                        </div>
                        <div className="h-8 w-16 bg-slate-200 rounded-xl"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
