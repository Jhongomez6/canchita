import React from 'react';

export default function MatchListSkeleton() {
    return (
        <div className="space-y-3 w-full animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="relative">
                    <div className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 h-[87px]">
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

                    {/* Floating Capacity Pill (Full / Spots) */}
                    <div className="absolute -top-2 -right-2 h-[26px] w-[70px] bg-slate-300 rounded-full border-2 border-white z-10 shadow-sm"></div>
                </div>
            ))}
        </div>
    );
}
