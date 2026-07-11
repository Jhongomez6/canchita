"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import type { SportType, VenueAmenity } from "@/lib/domain/venue";
import { SPORT_LABELS, VENUE_AMENITY_LABELS } from "@/lib/domain/venue";
import SportIcon from "./SportIcon";
import { AMENITY_ICON } from "./VenueAmenities";

interface VenueFilterBarProps {
    query: string;
    onQueryChange: (q: string) => void;
    sports: SportType[];              // deportes disponibles (chips solo si ≥2)
    selectedSport: SportType | null;
    onSportChange: (s: SportType | null) => void;
    cities: string[];                 // ciudades disponibles (chips solo si ≥2)
    selectedCity: string | null;
    onCityChange: (c: string | null) => void;
    amenities: VenueAmenity[];        // amenities disponibles (chips solo si ≥1)
    selectedAmenities: VenueAmenity[];
    onToggleAmenity: (a: VenueAmenity) => void;
}

/**
 * Barra de búsqueda + filtros de la lista de sedes. Deporte y ciudad son
 * single-select (chips solo si ≥2 opciones); amenities es multi-select (la sede
 * debe tenerlas todas). El buscador siempre está disponible.
 */
export default function VenueFilterBar({
    query,
    onQueryChange,
    sports,
    selectedSport,
    onSportChange,
    cities,
    selectedCity,
    onCityChange,
    amenities,
    selectedAmenities,
    onToggleAmenity,
}: VenueFilterBarProps) {
    const showSports = sports.length >= 2;
    const showCities = cities.length >= 2;
    const showAmenities = amenities.length >= 1;

    return (
        <div className="space-y-3">
            {/* Buscador */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    inputMode="search"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Buscar sede o dirección"
                    className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white border border-slate-200 text-base text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]"
                />
                {query && (
                    <button
                        onClick={() => onQueryChange("")}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Filtro por deporte */}
            {showSports && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
                    <FilterChip
                        label="Todos"
                        active={selectedSport === null}
                        onClick={() => onSportChange(null)}
                    />
                    {sports.map((s) => (
                        <FilterChip
                            key={s}
                            label={SPORT_LABELS[s]}
                            icon={<SportIcon sport={s} className="w-3.5 h-3.5" />}
                            active={selectedSport === s}
                            onClick={() => onSportChange(selectedSport === s ? null : s)}
                        />
                    ))}
                </div>
            )}

            {/* Filtro por ciudad */}
            {showCities && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
                    <FilterChip
                        label="Toda ciudad"
                        active={selectedCity === null}
                        onClick={() => onCityChange(null)}
                    />
                    {cities.map((c) => (
                        <FilterChip
                            key={c}
                            label={c}
                            active={selectedCity === c}
                            onClick={() => onCityChange(selectedCity === c ? null : c)}
                        />
                    ))}
                </div>
            )}

            {/* Filtro por amenities (multi-select: la sede debe tenerlas todas) */}
            {showAmenities && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
                    {amenities.map((a) => {
                        const Icon = AMENITY_ICON[a];
                        return (
                            <FilterChip
                                key={a}
                                label={VENUE_AMENITY_LABELS[a]}
                                icon={<Icon className="w-3.5 h-3.5" />}
                                active={selectedAmenities.includes(a)}
                                onClick={() => onToggleAmenity(a)}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function FilterChip({
    label,
    active,
    onClick,
    icon,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    icon?: ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                active
                    ? "bg-[#1f7a4f] text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
            }`}
        >
            {icon}
            {label}
        </button>
    );
}
