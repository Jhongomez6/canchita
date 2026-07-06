"use client";

/**
 * StaleMatchBanner — aviso bloqueante en `/new-match` cuando el usuario tiene
 * un partido `open` vencido (fecha de juego > 7 días) sin cerrar. Enlaza al
 * partido pendiente para que lo cierre antes de crear uno nuevo.
 *
 * See: docs/BLOCK_CREATE_ON_STALE_OPEN_MATCH_SDD.md
 */

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { getMatchStartMs } from "@/lib/domain/match";
import type { Match } from "@/lib/domain/match";

export default function StaleMatchBanner({
  match,
  daysStale,
}: {
  match: Match;
  daysStale: number;
}) {
  const router = useRouter();

  const matchDate = new Date(getMatchStartMs(match)).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-red-100 text-red-600 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-red-700">Tienes un partido sin cerrar</h3>
            <p className="text-sm text-red-600/90 mt-0.5 leading-tight">
              <span className="font-semibold">{match.locationSnapshot.name}</span> · {matchDate}{" "}
              terminó hace {daysStale} {daysStale === 1 ? "día" : "días"} y sigue abierto. Ciérralo
              antes de crear uno nuevo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/match/${match.id}`)}
          className="w-full md:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 bg-red-600 text-white px-5 py-3 rounded-xl font-bold shadow-md hover:bg-red-700 transition-colors active:scale-[0.98]"
        >
          Ir a cerrar el partido
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
