"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    compressPaymentProof,
    validatePaymentProofFile,
} from "@/lib/utils/imageCompression";
import { uploadPaymentProof } from "@/lib/storage";
import { markPaymentProofUploaded } from "@/lib/bookings";
import { logPaymentProofUploaded, logPaymentProofUploadFailed } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";

interface PaymentProofUploaderProps {
    venueId: string;
    bookingId: string;
    /** Cantidad de intentos previos (history.length). Default 0. */
    previousAttempts?: number;
    /** Callback tras éxito; el componente padre ya recibe el nuevo estado vía subscribeToBooking. */
    onUploaded?: (url: string) => void;
    /** Texto del botón principal (default "Subir comprobante"). */
    primaryLabel?: string;
}

export default function PaymentProofUploader({
    venueId,
    bookingId,
    previousAttempts = 0,
    onUploaded,
    primaryLabel = "Subir comprobante",
}: PaymentProofUploaderProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<"idle" | "compressing" | "uploading" | "saving">("idle");

    const busy = step !== "idle";

    const handleFile = async (file: File) => {
        try {
            validatePaymentProofFile(file);

            setStep("compressing");
            const result = await compressPaymentProof(file);

            setStep("uploading");
            const { url } = await uploadPaymentProof(venueId, bookingId, result.blob);

            setStep("saving");
            await markPaymentProofUploaded(bookingId, url);

            await logPaymentProofUploaded({
                venueId,
                bookingId,
                fileSizeKB: Math.round(result.sizeBytes / 1024),
                attemptNumber: previousAttempts + 1,
            });

            toast.success("Comprobante enviado · En revisión por el admin");
            onUploaded?.(url);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error desconocido";
            try {
                await logPaymentProofUploadFailed({ venueId, bookingId, reason: message });
            } catch {
                // ignore
            }
            handleError(err, "No pudimos subir el comprobante");
        } finally {
            setStep("idle");
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            void handleFile(file);
        }
        // reset value for retry on same file
        e.target.value = "";
    };

    const stepLabel = (() => {
        switch (step) {
            case "compressing":
                return "Procesando imagen…";
            case "uploading":
                return "Subiendo comprobante…";
            case "saving":
                return "Notificando al admin…";
            default:
                return primaryLabel;
        }
    })();

    return (
        <div className="space-y-2">
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleChange}
            />
            <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1f7a4f] text-white font-bold text-sm hover:bg-[#16603c] transition-colors disabled:opacity-60"
            >
                {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Camera className="w-4 h-4" />
                )}
                {stepLabel}
            </button>
            <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
                <ImageIcon className="w-3 h-3" />
                Imagen comprimida cliente · max 500 KB
            </p>
        </div>
    );
}
