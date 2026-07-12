"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, ChevronRight } from "lucide-react";
import SportIcon from "@/components/booking/SportIcon";
import { useAuth } from "@/lib/AuthContext";
import { activateCasualMatches } from "@/lib/users";
import { logCasualMatchesActivated } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";

/**
 * Card que ofrece a una cuenta "solo reservas" (bookingOnly) activar el módulo de
 * partidos casuales. Al activar, se quita el flag `bookingOnly` y el AuthGuard
 * redirige al onboarding. Se auto-oculta si la cuenta no es solo-reservas.
 * Ref: docs/RESERVAS_LANDING_QR_SDD.md §12
 */
export default function ActivateCasualMatchesCard() {
    const { user, profile } = useAuth();
    const router = useRouter();
    const [activating, setActivating] = useState(false);

    if (!profile?.bookingOnly) return null;

    const handleActivate = async () => {
        if (!user || activating) return;
        setActivating(true);
        try {
            await activateCasualMatches(user.uid);
            logCasualMatchesActivated();
            // El AuthGuard detectará (player + !initialRatingCalculated + !bookingOnly)
            // y redirigirá; empujamos igual por si el snapshot tarda.
            router.replace("/onboarding");
        } catch (err) {
            setActivating(false);
            handleError(err, "No pudimos activar los partidos. Intenta de nuevo.");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white rounded-2xl shadow-lg mb-6 p-5"
        >
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
            <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
                        <Users className="w-5 h-5" />
                    </span>
                    <SportIcon sport="football" className="w-7 h-7 text-white" />
                </div>
                <h2 className="font-bold text-lg mb-1">Empieza a jugar desde la app</h2>
                <p className="text-sm text-emerald-50/90 leading-relaxed mb-4">
                    ¿Tienes tu grupo? Organízalo y arma equipos parejos. ¿Buscas equipo?
                    Encuentra con quién jugar. Te haremos unas preguntas rápidas para
                    calcular tu nivel.
                </p>
                <button
                    onClick={handleActivate}
                    disabled={activating}
                    className="inline-flex items-center gap-1.5 bg-white text-[#1f7a4f] font-bold text-sm rounded-xl py-2.5 px-5 shadow-md active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                    {activating ? "Empezando..." : "Empezar"}
                    {!activating && <ChevronRight className="w-4 h-4" />}
                </button>
            </div>
        </motion.div>
    );
}
