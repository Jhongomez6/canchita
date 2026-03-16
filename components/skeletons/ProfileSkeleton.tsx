import React from 'react';
import FifaCardSkeleton from './FifaCardSkeleton';

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
                        <div className="h-[20px] w-[130px] bg-slate-200 rounded"></div>
                        <div className="h-6 w-6 bg-slate-100 rounded-full"></div>
                    </div>
                    <div className="flex divide-x divide-slate-100">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex flex-col items-center flex-1 gap-1.5 py-1">
                                <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                <div className="h-[10px] w-6 bg-slate-100 rounded"></div>
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
