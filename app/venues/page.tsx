"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, CalendarCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isSuperAdmin, isLocationAdmin } from "@/lib/domain/user";
import { useActiveVenues } from "@/lib/hooks/useActiveVenues";
import AuthGuard from "@/components/AuthGuard";
import VenueCard from "@/components/booking/VenueCard";

function VenuesContent() {
    const { profile } = useAuth();
    const router = useRouter();
    const isAdmin = profile ? isSuperAdmin(profile) : false;
    // Solo fetcheamos si el usuario realmente verá esta página (los demás redirigen).
    const canBook = !!profile && hasBookingAccess(profile) && !isLocationAdmin(profile);

    const { data, loading: venuesLoading, error, retry } = useActiveVenues({ enabled: canBook });
    const venues = data ?? [];
    // Skeleton mientras no haya profile, mientras se decide el redirect, o en la
    // primera carga real de sedes (sin caché).
    const loading = !canBook || (venuesLoading && venues.length === 0);

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
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl">
                        <div className="h-6 bg-white/20 rounded w-40 mb-2" />
                        <div className="h-3 bg-white/15 rounded w-56" />
                    </div>
                    <div className="px-4 mt-5 space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                                <div className="h-36 bg-slate-100" />
                                <div className="p-4 space-y-2">
                                    <div className="h-4 bg-slate-200 rounded w-32" />
                                    <div className="h-3 bg-slate-100 rounded w-48" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold text-white">
                                {isAdmin ? "Sedes" : "Reservar cancha"}
                            </h1>
                            <p className="text-sm text-white/70 mt-1">
                                {isAdmin ? "Administra y configura tus sedes" : "Encuentra y reserva tu horario"}
                            </p>
                        </div>
                        {/* Admin: botón + para nueva sede (pequeño, queda en el header).
                            Jugadores: el CTA "Ver mis reservas" se movió debajo del header para
                            no competir con el título. */}
                        {isAdmin && (
                            <button
                                onClick={() => router.push("/venues/admin/new")}
                                className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors flex-shrink-0"
                            >
                                <Plus className="w-5 h-5 text-white" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Venue list */}
                <div className="px-4 mt-5 space-y-4">
                    {/* CTA "Ver mis reservas" — solo para jugadores (no admin).
                        Mismo estilo solid verde que el CTA "+ Reservar nueva cancha" en
                        /bookings: consistencia cross-page para acciones de navegación
                        entre las dos pantallas del flujo de reservas. */}
                    {!isAdmin && (
                        <button
                            onClick={() => router.push("/bookings")}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#1f7a4f] text-white text-sm font-bold shadow-sm hover:bg-[#145c3a] active:scale-[0.99] transition-all"
                        >
                            <CalendarCheck className="w-4 h-4" />
                            Ir a mis reservas
                        </button>
                    )}

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
                    ) : venues.length === 0 && (
                        <div className="text-center py-16">
                            <p className="text-4xl mb-3">&#127967;</p>
                            <p className="text-base font-medium text-slate-500">No hay sedes disponibles</p>
                            <p className="text-sm text-slate-400 mt-1">Pronto habrá más opciones</p>
                        </div>
                    )}

                    {venues.map((venue) => (
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
