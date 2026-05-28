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
}: WhatsAppNotifyButtonProps) {
    if (!phoneNumber) return null;

    const handleClick = () => {
        const cleaned = sanitizePhone(phoneNumber);
        const message = formatWhatsAppNotifyMessage(bookingSummary, appUrl);
        const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
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
            Avisar por WhatsApp
        </button>
    );
}
