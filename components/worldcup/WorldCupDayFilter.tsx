"use client";

import { useEffect, useRef } from "react";

export default function WorldCupDayFilter({
    days,
    selected,
    onSelect,
}: {
    days: { key: string; label: string }[];
    selected: string;
    onSelect: (key: string) => void;
}) {
    const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    useEffect(() => {
        const btn = btnRefs.current.get(selected);
        btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }, [selected]);

    return (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {days.map((d) => (
                <button
                    key={d.key}
                    type="button"
                    ref={(el) => {
                        if (el) btnRefs.current.set(d.key, el);
                        else btnRefs.current.delete(d.key);
                    }}
                    onClick={() => onSelect(d.key)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                        selected === d.key
                            ? "bg-[#1f7a4f] text-white"
                            : "bg-gray-100 text-gray-500"
                    }`}
                >
                    {d.label}
                </button>
            ))}
        </div>
    );
}
