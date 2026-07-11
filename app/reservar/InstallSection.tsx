"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, Plus, ChevronDown, Check } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import {
    logReservationLandingInstallShown,
    logReservationLandingInstallClicked,
} from "@/lib/analytics";

/**
 * Sección "Instala la app" de la landing de reservas.
 *  - Android compatible: botón de instalación nativo (beforeinstallprompt).
 *  - iOS: instrucciones manuales (Compartir → Agregar a inicio).
 *  - Ya instalada (standalone): se oculta por completo.
 * Ref: docs/RESERVAS_LANDING_QR_SDD.md §6/§7
 */
export default function InstallSection() {
    const { isInstallable, isStandalone, isIOS, isAndroid, promptToInstall } = usePWAInstall();
    const [iosOpen, setIosOpen] = useState(false);
    const [installed, setInstalled] = useState(false);

    // Plataforma efectiva para el copy/analytics.
    const platform: "android" | "ios" | null = isIOS ? "ios" : isAndroid || isInstallable ? "android" : null;

    // Se muestra solo si no está instalada y hay una vía de instalación.
    const canShow = !isStandalone && platform !== null;

    useEffect(() => {
        if (canShow && platform) logReservationLandingInstallShown(platform);
    }, [canShow, platform]);

    if (!canShow || !platform) return null;

    const handleAndroidInstall = async () => {
        logReservationLandingInstallClicked("android");
        const { success } = await promptToInstall();
        if (success) setInstalled(true);
    };

    const handleIOSToggle = () => {
        if (!iosOpen) logReservationLandingInstallClicked("ios");
        setIosOpen((v) => !v);
    };

    return (
        <section className="max-w-xl mx-auto px-6 py-14">
            <div className="text-center mb-8">
                <p className="text-xs font-black tracking-widest text-[#1f7a4f] uppercase mb-1">Tenla a mano</p>
                <h2 className="text-2xl font-bold text-slate-800">Instala la app</h2>
                <p className="text-sm text-slate-500 mt-2">
                    Reserva más rápido y recibe la confirmación de tus reservas.
                </p>
            </div>

            {platform === "android" ? (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center">
                    {installed ? (
                        <div className="flex flex-col items-center gap-2 text-[#1f7a4f]">
                            <span className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                                <Check className="w-6 h-6" />
                            </span>
                            <p className="font-bold">¡Listo! Busca La Canchita en tu pantalla de inicio.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-slate-500 mb-4">
                                Instálala en un toque, sin pasar por la tienda de apps.
                            </p>
                            <button
                                onClick={handleAndroidInstall}
                                disabled={!isInstallable}
                                className="inline-flex items-center justify-center gap-2 bg-[#1f7a4f] text-white font-bold text-base rounded-2xl py-3.5 px-8 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
                            >
                                <Download className="w-5 h-5" />
                                Instalar app
                            </button>
                            {!isInstallable && (
                                <p className="text-xs text-slate-400 mt-3">
                                    Si no aparece, abre el menú ⋮ de Chrome y toca “Instalar app” / “Agregar a la pantalla de inicio”.
                                </p>
                            )}
                        </>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <button
                        onClick={handleIOSToggle}
                        aria-expanded={iosOpen}
                        className="w-full flex items-center justify-between p-5 text-left"
                    >
                        <span className="font-bold text-slate-800">Cómo instalar en iPhone</span>
                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${iosOpen ? "rotate-180" : ""}`} />
                    </button>
                    <AnimatePresence initial={false}>
                        {iosOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <ol className="px-5 pb-5 space-y-3 text-sm text-slate-600">
                                    <li className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center font-black text-slate-500 text-xs">1</span>
                                        <span className="pt-0.5">
                                            Toca el botón <Share className="inline w-4 h-4 -mt-0.5" /> <strong>Compartir</strong> en la barra de Safari.
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center font-black text-slate-500 text-xs">2</span>
                                        <span className="pt-0.5">
                                            Elige <Plus className="inline w-4 h-4 -mt-0.5" /> <strong>Agregar a inicio</strong>.
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center font-black text-slate-500 text-xs">3</span>
                                        <span className="pt-0.5">
                                            Confirma con <strong>Agregar</strong>. ¡Listo, ya la tienes en tu pantalla!
                                        </span>
                                    </li>
                                </ol>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </section>
    );
}
