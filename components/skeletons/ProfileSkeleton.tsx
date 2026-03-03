import React from 'react';

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

                    <div className="p-5">
                        <div className="space-y-1">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`flex justify-between items-center py-3 border-b border-slate-100 ${i !== 3 ? 'h-[45px]' : ''}`}>
                                    <div className="h-5 w-28 bg-slate-200 rounded"></div>
                                    <div className="flex items-center gap-2">
                                        {i === 3 ? (
                                            <>
                                                <div className="h-[26px] w-[80px] bg-slate-200 rounded-full"></div>
                                                <div className="h-[26px] w-[85px] bg-slate-200 rounded-full"></div>
                                            </>
                                        ) : (
                                            <div className="h-5 w-24 bg-slate-200 rounded"></div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Level Card Skeleton */}
                        <div className="mt-6 bg-[#1f7a4f]/10 rounded-2xl p-5 relative overflow-hidden flex items-center">
                            <div className="flex items-center gap-4 relative z-10 w-full">
                                <div className="h-[48px] w-[48px] bg-[#1f7a4f]/20 rounded-full shrink-0"></div>
                                <div className="flex-1">
                                    <div className="h-4 w-28 bg-[#1f7a4f]/20 rounded mb-1"></div>
                                    <div className="h-6 w-24 bg-[#1f7a4f]/30 rounded"></div>
                                    <div className="h-7 w-32 bg-[#1f7a4f]/20 rounded"></div>
                                </div>
                            </div>
                        </div>

                        {/* Reeval link skeleton */}
                        <div className="mt-4 flex justify-center">
                            <div className="h-[15px] w-56 bg-slate-200 rounded"></div>
                        </div>
                    </div>
                </div>

                {/* COMPROMISO SKELETON */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="h-[28px] w-[26px] bg-slate-200 rounded-full"></div>
                            <div className="h-[28px] w-[115px] bg-slate-200 rounded"></div>
                        </div>
                        <div className="h-6 w-6 bg-slate-100 rounded-full"></div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="w-24 h-24 flex items-center justify-center shrink-0">
                            <div className="w-full h-full border-[8px] border-slate-100 rounded-full flex items-center justify-center">
                                <div className="h-8 w-12 bg-slate-200 rounded"></div>
                            </div>
                        </div>

                        <div className="flex-1 pl-6">
                            {/* Multiline Pill Skeleton */}
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1f7a4f]/10 mb-1 w-[205px]">
                                <div className="h-4 w-4 bg-[#1f7a4f]/20 rounded-full shrink-0"></div>
                                <div className="flex-1 space-y-1">
                                    <div className="h-[14px] w-full bg-[#1f7a4f]/20 rounded"></div>
                                    <div className="h-[14px] w-[65%] bg-[#1f7a4f]/20 rounded"></div>
                                </div>
                            </div>

                            {/* Single Line Description */}
                            <div className="h-[15px] w-[190px] bg-slate-200 rounded"></div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
