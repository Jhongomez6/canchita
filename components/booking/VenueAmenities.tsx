"use client";

import { motion } from "framer-motion";
import {
    Car, Lightbulb, ShowerHead, Lock, Footprints, Coffee, Bath, Wifi, Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { VENUE_AMENITY_LABELS } from "@/lib/domain/venue";
import type { VenueAmenity } from "@/lib/domain/venue";

export const AMENITY_ICON: Record<VenueAmenity, LucideIcon> = {
    covered: Home,
    parking: Car,
    lighting: Lightbulb,
    showers: ShowerHead,
    lockers: Lock,
    shoe_rental: Footprints,
    cafeteria: Coffee,
    bathrooms: Bath,
    wifi: Wifi,
};

interface VenueAmenitiesProps {
    amenities?: VenueAmenity[];
    /** Si alguna cancha activa es techada, se resalta un chip "Techada" al inicio
     *  de las amenidades (es un diferenciador importante de la sede). */
    anyCovered?: boolean;
}

/**
 * Fila de chips con las amenidades (servicios) de la sede + un chip destacado de
 * "Techada" si aplica. Se oculta si no hay nada. La superficie (y la condición
 * detallada por formato) se muestra aparte, contextual al formato: VenueSurfaceChips.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §1 RN-02/RN-03.
 */
export default function VenueAmenities({ amenities, anyCovered }: VenueAmenitiesProps) {
    const list = amenities ?? [];
    // "Techada" tiene DOS fuentes: la amenity a nivel sede (`covered`) y el
    // resumen por cancha (`anyCovered`). Se fusionan en un único chip destacado;
    // la amenity se saca de la lista de íconos para no duplicarla.
    const isCovered = anyCovered || list.includes("covered");
    const rest = list.filter((a) => a !== "covered");
    if (rest.length === 0 && !isCovered) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {/* Chip destacado de "Techada" (verde de marca) */}
            {isCovered && (
                <motion.span
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1f7a4f]/10 border border-[#1f7a4f]/30 px-3 py-1.5 text-sm font-semibold text-[#1f7a4f]"
                >
                    <Home className="w-4 h-4" />
                    Cancha techada
                </motion.span>
            )}
            {rest.map((a, i) => {
                const Icon = AMENITY_ICON[a];
                return (
                    <motion.span
                        key={a}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: (i + (isCovered ? 1 : 0)) * 0.04 }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
                    >
                        <Icon className="w-4 h-4 text-[#1f7a4f]" />
                        {VENUE_AMENITY_LABELS[a]}
                    </motion.span>
                );
            })}
        </div>
    );
}
