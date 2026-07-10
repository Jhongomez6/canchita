"use client";

import { MessageCircle } from "lucide-react";
import { formatWhatsAppNotifyMessage } from "@/lib/domain/venue";
import { logWhatsAppNotifyTapped } from "@/lib/analytics";

interface WhatsAppNotifyButtonProps {
    venueId: string;
    bookingId: string;
    /** Número en formato E.164 sin spaces ("+573112345678"). */
    phoneNumber: string;
    /** Resumen corto del booking ("Cancha 6v6 · Vie 5 Jun 6:00 PM"). */
    bookingSummary: string;
    /** URL del app para incluir en el mensaje (opcional). */
    appUrl?: string;
    /** Texto del botón. Default "Avisar por WhatsApp". */
    label?: string;
    /** Mensaje pre-llenado. Si no se pasa, usa el mensaje de aviso de pago. */
    message?: string;
}

function sanitizePhone(num: string): string {
    return num.replace(/[^0-9]/g, "");
}

export default function WhatsAppNotifyButton({
    venueId,
    bookingId,
    phoneNumber,
    bookingSummary,
    appUrl,
    label = "Avisar por WhatsApp",
    message,
}: WhatsAppNotifyButtonProps) {
    if (!phoneNumber) return null;

    const handleClick = () => {
        const cleaned = sanitizePhone(phoneNumber);
        const text = message ?? formatWhatsAppNotifyMessage(bookingSummary, appUrl);
        const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
        // Analytics best-effort
        try {
            logWhatsAppNotifyTapped({ venueId, bookingId });
        } catch {
            // ignore
        }
        window.open(url, "_blank");
    };

    return (
        <button
            onClick={handleClick}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] text-white font-semibold text-sm hover:bg-[#1eb858] transition-colors"
        >
            <MessageCircle className="w-4 h-4" />
            {label}
        </button>
    );
}
