"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { MapPin, ChevronRight, Home } from "lucide-react";
import type { Venue } from "@/lib/domain/venue";
import { VENUE_AMENITY_LABELS } from "@/lib/domain/venue";
import { venueSports, venueClientFormatLabels, prioritizeAmenities } from "@/lib/domain/venueList";
import SportBadge, { SPORT_EMOJI } from "./SportBadge";
import { AMENITY_ICON } from "./VenueAmenities";

interface VenueCardProps {
    venue: Venue;
    onClick: () => void;
}

/**
 * Tarjeta inmersiva de sede: imagen a pantalla completa con degradado inferior,
 * nombre + dirección sobre la imagen, chips de deporte arriba y una fila CTA
 * ("Reservar ›") abajo. Si la imagen falla (o no existe), cae a un degradado
 * verde con el emoji del primer deporte.
 */
export default function VenueCard({ venue, onClick }: VenueCardProps) {
    const [imgError, setImgError] = useState(false);
    const sports = venueSports(venue);
    const formatLabels = venueClientFormatLabels(venue);
    const showImage = !!venue.imageURL && !imgError;
    // "Cancha techada" es una amenity, pero el diferenciador clave: se muestra como
    // chip destacado con label, mientras el resto van icon-only. Ocupa un cupo del
    // presupuesto de íconos para no saturar la tarjeta.
    const prioritized = prioritizeAmenities(venue.amenities);
    const covered = prioritized.includes("covered");
    const iconAmenities = prioritized.filter((a) => a !== "covered");
    const iconBudget = covered ? 3 : 4;
    const shownAmenities = iconAmenities.slice(0, iconBudget);
    const extraAmenities = iconAmenities.length - shownAmenities.length;
    const hasAmenityRow = covered || shownAmenities.length > 0;

    return (
        <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="group relative w-full h-60 rounded-3xl overflow-hidden text-left shadow-sm hover:shadow-lg transition-shadow bg-slate-200"
        >
            {/* Imagen o fallback */}
            {showImage ? (
                <Image
                    unoptimized
                    src={venue.imageURL!}
                    alt={venue.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={() => setImgError(true)}
                />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1f7a4f] to-[#0f4a2e] flex items-center justify-center">
                    <span className="text-6xl opacity-90" aria-hidden>
                        {SPORT_EMOJI[sports[0]] ?? "⚽"}
                    </span>
                </div>
            )}

            {/* Degradado para legibilidad del texto inferior */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

            {/* Chips de deporte + depósito (arriba izquierda).
                `pr-14` deja libre la esquina superior derecha para el engranaje de
                admin que la página monta sobre la tarjeta. */}
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 pr-14">
                {sports.map((s) => (
                    <span
                        key={s}
                        className="inline-flex items-center rounded-full bg-black/40 backdrop-blur-sm px-2 py-1 text-sm leading-none"
                    >
                        <SportBadge sport={s} iconOnly />
                    </span>
                ))}
                {venue.depositRequired && (
                    <span className="rounded-full bg-white/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-[#1f7a4f]">
                        {venue.depositPercent}% depósito
                    </span>
                )}
            </div>

            {/* Contenido inferior sobre el degradado */}
            <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">
                    {venue.name}
                </h3>
                <div className="mt-1 flex items-center gap-1.5 text-white/80">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs truncate">{venue.address}</span>
                </div>

                {/* Techada (destacado) + amenities icon-only — señal rápida de la sede */}
                {hasAmenityRow && (
                    <div className="mt-2 flex items-center gap-1.5">
                        {covered && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-2 py-1 text-[11px] font-bold text-[#1f7a4f]">
                                <Home className="w-3.5 h-3.5" />
                                Techada
                            </span>
                        )}
                        {shownAmenities.map((a) => {
                            const Icon = AMENITY_ICON[a];
                            return (
                                <span
                                    key={a}
                                    title={VENUE_AMENITY_LABELS[a]}
                                    className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
                                >
                                    <Icon className="w-3.5 h-3.5 text-white" aria-label={VENUE_AMENITY_LABELS[a]} />
                                </span>
                            );
                        })}
                        {extraAmenities > 0 && (
                            <span className="text-[11px] font-semibold text-white/80">+{extraAmenities}</span>
                        )}
                    </div>
                )}

                {/* Formatos disponibles + CTA */}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-white/70 truncate">
                        {formatLabels.length > 0
                            ? formatLabels.slice(0, 3).join(" · ")
                            : "Reserva tu horario"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 pl-3 pr-2 py-1 text-xs font-bold text-[#1f7a4f] flex-shrink-0">
                        Reservar
                        <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                </div>
            </div>
        </motion.button>
    );
}
