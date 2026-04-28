"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isLocationAdmin, isSuperAdmin, canCreateBooking } from "@/lib/domain/user";
import { getUserBookings } from "@/lib/bookings";
import { getActiveVenues } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import BookingDetailCard from "@/components/booking/BookingDetailCard";
import type { Booking } from "@/lib/domain/booking";
import type { Venue } from "@/lib/domain/venue";
import type { DocumentSnapshot } from "firebase/firestore";

function BookingsContent() {
    const { user, profile } = useAuth();
    const router = useRouter();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [adminVenues, setAdminVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        if (!user || !profile) return;

        if (!hasBookingAccess(profile)) {
            router.replace("/");
            return;
        }

        getUserBookings(user.uid)
            .then(({ bookings: b, lastDoc: ld }) => {
                setBookings(b);
                setLastDoc(ld);
                setHasMore(b.length >= 20);
            })
            .catch((err) => handleError(err, "Error al cargar reservas"))
            .finally(() => setLoading(false));

        // Load assigned venues for admins (super_admin sees all, location_admin sees assigned)
        if (isSuperAdmin(profile) || isLocationAdmin(profile)) {
            getActiveVenues()
                .then((all) => {
                    if (isSuperAdmin(profile)) {
                        setAdminVenues(all);
                    } else {
                        const ids = profile.assignedLocationIds ?? [];
                        setAdminVenues(all.filter((v) => ids.includes(v.id)));
                    }
                })
                .catch(() => setAdminVenues([]));
        }
    }, [user, profile, router]);

    const loadMore = async () => {
        if (!user || !lastDoc || loadingMore) return;
        setLoadingMore(true);
        try {
            const { bookings: more, lastDoc: ld } = await getUserBookings(user.uid, 20, lastDoc);
            setBookings((prev) => [...prev, ...more]);
            setLastDoc(ld);
            setHasMore(more.length >= 20);
        } catch (err) {
            handleError(err, "Error al cargar más reservas");
        } finally {
            setLoadingMore(false);
        }
    };

    // Split into upcoming and past
    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const upcoming = bookings.filter((b) => b.date >= todayISO && b.status !== "cancelled" && b.status !== "expired");
    const past = bookings.filter((b) => b.date < todayISO || b.status === "cancelled" || b.status === "expired");

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24 animate-pulse">
                <div className="max-w-md mx-auto">
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl">
                        <div className="h-6 bg-white/20 rounded w-36 mb-2" />
                        <div className="h-3 bg-white/15 rounded w-48" />
                    </div>
                    <div className="px-4 mt-5 space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                                <div className="flex justify-between">
                                    <div className="h-4 bg-slate-200 rounded w-20" />
                                    <div className="h-4 bg-slate-100 rounded w-16" />
                                </div>
                                <div className="h-3 bg-slate-200 rounded w-40" />
                                <div className="h-3 bg-slate-100 rounded w-32" />
                                <div className="h-3 bg-slate-100 rounded w-36" />
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
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-white">
                            {profile && isLocationAdmin(profile)
                                ? "Sedes asignadas"
                                : "Mis reservas"}
                        </h1>
                        <p className="text-sm text-white/70 mt-1">
                            {profile && isLocationAdmin(profile)
                                ? adminVenues.length > 0
                                    ? `${adminVenues.length} sede${adminVenues.length > 1 ? "s" : ""} que administras`
                                    : "Aún no tienes sedes asignadas"
                                : upcoming.length > 0
                                    ? `${upcoming.length} reserva${upcoming.length > 1 ? "s" : ""} próxima${upcoming.length > 1 ? "s" : ""}`
                                    : "Sin reservas próximas"
                            }
                        </p>
                    </div>
                    {profile && canCreateBooking(profile) && (bookings.length > 0 || adminVenues.length > 0) && (
                        <button
                            onClick={() => router.push("/venues")}
                            className="flex-shrink-0 px-4 py-2 bg-white text-[#1f7a4f] text-sm font-bold rounded-xl shadow hover:bg-slate-50 active:scale-95 transition-all"
                        >
                            + Reservar
                        </button>
                    )}
                </div>

                <div className="px-4 mt-5">
                    {/* Admin venues section */}
                    {adminVenues.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-slate-500 mb-3">Sedes que administras</h2>
                            <div className="space-y-2">
                                {adminVenues.map((venue) => (
                                    <button
                                        key={venue.id}
                                        onClick={() => router.push(`/venues/admin/${venue.id}`)}
                                        className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 hover:border-[#1f7a4f]/30 hover:shadow-sm active:scale-[0.99] transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-[#1f7a4f]/10 flex items-center justify-center flex-shrink-0">
                                            <Settings className="w-5 h-5 text-[#1f7a4f]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{venue.name}</p>
                                            <p className="text-xs text-slate-400 truncate">{venue.address}</p>
                                        </div>
                                        <span className="text-xs text-[#1f7a4f] font-semibold flex-shrink-0">Administrar →</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {bookings.length === 0 && adminVenues.length === 0 && (
                        <div className="text-center py-16">
                            <p className="text-4xl mb-3">&#128197;</p>
                            <p className="text-base font-medium text-slate-500">
                                {profile && isLocationAdmin(profile)
                                    ? "Aún no tienes sedes asignadas"
                                    : "Aún no tienes reservas"}
                            </p>
                            {profile && canCreateBooking(profile) && (
                                <button
                                    onClick={() => router.push("/venues")}
                                    className="mt-4 px-5 py-2.5 bg-[#1f7a4f] text-white text-sm font-semibold rounded-xl hover:bg-[#145c3a] transition-colors"
                                >
                                    Explorar canchas
                                </button>
                            )}
                        </div>
                    )}

                    {/* Upcoming */}
                    {upcoming.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-slate-500 mb-3">Próximas</h2>
                            <div className="space-y-3">
                                {upcoming.map((booking) => (
                                    <BookingDetailCard
                                        key={booking.id}
                                        booking={booking}
                                        onClick={() => router.push(`/bookings/${booking.id}`)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Past */}
                    {past.length > 0 && (
                        <div>
                            <h2 className="text-sm font-semibold text-slate-500 mb-3">Anteriores</h2>
                            <div className="space-y-3">
                                {past.map((booking) => (
                                    <BookingDetailCard
                                        key={booking.id}
                                        booking={booking}
                                        compact
                                        onClick={() => router.push(`/bookings/${booking.id}`)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Load more */}
                    {hasMore && bookings.length > 0 && (
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="w-full mt-4 py-3 text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors"
                        >
                            {loadingMore ? "Cargando..." : "Ver más"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function BookingsPage() {
    return (
        <AuthGuard>
            <BookingsContent />
        </AuthGuard>
    );
}
