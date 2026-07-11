"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/domain/user";
import {
    subscribeToReservationsConfig,
    setReservationsLandingEnabled,
} from "@/lib/reservationsConfig";
import { handleError } from "@/lib/utils/error";
import toast from "react-hot-toast";

/**
 * Toggle (solo super admin) que prende/apaga la landing pública de reservas
 * (`/reservar` + secciones de reservas en la landing principal), sin redeploy.
 * Escribe en `config/reservations`. Ref: docs/RESERVAS_LANDING_QR_SDD.md
 */
export default function ReservationsLandingToggle() {
    const { profile } = useAuth();
    const isSuper = profile ? isSuperAdmin(profile) : false;
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isSuper) return;
        const unsub = subscribeToReservationsConfig((c) => setEnabled(c.landingEnabled));
        return () => unsub();
    }, [isSuper]);

    if (!isSuper) return null;

    const handleToggle = async () => {
        if (saving || enabled === null) return;
        const next = !enabled;
        setSaving(true);
        try {
            await setReservationsLandingEnabled(next);
            toast.success(next ? "Landing de reservas encendida" : "Landing de reservas apagada");
        } catch (err) {
            handleError(err, "No pudimos cambiar el estado");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-5 h-5 text-[#1f7a4f]" />
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">Landing de reservas</p>
                <p className="text-xs text-slate-500 leading-snug">
                    Página pública <code className="text-[11px]">/reservar</code> y la sección de reservas en el inicio.
                </p>
                {enabled !== null && (
                    <p className={`text-xs font-semibold mt-0.5 ${enabled ? "text-emerald-600" : "text-slate-400"}`}>
                        {enabled ? "Encendida (visible al público)" : "Apagada (oculta)"}
                    </p>
                )}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={enabled === true}
                aria-label="Encender o apagar la landing de reservas"
                disabled={saving || enabled === null}
                onClick={handleToggle}
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                    enabled ? "bg-[#1f7a4f]" : "bg-slate-300"
                }`}
            >
                <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                        enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                />
            </button>
        </div>
    );
}
