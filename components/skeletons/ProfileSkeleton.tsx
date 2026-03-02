import React from 'react';

export default function ProfileSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe">
            {/* HEADER VERDE */}
            <div className="bg-[#1f7a4f] text-white p-6 pb-24 rounded-b-3xl shadow-lg relative">
                <div className="flex justify-between items-center relative z-10 pt-2 top-safe">
                    <div className="h-6 w-24 bg-white/20 rounded"></div>
                    <div className="h-8 w-8 bg-white/20 rounded-full"></div>
                </div>
            </div>

            <div className="max-w-md mx-auto px-5 relative -mt-16 z-20 space-y-6 pb-24">

                {/* PROFILE CARD */}
                <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 flex flex-col items-center">
                    <div className="h-20 w-20 bg-slate-200 rounded-full mb-4"></div>
                    <div className="h-6 w-48 bg-slate-200 rounded mb-2"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded mb-4"></div>

                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                        <div className="h-6 w-16 bg-slate-200 rounded-full"></div>
                        <div className="h-6 w-16 bg-slate-200 rounded-full"></div>
                    </div>

                    <div className="w-full flex justify-around">
                        <div className="flex flex-col items-center">
                            <div className="h-6 w-8 bg-slate-200 rounded mb-1"></div>
                            <div className="h-3 w-16 bg-slate-200 rounded"></div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="h-6 w-8 bg-slate-200 rounded mb-1"></div>
                            <div className="h-3 w-16 bg-slate-200 rounded"></div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="h-6 w-8 bg-slate-200 rounded mb-1"></div>
                            <div className="h-3 w-16 bg-slate-200 rounded"></div>
                        </div>
                    </div>
                </div>

                {/* TABS SKELETON */}
                <div className="flex bg-slate-200/50 p-1 rounded-2xl shadow-inner mb-4">
                    <div className="flex-1 h-10 bg-white rounded-xl shadow-sm"></div>
                    <div className="flex-1 h-10 rounded-xl"></div>
                </div>

                {/* LIST ITEM SKELETON */}
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-slate-200 rounded-xl"></div>
                                <div className="space-y-2">
                                    <div className="h-5 w-32 bg-slate-200 rounded"></div>
                                    <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
