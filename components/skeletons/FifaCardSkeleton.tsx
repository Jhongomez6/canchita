import React from 'react';

interface FifaCardSkeletonProps {
    size?: 'sm' | 'lg';
}

export default function FifaCardSkeleton({ size = 'sm' }: FifaCardSkeletonProps) {
    const lg = size === 'lg';
    const idSuffix = lg ? '-lg' : '';

    return (
        <div
            className={`relative w-full animate-pulse ${lg ? 'max-w-[270px]' : 'max-w-[185px]'}`}
            style={{ perspective: "1000px" }}
        >
            <svg width="0" height="0" className="absolute">
                <defs>
                    <clipPath id={`fifa-card-outer-skel${idSuffix}`} clipPathUnits="objectBoundingBox">
                        <path d="M 0.1,0.05 Q 0.5,0 0.9,0.05 L 1,0.1 L 1,0.84 Q 1,0.87 0.96,0.89 Q 0.72,0.97 0.5,1 Q 0.28,0.97 0.04,0.89 Q 0,0.87 0,0.84 L 0,0.1 Z" />
                    </clipPath>
                    <clipPath id={`fifa-card-inner-skel${idSuffix}`} clipPathUnits="objectBoundingBox">
                        <path d="M 0.1,0.05 Q 0.5,0 0.9,0.05 L 1,0.1 L 1,0.84 Q 1,0.87 0.96,0.89 Q 0.72,0.97 0.5,1 Q 0.28,0.97 0.04,0.89 Q 0,0.87 0,0.84 L 0,0.1 Z" />
                    </clipPath>
                </defs>
            </svg>

            {/* Card frame */}
            <div
                className="relative p-[2px]"
                style={{ clipPath: `url(#fifa-card-outer-skel${idSuffix})`, background: "linear-gradient(to bottom, #4ade80, #1f7a4f, #0d3d26)" }}
            >
                <div
                    className="relative overflow-hidden"
                    style={{ clipPath: `url(#fifa-card-inner-skel${idSuffix})`, background: "linear-gradient(to bottom, #145c3a, #0d3d26, #071e12)" }}
                >
                    {/* Photo area */}
                    <div className="mt-3 mb-1">
                        <div className={`relative mx-1.5 ${lg ? 'h-[263px]' : 'h-[180px]'}`}>
                            <div className="w-full h-full rounded-full bg-emerald-900/60" />
                            <div className="absolute top-0 left-0 -translate-x-[5%] flex flex-col items-center gap-0.5">
                                <div className={`bg-green-700/50 rounded ${lg ? 'h-[55px] w-[41px]' : 'h-[38px] w-[28px]'}`} />
                                <div className={`bg-green-700/40 rounded ${lg ? 'h-[19px] w-[47px]' : 'h-[13px] w-[32px]'}`} />
                            </div>
                        </div>
                    </div>

                    {/* Name bar */}
                    <div className="relative mx-2 mb-1">
                        <div className="h-[1px] bg-gradient-to-r from-transparent via-green-400/20 to-transparent mb-2" />
                        <div className="flex justify-center">
                            <div className={`bg-green-700/50 rounded ${lg ? 'h-[23px] w-[146px]' : 'h-[16px] w-[100px]'}`} />
                        </div>
                    </div>

                    {/* Stats row — 6 cells */}
                    <div className={`flex justify-center px-2 pb-1 mb-1 ${lg ? 'gap-x-4' : 'gap-x-3'}`}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="flex flex-col items-center gap-1">
                                <div className={`bg-green-600/50 rounded ${lg ? 'h-[12px] w-[20px]' : 'h-[8px] w-[14px]'}`} />
                                <div className={`bg-green-500/40 rounded ${lg ? 'h-[22px] w-[23px]' : 'h-[15px] w-[16px]'}`} />
                            </div>
                        ))}
                    </div>

                    {/* Logo area */}
                    <div className="flex justify-center pb-2">
                        <div className={`bg-green-700/40 rounded opacity-70 ${lg ? 'w-[52px] h-[52px]' : 'w-9 h-9'}`} />
                    </div>

                    <div className="h-[2px] bg-gradient-to-r from-green-400/0 via-green-400/20 to-green-400/0" />
                </div>
            </div>

            {/* Alt position pills */}
            <div className={`absolute right-0 translate-x-[40%] flex flex-col gap-1 z-40 ${lg ? 'top-[58px]' : 'top-10'}`}>
                <div className={`bg-emerald-800 rounded border border-green-400/30 ${lg ? 'h-[23px] w-[41px]' : 'h-[16px] w-[28px]'}`} />
                <div className={`bg-emerald-800 rounded border border-green-400/30 ${lg ? 'h-[23px] w-[41px]' : 'h-[16px] w-[28px]'}`} />
            </div>

            {/* Foot pill */}
            <div className={`absolute right-0 translate-x-[40%] z-40 ${lg ? 'bottom-[8.75rem]' : 'bottom-[6rem]'}`}>
                <div className={`bg-emerald-800 rounded border border-green-400/30 ${lg ? 'h-[23px] w-[41px]' : 'h-[16px] w-[28px]'}`} />
            </div>
        </div>
    );
}
