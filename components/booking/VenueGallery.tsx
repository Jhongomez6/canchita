"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { logVenueGallerySwiped } from "@/lib/analytics";

interface VenueGalleryProps {
    venueId: string;
    images: string[];
    venueName: string;
    /** Fallback cuando no hay imágenes (degradado de marca + icono). */
    fallback: React.ReactNode;
}

/**
 * Carrusel de fotos de la sede con scroll-snap horizontal y dots.
 * - 0 fotos → fallback de marca.
 * - 1 foto → imagen estática.
 * - N fotos → carrusel con swipe; los dots reflejan la posición.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §7.
 */
export default function VenueGallery({ venueId, images, venueName, fallback }: VenueGalleryProps) {
    const [active, setActive] = useState(0);
    const [brokenIdx, setBrokenIdx] = useState<Set<number>>(new Set());
    const swipedRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const validImages = images.filter((_, i) => !brokenIdx.has(i));

    // Sin imágenes válidas → fallback de marca.
    if (validImages.length === 0) {
        return <div className="h-48">{fallback}</div>;
    }

    // Una sola imagen → estática, sin carrusel ni dots.
    if (validImages.length === 1) {
        return (
            <div className="relative h-48 overflow-hidden bg-slate-200">
                <Image unoptimized src={validImages[0]} alt={venueName} fill className="object-cover" />
            </div>
        );
    }

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        if (idx !== active) {
            setActive(idx);
            if (!swipedRef.current) {
                swipedRef.current = true;
                logVenueGallerySwiped(venueId, validImages.length);
            }
        }
    };

    return (
        <div className="relative h-48">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            >
                {images.map((src, i) =>
                    brokenIdx.has(i) ? null : (
                        <div key={i} className="relative flex-shrink-0 w-full h-full snap-center bg-slate-200">
                            <Image
                                unoptimized
                                src={src}
                                alt={`${venueName} — foto ${i + 1}`}
                                fill
                                className="object-cover"
                                onError={() =>
                                    setBrokenIdx((prev) => {
                                        const next = new Set(prev);
                                        next.add(i);
                                        return next;
                                    })
                                }
                            />
                        </div>
                    ),
                )}
            </div>

            {/* Dots */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                {validImages.map((_, i) => (
                    <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                            i === active ? "w-4 bg-white" : "w-1.5 bg-white/60"
                        }`}
                    />
                ))}
            </div>
        </div>
    );
}
