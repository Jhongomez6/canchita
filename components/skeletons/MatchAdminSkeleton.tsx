import React from 'react';

export default function MatchAdminSkeleton() {
    return (
        <main className="min-h-screen bg-slate-50 pb-24">
            <div className="max-w-3xl mx-auto p-4 md:p-6 animate-pulse">

                {/* INFO PARTIDO */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="h-8 bg-slate-200 rounded-lg w-32 mb-2"></div>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                                <div className="h-6 w-32 bg-slate-200 rounded-full"></div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 my-6">
                        <div className="flex items-center gap-3">
                            <span className="text-xl opacity-50">📍</span>
                            <div className="h-5 bg-slate-200 rounded-md w-48"></div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xl opacity-50">📅</span>
                            <div className="h-5 bg-slate-200 rounded-md w-32"></div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xl opacity-50">⏰</span>
                            <div className="h-5 bg-slate-200 rounded-md w-24"></div>
                        </div>
                        <div className="flex items-center gap-3 mt-3">
                            <span className="text-xl opacity-50">👥</span>
                            <div className="h-5 bg-slate-200 rounded-md w-40"></div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                        <div className="flex gap-2">
                            <div className="h-12 flex-1 bg-slate-100 rounded-xl"></div>
                            <div className="h-12 w-24 bg-slate-200 rounded-xl"></div>
                        </div>
                        <div className="flex gap-2">
                            <div className="h-12 flex-1 bg-slate-100 rounded-xl"></div>
                            <div className="h-12 w-24 bg-slate-200 rounded-xl"></div>
                        </div>
                    </div>

                    <div className="h-12 w-full mt-4 bg-slate-200 rounded-xl"></div>
                </div>

                {/* ACCIONES DEL ADMIN Y AGREGAR */}
                <div className="mb-6">
                    <div className="h-12 w-full bg-slate-200 rounded-2xl"></div>
                </div>
                <div className="mb-6">
                    <div className="h-12 w-full bg-slate-200 rounded-2xl"></div>
                </div>

                {/* JUGADORES */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                    <div className="h-6 w-32 bg-slate-200 rounded-lg mb-6"></div>

                    <div className="divide-y divide-slate-100">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0"></div>
                                    <div>
                                        <div className="h-5 w-32 bg-slate-200 rounded-md mb-1"></div>
                                        <div className="h-4 w-20 bg-slate-200 rounded-md"></div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-20 bg-slate-200 rounded-lg"></div>
                                    <div className="h-8 w-20 bg-slate-200 rounded-lg hidden md:block"></div>
                                    <div className="h-8 w-16 bg-slate-200 rounded-lg hidden md:block"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </main>
    );
}
