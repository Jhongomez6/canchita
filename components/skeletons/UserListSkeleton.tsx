import React from 'react';

export default function UserListSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe">
            <div className="max-w-3xl mx-auto p-5 relative z-20 pb-24">

                {/* HEADER AREA */}
                <div className="flex items-center gap-3 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="h-10 w-10 bg-slate-200 rounded-xl"></div>
                    <div className="flex-1">
                        <div className="h-6 w-48 bg-slate-200 rounded mb-1"></div>
                        <div className="h-4 w-32 bg-slate-200 rounded"></div>
                    </div>
                </div>

                {/* CONTROLS (Search / Filter) */}
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex-1 h-12 bg-white border border-slate-100 rounded-xl shadow-sm"></div>
                    <div className="flex gap-2">
                        <div className="h-12 w-24 bg-white border border-slate-100 rounded-xl shadow-sm"></div>
                        <div className="h-12 w-24 bg-white border border-slate-100 rounded-xl shadow-sm"></div>
                    </div>
                </div>

                {/* RESULTS METRICS */}
                <div className="h-4 w-40 bg-slate-200 rounded mb-4"></div>

                {/* USERS LIST SKELETON */}
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-slate-200 rounded-xl"></div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="h-5 w-32 bg-slate-200 rounded"></div>
                                        <div className="h-5 w-16 bg-slate-200 rounded-full"></div>
                                    </div>
                                    <div className="h-4 w-48 bg-slate-200 rounded"></div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <div className="h-9 w-24 bg-slate-200 rounded-xl"></div>
                                <div className="h-9 w-24 bg-slate-200 rounded-xl"></div>
                                <div className="h-9 w-10 bg-slate-200 rounded-xl"></div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
