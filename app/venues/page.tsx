"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, CalendarCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isSuperAdmin } from "@/lib/domain/user";
import { getActiveVenues } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import VenueCard from "@/components/booking/VenueCard";
import type { Venue } from "@/lib/domain/venue";

function VenuesContent() {
    const { profile } = useAuth();
    const router = useRouter();
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const isAdmin = profile ? isSuperAdmin(profile) : false;

    useEffect(() => {
        if (!profile) return;

        if (!hasBookingAccess(profile)) {
            router.replace("/");
            return;
        }

        getActiveVenues()
            .then(setVenues)
            .catch((err) => handleError(err, "Error al cargar sedes"))
            .finally(() => setLoading(false));
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
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-white">
                                {isAdmin ? "Sedes" : "Reservar cancha"}
                            </h1>
                            <p className="text-sm text-white/70 mt-1">
                                {isAdmin ? "Administra y configura tus sedes" : "Encuentra y reserva tu horario"}
                            </p>
                        </div>
                        {isAdmin ? (
                            <button
                                onClick={() => router.push("/venues/admin/new")}
                                className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                            >
                                <Plus className="w-5 h-5 text-white" />
                            </button>
                        ) : (
                            <button
                                onClick={() => router.push("/bookings")}
                                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white text-[#1f7a4f] text-sm font-bold rounded-xl shadow hover:bg-slate-50 active:scale-95 transition-all"
                            >
                                <CalendarCheck className="w-5 h-5" />
                                Ver mis reservas
                            </button>
                        )}
                    </div>
                </div>

                {/* Venue list */}
                <div className="px-4 mt-5 space-y-4">
                    {venues.length === 0 && (
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
