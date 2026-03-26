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
                    <div className="bg-white/90 rounded-3xl p-5 shadow-[0_8px_40px_-8px_rgba(31,122,79,0.15)]">
                        {/* Badge */}
                        <div className="mb-4">
                            <div className="h-6 bg-slate-200 rounded-md w-32"></div>
                        </div>

                        {/* Date box + info */}
                        <div className="flex items-start gap-4 mb-4">
                            {/* Date Box */}
                            <div className="bg-slate-50 rounded-xl border border-slate-100 w-[5.5rem] h-[5.5rem] shrink-0 flex flex-col items-center justify-center gap-1.5">
                                <div className="h-[10px] bg-slate-200 rounded w-12"></div>
                                <div className="h-[28px] bg-slate-200 rounded w-8"></div>
                                <div className="h-[10px] bg-slate-200 rounded w-7"></div>
                            </div>

                            <div className="flex-1 min-w-0">
                                {/* Time */}
                                <div className="h-[20px] bg-slate-200 rounded w-28"></div>
                                {/* Location */}
                                <div className="h-[16px] bg-slate-200 rounded w-4/5 mt-2"></div>
                                {/* Metadata */}
                                <div className="flex gap-3 mt-2">
                                    <div className="h-[12px] bg-slate-200 rounded w-12"></div>
                                    <div className="h-[12px] bg-slate-200 rounded w-16"></div>
                                </div>
                            </div>
                        </div>

                        {/* Avatars */}
                        <div className="flex items-center mb-4">
                            <div className="flex -space-x-2">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white"></div>
                                ))}
                            </div>
                            <div className="h-3 bg-slate-200 rounded w-6 ml-2"></div>
                        </div>

                        {/* Button */}
                        <div className="h-12 bg-slate-200 rounded-xl w-full"></div>
                    </div>
                </div>

                {/* ACTIVE MATCHES SECTION */}
                <div className="px-5 mb-3 flex items-center gap-2">
                    <div className="h-4 bg-slate-200 rounded w-28"></div>
                    <div className="h-4 w-5 bg-slate-200 rounded-full"></div>
                </div>

                <div className="px-5 space-y-3">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <div className="bg-slate-50 rounded-lg w-[4.5rem] h-[4.5rem] shrink-0 mr-4 border border-slate-100 flex flex-col items-center justify-center gap-1.5">
                                <div className="h-[9px] bg-slate-200 rounded w-10"></div>
                                <div className="h-[22px] bg-slate-200 rounded w-7"></div>
                                <div className="h-[9px] bg-slate-200 rounded w-6"></div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="h-[14px] bg-slate-200 rounded w-28"></div>
                                <div className="h-[12px] bg-slate-200 rounded w-4/5 mt-1.5"></div>
                                <div className="flex gap-3 mt-1.5">
                                    <div className="h-[11px] bg-slate-200 rounded w-12"></div>
                                    <div className="h-[11px] bg-slate-200 rounded w-16"></div>
                                </div>
                            </div>
                            <div className="h-4 w-4 bg-slate-200 rounded shrink-0 ml-2"></div>
                        </div>
                    ))}
                </div>

                {/* HISTORIAL SECTION */}
                <div className="px-5 mt-6 mb-3 flex items-center gap-2">
                    <div className="h-4 bg-slate-200 rounded w-16"></div>
                    <div className="h-4 w-5 bg-slate-200 rounded-full"></div>
                </div>

                <div className="px-5 space-y-3">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 opacity-75">
                            <div className="bg-slate-50 rounded-lg w-[4.5rem] h-[4.5rem] shrink-0 mr-4 border border-slate-100 flex flex-col items-center justify-center gap-1.5">
                                <div className="h-[9px] bg-slate-200 rounded w-10"></div>
                                <div className="h-[22px] bg-slate-200 rounded w-7"></div>
                                <div className="h-[9px] bg-slate-200 rounded w-6"></div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="h-[14px] bg-slate-200 rounded w-28"></div>
                                <div className="h-[12px] bg-slate-200 rounded w-4/5 mt-1.5"></div>
                                <div className="flex gap-3 mt-1.5">
                                    <div className="h-[11px] bg-slate-200 rounded w-12"></div>
                                    <div className="h-[11px] bg-slate-200 rounded w-16"></div>
                                </div>
                            </div>
                            <div className="h-4 w-4 bg-slate-200 rounded shrink-0 ml-2"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
