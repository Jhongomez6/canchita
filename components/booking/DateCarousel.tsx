"use client";

import { useRef } from "react";
import { motion } from "framer-motion";

interface DateCarouselProps {
    selectedDate: string;
    onSelect: (date: string) => void;
    daysAhead?: number;
}

const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function generateDates(daysAhead: number): Array<{ iso: string; dayName: string; dayNum: number; month: string; isToday: boolean }> {
    const dates = [];
    const now = new Date();

    for (let i = 0; i < daysAhead; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);

        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dayName = i === 0 ? "Hoy" : i === 1 ? "Mañana" : DAY_NAMES_SHORT[d.getDay()];
        const dayNum = d.getDate();
        const month = MONTH_NAMES_SHORT[d.getMonth()];

        dates.push({ iso, dayName, dayNum, month, isToday: i === 0 });
    }

    return dates;
}

export default function DateCarousel({ selectedDate, onSelect, daysAhead = 14 }: DateCarouselProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const dates = generateDates(daysAhead);

    return (
        <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1"
        >
            {dates.map(({ iso, dayName, dayNum, month }) => {
                const isSelected = selectedDate === iso;
                return (
                    <motion.button
                        key={iso}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onSelect(iso)}
                        className={`
                            flex-shrink-0 flex flex-col items-center justify-center
                            w-[60px] py-2.5 rounded-xl transition-colors
                            ${isSelected
                                ? "bg-[#1f7a4f] text-white shadow-md"
                                : "bg-white text-slate-600 hover:bg-slate-50"
                            }
                        `}
                    >
                        <span className={`text-[10px] font-medium ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                            {dayName}
                        </span>
                        <span className="text-lg font-bold leading-tight">{dayNum}</span>
                        <span className={`text-[10px] ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                            {month}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
