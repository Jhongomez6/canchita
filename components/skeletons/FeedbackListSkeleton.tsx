import React from 'react';

export default function FeedbackListSkeleton() {
    return (
        <div className="w-full h-full min-h-screen bg-slate-50 animate-pulse pt-safe">
            <div className="max-w-3xl mx-auto p-5 relative z-20 pb-24">

                {/* HEADER AREA */}
                <div className="flex items-center gap-3 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="h-10 w-10 bg-slate-200 rounded-xl"></div>
                    <div className="flex-1">
                        <div className="h-6 w-48 bg-slate-200 rounded mb-1"></div>
                        <div className="h-4 w-32 bg-slate-200 rounded"></div>
                    </div>
                </div>

                {/* FEEDBACK LIST SKELETON */}
                <div className="space-y-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
                                    <div>
                                        <div className="h-5 w-32 bg-slate-200 rounded mb-1"></div>
                                        <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                    </div>
                                </div>
                                <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                            </div>

                            <div className="mb-4">
                                <div className="h-4 w-full bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
                            </div>

                            <div className="flex items-center justify-between mt-4">
                                <div className="h-4 w-32 bg-slate-200 rounded"></div>
                                <div className="h-10 w-32 bg-slate-200 rounded-xl"></div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
