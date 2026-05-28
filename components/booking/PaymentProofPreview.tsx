"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Maximize2, ImageOff } from "lucide-react";

interface PaymentProofPreviewProps {
    url: string | null | undefined;
    uploadedAt?: string | null;
    /** Etiqueta del estado para mostrar (ej "En revisión"). */
    statusLabel?: string;
}

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60 * 1000) return "hace un momento";
    if (ms < 60 * 60 * 1000) return `hace ${Math.round(ms / 60000)} min`;
    if (ms < 24 * 60 * 60 * 1000) return `hace ${Math.round(ms / (60 * 60 * 1000))} h`;
    return `hace ${Math.round(ms / (24 * 60 * 60 * 1000))} d`;
}

export default function PaymentProofPreview({ url, uploadedAt, statusLabel }: PaymentProofPreviewProps) {
    const [fullscreen, setFullscreen] = useState(false);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        if (!fullscreen) return;
        window.dispatchEvent(new Event("bottomsheet:open"));
        return () => {
            window.dispatchEvent(new Event("bottomsheet:close"));
        };
    }, [fullscreen]);

    if (!url) {
        return (
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
                <ImageOff className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Comprobante archivado</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                    Los comprobantes se borran a los 90 días
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setFullscreen(true)}
                        className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 group"
                        aria-label="Ver comprobante en pantalla completa"
                    >
                        {!imgError ? (
                            <Image
                                src={url}
                                alt="Comprobante"
                                fill
                                className="object-cover group-hover:scale-105 transition-transform"
                                unoptimized
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                <ImageOff className="w-5 h-5 text-slate-400" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end justify-end p-1">
                            <Maximize2 className="w-3 h-3 text-white opacity-0 group-hover:opacity-100" />
                        </div>
                    </button>
                    <div className="min-w-0 flex-1">
                        {statusLabel && (
                            <p className="text-sm font-semibold text-slate-700">{statusLabel}</p>
                        )}
                        <p className="text-xs text-slate-500">
                            {uploadedAt ? `Subido ${timeAgo(uploadedAt)}` : "Comprobante listo"}
                        </p>
                        <button
                            onClick={() => setFullscreen(true)}
                            className="text-xs font-semibold text-[#1f7a4f] hover:underline mt-0.5"
                        >
                            Ver pantalla completa
                        </button>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {fullscreen && !imgError && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setFullscreen(false)}
                            className="fixed inset-0 bg-black/90 z-[80]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none"
                        >
                            <button
                                onClick={() => setFullscreen(false)}
                                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center pointer-events-auto"
                                aria-label="Cerrar"
                            >
                                <X className="w-5 h-5 text-white" />
                            </button>
                            <div className="relative max-w-full max-h-full pointer-events-auto">
                                <Image
                                    src={url}
                                    alt="Comprobante en pantalla completa"
                                    width={1024}
                                    height={1024}
                                    className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-xl"
                                    unoptimized
                                />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
