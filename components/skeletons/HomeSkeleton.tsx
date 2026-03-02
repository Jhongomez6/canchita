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
                        {/* Admin Badge Skeleton */}
                        <div className="h-6 bg-white/20 rounded-full w-14"></div>
                    </div>

                    {/* NEXT MATCH HERO CARD SKELETON */}
                    <div className="bg-white/90 rounded-2xl p-5 shadow-xl mt-4">
                        <div className="flex justify-between items-center mb-3">
                            <div className="h-5 bg-slate-200 rounded w-28"></div>
                            <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </div>

                        <div className="flex items-center gap-4 mb-4 mt-2">
                            <div className="w-12 h-12 bg-slate-200 rounded-full shrink-0"></div>
                            <div className="flex-1">
                                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2"></div>
                                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                            </div>
                        </div>

                        <div className="h-10 bg-slate-200 rounded-xl w-full mt-2"></div>
                    </div>
                </div>

                {/* Action Buttons Skeleton */}
                <div className="grid grid-cols-2 gap-3 px-5 mb-8">
                    <div className="bg-slate-200 h-14 rounded-2xl w-full shadow-sm"></div>
                    <div className="bg-slate-200 h-14 rounded-2xl w-full shadow-sm"></div>
                </div>

                {/* Content Tabs Skeleton */}
                <div className="px-5">
                    <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl mb-6 shadow-inner">
                        <div className="flex-1 h-9 bg-white rounded-lg shadow-sm"></div>
                        <div className="flex-1 h-9 rounded-lg"></div>
                    </div>

                    <div className="flex justify-between items-end mb-4 px-1">
                        <div className="h-6 bg-slate-200 rounded w-32"></div>
                        <div className="h-4 bg-slate-200 rounded w-16"></div>
                    </div>

                    {/* Match Cards Skeleton */}
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-[20px] p-5 shadow-sm border border-slate-100 relative overflow-hidden">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <div className="h-4 w-4 bg-slate-200 rounded-full"></div>
                                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="h-8 bg-slate-200 rounded-full w-24"></div>
                                    <div className="h-8 bg-slate-200 rounded-full w-20"></div>
                                </div>

                                <div className="absolute top-5 right-5 h-6 bg-slate-200 rounded w-16"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
