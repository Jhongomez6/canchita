'use client';

import { useState, useCallback } from 'react';

interface PlayerAvatarsProps {
    players: { uid?: string; photoURL?: string; name?: string }[];
    guestCount: number;
}

export default function PlayerAvatars({ players, guestCount }: PlayerAvatarsProps) {
    const shown = players.slice(0, 4);
    const remaining = (players.length - shown.length) + guestCount;

    const totalWithPhotos = shown.filter(p => p.photoURL).length;
    const [loadedCount, setLoadedCount] = useState(0);
    const allLoaded = totalWithPhotos === 0 || loadedCount >= totalWithPhotos;

    const handleLoad = useCallback(() => {
        setLoadedCount(prev => prev + 1);
    }, []);

    if (players.length === 0) return null;

    return (
        <div className="flex items-center mb-4">
            <div className="flex -space-x-2">
                {shown.map((p, i) => (
                    p.photoURL ? (
                        <div key={p.uid || i} className="relative w-8 h-8 shrink-0">
                            {!allLoaded && (
                                <div className="absolute inset-0 rounded-full border-2 border-white bg-emerald-100 animate-pulse" />
                            )}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={p.photoURL}
                                alt={p.name || ''}
                                className={`w-8 h-8 rounded-full border-2 border-white object-cover transition-opacity duration-200 ${allLoaded ? 'opacity-100' : 'opacity-0'}`}
                                onLoad={handleLoad}
                                onError={handleLoad}
                            />
                        </div>
                    ) : (
                        <div
                            key={p.uid || i}
                            className={`w-8 h-8 rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0 ${!allLoaded ? 'animate-pulse' : ''}`}
                        >
                            {allLoaded ? (p.name || '?').charAt(0).toUpperCase() : ''}
                        </div>
                    )
                ))}
            </div>
            {remaining > 0 && (
                <span className={`text-xs text-slate-400 font-semibold ml-2 transition-opacity duration-200 ${allLoaded ? 'opacity-100' : 'opacity-0'}`}>
                    +{remaining}
                </span>
            )}
        </div>
    );
}
