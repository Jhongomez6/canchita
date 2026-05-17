"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

interface StarRatingProps {
    value: number | null;
    onChange: (rating: number) => void;
    disabled?: boolean;
}

const LABELS: Record<number, string> = {
    1: "Pésimo",
    2: "Regular",
    3: "Bien",
    4: "Muy bien",
    5: "Excelente",
};

export default function StarRating({ value, onChange, disabled = false }: StarRatingProps) {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => {
                    const filled = value !== null && star <= value;
                    return (
                        <motion.button
                            key={star}
                            type="button"
                            onClick={() => !disabled && onChange(star)}
                            disabled={disabled}
                            whileTap={disabled ? {} : { scale: 0.85 }}
                            layout
                            className={`rounded-full p-2 transition-colors ${
                                disabled ? "cursor-default" : "active:bg-amber-50"
                            }`}
                            aria-label={`${star} estrellas`}
                        >
                            <motion.div
                                animate={{ scale: filled ? 1.15 : 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            >
                                <Star
                                    size={32}
                                    className={filled ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}
                                    strokeWidth={1.5}
                                />
                            </motion.div>
                        </motion.button>
                    );
                })}
            </div>
            <span className={`text-sm font-semibold transition-colors ${value ? "text-amber-500" : "text-slate-300"}`}>
                {value ? LABELS[value] : "Tocá una estrella"}
            </span>
        </div>
    );
}
