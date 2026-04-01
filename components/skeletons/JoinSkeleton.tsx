import React from 'react';

interface JoinSkeletonProps {
    isClosedTemplate?: boolean;
}

export default function JoinSkeleton({ isClosedTemplate = false }: JoinSkeletonProps) {
    return (
        <main className="min-h-screen bg-slate-50 pb-24">
            <div className="max-w-md mx-auto">
                {/* HEADER VERDE (Estático, sin parpadeo) */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-3 pb-5 rounded-b-2xl shadow-md mb-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
                </div>

                {/* CONTAINER ANIMADO (Contenido Dinámico) */}
                <div className="px-4 -mt-6 relative z-20 space-y-4 animate-pulse">

                    {/* CARD PARTIDO (Match Info) */}
                    <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100">
                        <div className="flex justify-between items-start mb-4">
                            <div className="h-6 w-32 bg-slate-200 rounded"></div>
                            <div className="h-6 w-16 bg-slate-200 rounded-full"></div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-slate-100 rounded-lg shrink-0"></div>
                                <div className="flex flex-col space-y-2 flex-1">
                                    <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                    <div className="h-3 w-16 bg-slate-200 rounded"></div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3 w-full">
                                    <div className="h-10 w-10 bg-slate-100 rounded-lg shrink-0"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
                                        <div className="h-7 w-32 bg-slate-100 rounded-lg mt-1.5"></div>
                                    </div>
                                </div>
                            </div>
                            {/* Código del partido */}
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-slate-100 rounded-lg shrink-0"></div>
                                <div className="flex-1 flex items-center justify-between">
                                    <div className="flex flex-col space-y-2">
                                        <div className="h-3 w-20 bg-slate-200 rounded"></div>
                                        <div className="h-4 w-28 bg-slate-200 rounded"></div>
                                    </div>
                                    <div className="h-8 w-16 bg-slate-100 rounded-lg"></div>
                                </div>
                            </div>
                            {/* Organizador */}
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-slate-100 rounded-lg shrink-0"></div>
                                <div className="flex flex-col space-y-2">
                                    <div className="h-3 w-16 bg-slate-200 rounded"></div>
                                    <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TIMELINE SKELETON */}
                    <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-100"></div>
                            <div className="space-y-2">
                                <div className="h-4 w-36 bg-slate-200 rounded"></div>
                                <div className="h-3 w-24 bg-slate-200 rounded"></div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="h-2 w-6 bg-slate-200 rounded-full"></div>
                            <div className="h-2 w-2 bg-slate-200 rounded-full"></div>
                            <div className="h-2 w-2 bg-slate-200 rounded-full"></div>
                            <div className="h-2 w-2 bg-slate-200 rounded-full"></div>
                            <div className="h-3 w-12 bg-slate-200 rounded ml-1"></div>
                        </div>
                    </div>

                    {isClosedTemplate ? (
                        /* CLOSED MATCH (Scoreboard + Teams) */
                        <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6">
                            <div className="h-6 w-48 bg-slate-200 rounded mx-auto mb-6"></div>

                            <div className="flex justify-center items-center gap-6 mb-8 bg-slate-50 py-4 rounded-xl border border-slate-100">
                                <div className="h-12 w-16 bg-slate-200 rounded"></div>
                                <div className="h-8 w-4 bg-slate-200 rounded"></div>
                                <div className="h-12 w-16 bg-slate-200 rounded"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[1, 2].map(team => (
                                    <div key={team} className="rounded-xl p-4 border bg-slate-50 border-slate-100">
                                        <div className="h-4 w-32 bg-slate-200 rounded mb-3"></div>
                                        <div className="space-y-2">
                                            {[1, 2, 3, 4, 5].map(p => (
                                                <div key={p} className="flex items-center gap-3 p-1.5 rounded-lg border border-transparent">
                                                    <div className="h-6 w-6 bg-slate-200 rounded-full"></div>
                                                    <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* OPEN MATCH (Asistencia + Jugadores Confirmados) */
                        <>
                            <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-100">
                                <div className="h-5 w-32 bg-slate-200 rounded mb-4"></div>
                                <div className="h-14 w-full bg-slate-200 rounded-xl"></div>
                            </div>

                            <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <div className="h-6 w-48 bg-slate-200 rounded"></div>
                                    <div className="h-6 w-6 bg-slate-200 rounded-full"></div>
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {[1, 2, 3, 4].map(p => (
                                        <div key={p} className="py-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                                                <div className="h-4 w-24 bg-slate-200 rounded"></div>
                                            </div>
                                            <div className="h-5 w-20 bg-slate-200 rounded"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
