"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, CalendarCheck, AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isSuperAdmin, isLocationAdmin } from "@/lib/domain/user";
import { useActiveVenues } from "@/lib/hooks/useActiveVenues";
import type { SportType, VenueAmenity } from "@/lib/domain/venue";
import { collectSports, collectCities, collectAmenities, filterVenues } from "@/lib/domain/venueList";
import AuthGuard from "@/components/AuthGuard";
import VenueCard from "@/components/booking/VenueCard";
import VenueFilterBar from "@/components/booking/VenueFilterBar";

function VenuesContent() {
    const { profile } = useAuth();
    const router = useRouter();
    const isAdmin = profile ? isSuperAdmin(profile) : false;
    // Solo fetcheamos si el usuario realmente verá esta página (los demás redirigen).
    const canBook = !!profile && hasBookingAccess(profile) && !isLocationAdmin(profile);

    const { data, loading: venuesLoading, error, retry } = useActiveVenues({ enabled: canBook });
    const venues = useMemo(() => data ?? [], [data]);
    // Skeleton mientras no haya profile, mientras se decide el redirect, o en la
    // primera carga real de sedes (sin caché).
    const loading = !canBook || (venuesLoading && venues.length === 0);

    // Búsqueda + filtros (client-side sobre las sedes ya cargadas).
    const [query, setQuery] = useState("");
    const [sport, setSport] = useState<SportType | null>(null);
    const [city, setCity] = useState<string | null>(null);
    const [amenities, setAmenities] = useState<VenueAmenity[]>([]);

    const availableSports = useMemo(() => collectSports(venues), [venues]);
    const availableCities = useMemo(() => collectCities(venues), [venues]);
    const availableAmenities = useMemo(() => collectAmenities(venues), [venues]);
    const filteredVenues = useMemo(
        () => filterVenues(venues, { query, sport, city, amenities }),
        [venues, query, sport, city, amenities],
    );
    const toggleAmenity = (a: VenueAmenity) =>
        setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
    const hasFilters = query.trim() !== "" || sport !== null || city !== null || amenities.length > 0;
    // La barra de filtros aparece con al menos 2 sedes (o si hay algo por deportes/ciudades).
    const showFilterBar = venues.length >= 2;

    useEffect(() => {
        if (!profile) return;
        if (!hasBookingAccess(profile)) {
            router.replace("/");
            return;
        }
        if (isLocationAdmin(profile)) {
            router.replace("/bookings");
        }
    }, [profile, router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24 animate-pulse">
                <div className="max-w-md mx-auto">
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] px-5 pt-6 pb-6 rounded-b-3xl">
                        <div className="h-7 bg-white/20 rounded w-44 mb-2" />
                        <div className="h-3 bg-white/15 rounded w-56" />
                    </div>
                    <div className="px-4 mt-4">
                        <div className="h-12 bg-white rounded-2xl border border-slate-200" />
                    </div>
                    <div className="px-4 mt-4 space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-60 bg-slate-200 rounded-3xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header — más liviano. El CTA "Ir a mis reservas" es una acción
                    secundaria (pill translúcido) en el header, no un bloque verde
                    aparte que compita con el título. */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] px-5 pt-6 pb-6 rounded-b-3xl shadow-md">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-bold text-white">
                                {isAdmin ? "Sedes" : "Reservar cancha"}
                            </h1>
                            <p className="text-sm text-white/70 mt-1">
                                {isAdmin ? "Administra y configura tus sedes" : "Encuentra y reserva tu horario"}
                            </p>
                        </div>
                        {isAdmin ? (
                            <button
                                onClick={() => router.push("/venues/admin/new")}
                                aria-label="Nueva sede"
                                className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors flex-shrink-0"
                            >
                                <Plus className="w-5 h-5 text-white" />
                            </button>
                        ) : (
                            <button
                                onClick={() => router.push("/bookings")}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/15 border border-white/25 text-white text-sm font-semibold hover:bg-white/25 active:scale-[0.98] transition-all flex-shrink-0"
                            >
                                <CalendarCheck className="w-4 h-4" />
                                Mis reservas
                            </button>
                        )}
                    </div>
                </div>

                {/* Filtros */}
                {!loading && showFilterBar && (
                    <div className="px-4 mt-4">
                        <VenueFilterBar
                            query={query}
                            onQueryChange={setQuery}
                            sports={availableSports}
                            selectedSport={sport}
                            onSportChange={setSport}
                            cities={availableCities}
                            selectedCity={city}
                            onCityChange={setCity}
                            amenities={availableAmenities}
                            selectedAmenities={amenities}
                            onToggleAmenity={toggleAmenity}
                        />
                    </div>
                )}

                {/* Venue list */}
                <div className="px-4 mt-4 space-y-4">
                    {error && venues.length > 0 && (
                        <button
                            onClick={retry}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-xs font-semibold active:scale-[0.99] transition-transform"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            No se pudo actualizar. Tocá para reintentar.
                        </button>
                    )}

                    {error && venues.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                            </div>
                            <p className="text-base font-medium text-slate-600">No pudimos cargar las sedes</p>
                            <p className="text-sm text-slate-400 mt-1 mb-4">Revisá tu conexión e intentá de nuevo.</p>
                            <button
                                onClick={retry}
                                className="inline-flex items-center justify-center gap-2 py-2.5 px-5 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reintentar
                            </button>
                        </div>
                    ) : venues.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-4xl mb-3">&#127967;</p>
                            <p className="text-base font-medium text-slate-500">No hay sedes disponibles</p>
                            <p className="text-sm text-slate-400 mt-1">Pronto habrá más opciones</p>
                        </div>
                    ) : filteredVenues.length === 0 && (
                        <div className="text-center py-16">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <SearchX className="w-5 h-5 text-slate-400" />
                            </div>
                            <p className="text-base font-medium text-slate-600">Sin resultados</p>
                            <p className="text-sm text-slate-400 mt-1 mb-4">
                                Ninguna sede coincide con tu búsqueda.
                            </p>
                            {hasFilters && (
                                <button
                                    onClick={() => {
                                        setQuery("");
                                        setSport(null);
                                        setCity(null);
                                        setAmenities([]);
                                    }}
                                    className="inline-flex items-center justify-center gap-2 py-2.5 px-5 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                                >
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
                    )}

                    {filteredVenues.map((venue) => (
                        <div key={venue.id} className="relative">
                            <VenueCard
                                venue={venue}
                                onClick={() => router.push(isAdmin ? `/venues/admin/${venue.id}` : `/venues/${venue.id}`)}
                            />
                            {isAdmin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/venues/admin/${venue.id}`);
                                    }}
                                    className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors z-10"
                                >
                                    <Settings className="w-4 h-4 text-slate-600" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function VenuesPage() {
    return (
        <AuthGuard>
            <VenuesContent />
        </AuthGuard>
    );
}
