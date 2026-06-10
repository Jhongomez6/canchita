"use client";

import { motion } from "framer-motion";

/**
 * Badge de puntos obtenidos en una predicción ya puntuada.
 * 3 = exacto (verde), 1 = resultado correcto (azul), 0 = fallo (gris).
 */
export default function MatchResultBadge({ points }: { points: 0 | 1 | 3 }) {
    const config =
        points === 3
            ? { label: "Exacto", cls: "bg-[#1f7a4f] text-white" }
            : points === 1
                ? { label: "Resultado", cls: "bg-blue-500 text-white" }
                : { label: "Sin acierto", cls: "bg-gray-200 text-gray-500" };

    return (
        <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${config.cls}`}
        >
            +{points} · {config.label}
        </motion.span>
    );
}
