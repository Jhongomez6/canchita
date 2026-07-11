"use client";

import { MapPin, Phone } from "lucide-react";
import { buildMapsUrl, buildVenueWhatsAppUrl } from "@/lib/domain/venue";
import type { Venue } from "@/lib/domain/venue";
import { logVenueContactClicked } from "@/lib/analytics";

interface VenueContactActionsProps {
    venue: Pick<Venue, "id" | "name" | "address" | "lat" | "lng" | "phone" | "whatsappNotificationNumber">;
}

/**
 * Dirección legible tocable (→ Google Maps) + botones de contacto WhatsApp/Llamar.
 * Solo aparecen los botones cuyos datos existen en la sede.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §1 RN-04/RN-05.
 */
export default function VenueContactActions({ venue }: VenueContactActionsProps) {
    const mapsUrl = buildMapsUrl(venue);
    const hasWhatsApp = !!venue.whatsappNotificationNumber?.trim();
    const hasPhone = !!venue.phone?.trim();

    return (
        <div className="space-y-3">
            {/* Dirección → mapa (contraste AA, tocable) */}
            <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logVenueContactClicked(venue.id, "map")}
                className="flex items-start gap-2 text-slate-600 active:text-[#1f7a4f] transition-colors"
            >
                <MapPin className="w-4 h-4 text-[#1f7a4f] flex-shrink-0 mt-0.5" />
                <span className="text-sm underline decoration-slate-300 underline-offset-2">
                    {venue.address}
                </span>
            </a>

            {/* Botones de contacto */}
            {(hasWhatsApp || hasPhone) && (
                <div className="flex gap-2">
                    {hasWhatsApp && (
                        <a
                            href={buildVenueWhatsAppUrl(venue.whatsappNotificationNumber!, venue.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => logVenueContactClicked(venue.id, "whatsapp")}
                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366]/10 text-[#128C4B] font-semibold text-sm border border-[#25D366]/30 active:scale-[0.98] transition-transform"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/whatsapp.svg" alt="" className="w-4 h-4" />
                            WhatsApp
                        </a>
                    )}
                    {hasPhone && (
                        <a
                            href={`tel:${venue.phone!.replace(/[^0-9+]/g, "")}`}
                            onClick={() => logVenueContactClicked(venue.id, "phone")}
                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm border border-slate-200 active:scale-[0.98] transition-transform"
                        >
                            <Phone className="w-4 h-4" />
                            Llamar
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
