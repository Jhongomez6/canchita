"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

interface QRViewerModalProps {
    open: boolean;
    onClose: () => void;
    qrImageURL: string;
    methodLabel: string;
}

export default function QRViewerModal({ open, onClose, qrImageURL, methodLabel }: QRViewerModalProps) {
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!open) return;
        window.dispatchEvent(new Event("bottomsheet:open"));
        return () => {
            window.dispatchEvent(new Event("bottomsheet:close"));
        };
    }, [open]);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await fetch(qrImageURL);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `qr_${methodLabel.replace(/\s+/g, "_")}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("QR descargado");
        } catch {
            toast.error("No se pudo descargar el QR");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/70 z-[70]"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full pointer-events-auto overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                                <h3 className="text-base font-bold text-slate-800">
                                    QR · {methodLabel}
                                </h3>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                    aria-label="Cerrar"
                                >
                                    <X className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>
                            <div className="p-5 flex items-center justify-center bg-slate-50">
                                <Image
                                    src={qrImageURL}
                                    alt={`QR ${methodLabel}`}
                                    width={300}
                                    height={300}
                                    className="rounded-xl border border-slate-200"
                                    unoptimized
                                />
                            </div>
                            <div className="px-5 py-4 border-t border-slate-100">
                                <button
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="w-full py-3 rounded-xl bg-[#1f7a4f] text-white font-bold text-sm hover:bg-[#16603c] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {downloading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                    Descargar QR
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
