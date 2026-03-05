"use client";

import { useState, useEffect } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { X, Share, PlusSquare } from "lucide-react";

export default function PWAInstallPrompt() {
    const { isInstallable, isStandalone, isIOS, promptToInstall, dismissPrompt, hasDismissed } = usePWAInstall();
    const [showIOSModal, setShowIOSModal] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    if (!mounted) return null;

    // Don't show if already installed or dismissed
    if (isStandalone || hasDismissed) return null;

    // We should only show the banner if it's installable via Android OR if it's iOS (since iOS doesn't fire beforeinstallprompt usually)
    const shouldShowBanner = isInstallable || isIOS;

    if (!shouldShowBanner) return null;

    const handleInstallClick = () => {
        if (isIOS) {
            setShowIOSModal(true);
        } else {
            promptToInstall();
        }
    };

    return (
        <>
            <div className="fixed bottom-[80px] md:bottom-6 left-0 right-0 z-[40] flex justify-center px-4 animate-in slide-in-from-bottom-5">
                <div className="bg-slate-900 border border-slate-700 text-white p-4 rounded-xl shadow-2xl flex flex-col w-full max-w-md gap-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>

                    <button
                        onClick={dismissPrompt}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
                        aria-label="Cerrar"
                    >
                        <X size={16} />
                    </button>

                    <div className="flex gap-3 items-center">
                        <div className="bg-emerald-500/20 p-2.5 rounded-lg text-emerald-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
                        </div>
                        <div className="flex-1 pr-6">
                            <h3 className="font-semibold text-sm">Mejora tu experiencia</h3>
                            <p className="text-xs text-slate-300 mt-0.5 leading-snug">Instala Canchita para acceso rápido y modo de pantalla completa.</p>
                        </div>
                    </div>

                    <button
                        onClick={handleInstallClick}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-sm transition shadow-lg shadow-emerald-900/50"
                    >
                        Instalar App
                    </button>
                </div>
            </div>

            {/* iOS Modal */}
            {showIOSModal && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white text-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 shadow-2xl">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>

                        <button
                            onClick={() => setShowIOSModal(false)}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full transition"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl font-bold mb-2">Instalar en iOS</h3>
                        <p className="text-slate-500 mb-6 text-sm">Sigue estos rápidos pasos para añadir Canchita a tu pantalla de inicio:</p>

                        <div className="space-y-3">
                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-blue-500 flex-shrink-0">
                                    <Share size={24} />
                                </div>
                                <div>
                                    <div className="font-semibold text-sm">Paso 1</div>
                                    <div className="text-slate-600 text-xs">Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-slate-700 flex-shrink-0">
                                    <PlusSquare size={24} />
                                </div>
                                <div>
                                    <div className="font-semibold text-sm">Paso 2</div>
                                    <div className="text-slate-600 text-xs">Desliza hacia abajo y selecciona <strong>Agregar a Inicio</strong>.</div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                setShowIOSModal(false);
                                dismissPrompt();
                            }}
                            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition shadow-lg"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
