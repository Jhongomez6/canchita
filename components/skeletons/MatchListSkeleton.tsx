import React from 'react';

export default function MatchListSkeleton() {
    return (
        <div className="space-y-3 w-full animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="relative">
                    <div className="flex items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                        {/* Date Box */}
                        <div className="bg-slate-50 rounded-lg w-20 h-20 shrink-0 mr-4 border border-slate-100 flex flex-col items-center justify-center gap-1.5">
                            <div className="h-[11px] bg-slate-200 rounded w-11"></div>
                            <div className="h-[30px] bg-slate-200 rounded w-8"></div>
                            <div className="h-[11px] bg-slate-200 rounded w-7"></div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="h-[16px] bg-slate-200 rounded w-4/5"></div>
                            <div className="h-[18px] bg-slate-200 rounded w-24 mt-2"></div>
                            <div className="flex gap-3 mt-1.5">
                                <div className="h-[14px] bg-slate-200 rounded w-14"></div>
                                <div className="h-[14px] bg-slate-200 rounded w-18"></div>
                            </div>
                        </div>

                        {/* Chevron */}
                        <div className="h-4 w-4 bg-slate-200 rounded shrink-0 ml-2"></div>
                    </div>

                    {/* Floating Capacity Pill (Full / Spots) */}
                    <div className="absolute -top-2 -right-2 h-[26px] w-[70px] bg-slate-300 rounded-full border-2 border-white z-10 shadow-sm"></div>
                </div>
            ))}
        </div>
    );
}
