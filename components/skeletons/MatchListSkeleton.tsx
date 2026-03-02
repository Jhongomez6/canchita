import React from 'react';

export default function MatchListSkeleton() {
    return (
        <div className="space-y-4 w-full animate-pulse">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-[20px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 relative overflow-hidden flex flex-col items-center">

                    <div className="w-full flex justify-between items-start mb-4">
                        <div className="flex gap-2 items-center">
                            <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                            <div className="h-6 w-16 bg-slate-200 rounded-full"></div>
                        </div>
                    </div>

                    <div className="w-full grid grid-cols-3 gap-4 mb-5">
                        <div className="text-center flex flex-col items-center">
                            <div className="h-5 w-5 bg-slate-200 rounded-full mb-1"></div>
                            <div className="h-4 w-12 bg-slate-200 rounded mb-1"></div>
                            <div className="h-5 w-16 bg-slate-300 rounded"></div>
                        </div>

                        <div className="text-center flex flex-col items-center border-x border-slate-100 px-2 justify-center">
                            <div className="h-5 w-5 bg-slate-200 rounded-full mb-1"></div>
                            <div className="h-4 w-12 bg-slate-200 rounded mb-1"></div>
                            <div className="h-5 w-16 bg-slate-300 rounded font-bold"></div>
                        </div>

                        <div className="text-center flex flex-col items-center justify-center">
                            <div className="h-5 w-5 bg-slate-200 rounded-full mb-1"></div>
                            <div className="h-4 w-12 bg-slate-200 rounded mb-1"></div>
                            <div className="h-5 w-8 bg-slate-300 rounded font-bold"></div>
                        </div>
                    </div>

                    <div className="w-full flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                        <div className="flex -space-x-2">
                            {[1, 2, 3, 4].map(j => (
                                <div key={j} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white relative z-10"></div>
                            ))}
                        </div>
                        <div className="h-10 w-24 bg-slate-200 rounded-xl"></div>
                    </div>
                </div>
            ))}
        </div>
    );
}
