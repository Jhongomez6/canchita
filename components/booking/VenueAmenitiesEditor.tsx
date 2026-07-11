"use client";

import { VENUE_AMENITIES, VENUE_AMENITY_LABELS } from "@/lib/domain/venue";
import type { VenueAmenity } from "@/lib/domain/venue";
import { AMENITY_ICON } from "./VenueAmenities";

interface VenueAmenitiesEditorProps {
    value: VenueAmenity[];
    onChange: (next: VenueAmenity[]) => void;
}

/**
 * Editor de amenidades (solo Super Admin). Grilla de toggles del catálogo cerrado.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §9.
 */
export default function VenueAmenitiesEditor({ value, onChange }: VenueAmenitiesEditorProps) {
    const selected = new Set(value);

    const toggle = (a: VenueAmenity) => {
        const next = new Set(selected);
        if (next.has(a)) next.delete(a);
        else next.add(a);
        // Preserva el orden del catálogo para estabilidad.
        onChange(VENUE_AMENITIES.filter((x) => next.has(x)));
    };

    return (
        <div className="grid grid-cols-2 gap-2">
            {VENUE_AMENITIES.map((a) => {
                const Icon = AMENITY_ICON[a];
                const isOn = selected.has(a);
                return (
                    <button
                        key={a}
                        type="button"
                        onClick={() => toggle(a)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                            isOn
                                ? "border-[#1f7a4f] bg-[#1f7a4f]/10 text-[#1f7a4f]"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                    >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isOn ? "text-[#1f7a4f]" : "text-slate-400"}`} />
                        <span className="truncate">{VENUE_AMENITY_LABELS[a]}</span>
                    </button>
                );
            })}
        </div>
    );
}
