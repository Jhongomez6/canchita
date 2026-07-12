"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Settings, Plus, RefreshCw, CalendarPlus, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isLocationAdmin, isPendingLocationAdmin, isSuperAdmin, canCreateBooking } from "@/lib/domain/user";
import { getUserBookings } from "@/lib/bookings";
import { getActiveVenues } from "@/lib/venues";
import { bookingTab, categorizeBookingForList } from "@/lib/domain/booking";
import { handleError } from "@/lib/utils/error";
import { logBookingRebookClicked } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import BookingDetailCard from "@/components/booking/BookingDetailCard";
import PendingAssignmentEmptyState from "@/components/booking/PendingAssignmentEmptyState";
import type { Booking } from "@/lib/domain/booking";
import type { Venue } from "@/lib/domain/venue";
import type { DocumentSnapshot } from "firebase/firestore";

type BookingTab = "active" | "historial";

const TABS: { key: BookingTab; label: string; emptyText: string }[] = [
    { key: "active", label: "Activas", emptyText: "No tienes reservas activas" },
    { key: "historial", label: "Historial", emptyText: "Tu historial está vacío" },
];

// Caché de módulo por uid: primera página de reservas + sedes admin. Sobrevive a la
// navegación cliente (mismo runtime JS), se pierde al recargar/cerrar la app. Evita
// el skeleton en cada revisita; si está stale (>30 s) se refresca en background.
// Ref: docs/IOS_PWA_HOME_STALE_LOADING_SDD.md §18.
interface BookingsCacheEntry {
    bookings: Booking[];
    lastDoc: DocumentSnapshot | null;
    hasMore: boolean;
    adminVenues: Venue[];
    fetchedAt: number;
}
const bookingsCache = new Map<string, BookingsCacheEntry>();
const BOOKINGS_STALE_MS = 30_000;

function BookingsContent() {
    const { user, profile } = useAuth();
    const router = useRouter();

    // Gate/rol derivados a primitivos: los effects NO deben depender del objeto
    // `profile` (cambia de referencia en cada emit del onSnapshot → refetch + parpadeo).
    const uid = user?.uid ?? null;
    const profileReady = !!profile;
    const hasAccess = profile ? hasBookingAccess(profile) : false;
    const pendingLocAdmin = profile ? isPendingLocationAdmin(profile) : false;
    const superAdmin = profile ? isSuperAdmin(profile) : false;
    const locAdmin = profile ? isLocationAdmin(profile) : false;
    const assignedIdsKey = (profile?.assignedLocationIds ?? []).join(",");
    const assignedIds = useMemo(() => (assignedIdsKey ? assignedIdsKey.split(",") : []), [assignedIdsKey]);
    const isVenueAdmin = superAdmin || locAdmin;

    // Estado inicial desde la caché de módulo (si hay): revisita sin skeleton.
    const cached = uid ? bookingsCache.get(uid) : undefined;
    const [bookings, setBookings] = useState<Booking[]>(cached?.bookings ?? []);
    const [adminVenues, setAdminVenues] = useState<Venue[]>(cached?.adminVenues ?? []);
    const [loading, setLoading] = useState(!cached);
    const [refreshing, setRefreshing] = useState(false);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(cached?.lastDoc ?? null);
    const [hasMore, setHasMore] = useState(cached ? cached.hasMore : true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [tab, setTab] = useState<BookingTab>("active");
    const [tabInitialized, setTabInitialized] = useState(false);

    // Carga (o recarga) la primera página de reservas + sedes admin en un round-trip.
    // `silent` mantiene la lista visible (refresh manual / vuelta a la pestaña).
    // Esta página fetchea directo (no via createCachedQueryHook), así que replica su
    // reintento único: la primera query en frío tras login / vuelta de background
    // falla transitoriamente (token/canal de Firestore recién levantando). Ref §17/§18.
    const loadAll = useCallback(
        async (silent = false) => {
            if (!uid) return;
            if (silent) setRefreshing(true);
            else setLoading(true);
            setError(null);

            const RETRY_BACKOFF_MS = 600;
            const attempt = async (retriesLeft: number): Promise<void> => {
                try {
                    const [{ bookings: b, lastDoc: ld }, venues] = await Promise.all([
                        getUserBookings(uid),
                        isVenueAdmin ? getActiveVenues() : Promise.resolve<Venue[] | null>(null),
                    ]);
                    const av = venues == null
                        ? []
                        : superAdmin
                            ? venues
                            : venues.filter((v) => assignedIds.includes(v.id));
                    const more = b.length >= 20;
                    setBookings(b);
                    setLastDoc(ld);
                    setHasMore(more);
                    setAdminVenues(av);
                    bookingsCache.set(uid, { bookings: b, lastDoc: ld, hasMore: more, adminVenues: av, fetchedAt: Date.now() });
                } catch (err) {
                    // Reintento único ante fallo transitorio de arranque/reconexión en
                    // frío. Aplica también al refresh silencioso (vuelta de background en
                    // iOS = canal recién reconectando), acotado a 1 intento (sin storm).
                    if (retriesLeft > 0) {
                        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
                        return attempt(retriesLeft - 1);
                    }
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            };

            try {
                await attempt(1);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [uid, isVenueAdmin, superAdmin, assignedIds],
    );

    // Gate de acceso + carga inicial. Deps primitivas: una re-emisión de `profile`
    // que no cambia rol/uid no refetchea. Con caché fresca no muestra skeleton.
    useEffect(() => {
        if (!uid || !profileReady) return;
        if (!hasAccess) {
            router.replace("/");
            return;
        }
        // Location admin sin sedes: pantalla de espera, no pedimos datos.
        if (pendingLocAdmin) {
            setLoading(false);
            return;
        }
        const c = bookingsCache.get(uid);
        if (c) {
            if (Date.now() - c.fetchedAt > BOOKINGS_STALE_MS) loadAll(true);
        } else {
            loadAll(false);
        }
    }, [uid, profileReady, hasAccess, pendingLocAdmin, loadAll, router]);

    // Revalidar al volver a la pestaña visible (RN-17), solo si la caché está stale.
    useEffect(() => {
        if (!uid || !profileReady || pendingLocAdmin) return;
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            const c = bookingsCache.get(uid);
            if (!c || Date.now() - c.fetchedAt > BOOKINGS_STALE_MS) loadAll(true);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [uid, profileReady, pendingLocAdmin, loadAll]);

    const loadMore = async () => {
        if (!uid || !lastDoc || loadingMore) return;
        setLoadingMore(true);
        try {
            const { bookings: more, lastDoc: ld } = await getUserBookings(uid, 20, lastDoc);
            const nextHasMore = more.length >= 20;
            setBookings((prev) => {
                const next = [...prev, ...more];
                // Mantener la caché de módulo consistente con lo paginado.
                const c = bookingsCache.get(uid);
                if (c) bookingsCache.set(uid, { ...c, bookings: next, lastDoc: ld, hasMore: nextHasMore });
                return next;
            });
            setLastDoc(ld);
            setHasMore(nextHasMore);
        } catch (err) {
            handleError(err, "Error al cargar más reservas");
        } finally {
            setLoadingMore(false);
        }
    };

    const handleRebook = (booking: Booking, source: "played" | "cancelled") => {
        logBookingRebookClicked(booking.venueId, booking.id, booking.format, source);
        router.push(`/venues/${booking.venueId}?format=${encodeURIComponent(booking.format)}`);
    };

    // Segmentar en Activas vs Historial. "Activa" = estado pre-juego activo y fecha ≥ hoy
    // (definido en el dominio vía categorizeBookingForList); el resto es Historial.
    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const buckets = useMemo(() => {
        const active: Booking[] = [];
        const historial: Booking[] = [];
        for (const b of bookings) {
            if (bookingTab(b, todayISO) === "active") active.push(b);
            else historial.push(b);
        }
        // Activas: primero las próximas (fecha asc, lo más cercano arriba), luego las
        // jugadas ya pasadas (fecha desc, la más reciente arriba). Historial: date DESC (query).
        active.sort((a, b) => {
            const aPlayed = a.status === "played";
            const bPlayed = b.status === "played";
            if (aPlayed !== bPlayed) return aPlayed ? 1 : -1;
            const cmp = a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);
            return aPlayed ? -cmp : cmp;
        });
        return { active, historial };
    }, [bookings, todayISO]);

    // Al terminar la primera carga, abrir en la pestaña con contenido más relevante
    // (Activas si hay; si no, Historial) para no aterrizar en un vacío teniendo historial.
    useEffect(() => {
        if (loading || tabInitialized || bookings.length === 0) return;
        if (buckets.active.length === 0 && buckets.historial.length > 0) setTab("historial");
        setTabInitialized(true);
    }, [loading, tabInitialized, bookings.length, buckets]);

    if (profile && isPendingLocationAdmin(profile)) {
        return <PendingAssignmentEmptyState />;
    }

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

    // Error sin datos: mostrar reintentar, NO un falso "no tienes reservas".
    if (error && bookings.length === 0 && adminVenues.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
                <div className="max-w-md mx-auto">
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
                        <h1 className="text-xl font-bold text-white">Mis reservas</h1>
                    </div>
                    <div className="px-6 mt-10">
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center">
                            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                            </div>
                            <p className="font-bold text-slate-800">No pudimos cargar tus reservas</p>
                            <p className="text-sm text-slate-500 mt-1 mb-5">Revisá tu conexión e intentá de nuevo.</p>
                            <button
                                onClick={() => loadAll(false)}
                                className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reintentar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isAdmin = profile ? isLocationAdmin(profile) : false;
    const activeBookings = buckets[tab];
    const activeTabConfig = TABS.find((t) => t.key === tab)!;
    const rebookSource = (b: Booking): "played" | "cancelled" =>
        categorizeBookingForList(b, todayISO) === "cancelled" ? "cancelled" : "played";

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-xl font-bold text-white">
                                {isAdmin ? "Sedes asignadas" : "Mis reservas"}
                            </h1>
                            <p className="text-sm text-white/70 mt-1">
                                {isAdmin
                                    ? adminVenues.length > 0
                                        ? `${adminVenues.length} sede${adminVenues.length > 1 ? "s" : ""} que administras`
                                        : "Aún no tienes sedes asignadas"
                                    : buckets.active.length > 0
                                        ? `${buckets.active.length} reserva${buckets.active.length > 1 ? "s" : ""} activa${buckets.active.length > 1 ? "s" : ""}`
                                        : "Sin reservas activas"
                                }
                            </p>
                        </div>
                        <button
                            onClick={() => loadAll(true)}
                            disabled={refreshing}
                            aria-label="Actualizar reservas"
                            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all disabled:opacity-60"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                <div className="px-4 mt-5">
                    {/* Refresh fallido con datos ya visibles: banner sutil, no bloquea. */}
                    {error && (bookings.length > 0 || adminVenues.length > 0) && (
                        <button
                            onClick={() => loadAll(true)}
                            className="mb-4 w-full flex items-center justify-center gap-2 py-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-xs font-semibold active:scale-[0.99] transition-transform"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            No se pudo actualizar. Tocá para reintentar.
                        </button>
                    )}

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
                                            {venue.icon
                                                ? <span className="text-xl">{venue.icon}</span>
                                                : <Settings className="w-5 h-5 text-[#1f7a4f]" />
                                            }
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

                    {/* Empty state global (sin ninguna reserva ni sede) */}
                    {bookings.length === 0 && adminVenues.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, ease: "easeOut" }}
                            className="mt-2 bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-12 text-center"
                        >
                            {/* Badge de icono con tinte de marca + halo suave (idioma premium de la app) */}
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#1f7a4f]/15 to-[#1f7a4f]/5 ring-8 ring-[#1f7a4f]/[0.04] flex items-center justify-center">
                                <CalendarPlus className="w-9 h-9 text-[#1f7a4f]" strokeWidth={1.75} />
                            </div>

                            <h2 className="text-lg font-bold text-slate-800 mb-1.5">
                                {isAdmin ? "Aún no tienes sedes asignadas" : "Aún no tienes reservas"}
                            </h2>
                            <p className="text-sm text-slate-500 leading-relaxed max-w-[16rem] mx-auto">
                                {isAdmin
                                    ? "Cuando un administrador te asigne una sede, aparecerá aquí."
                                    : "Reserva tu primera cancha y aquí verás todos tus horarios."}
                            </p>

                            {profile && canCreateBooking(profile) && (
                                <button
                                    onClick={() => router.push("/venues")}
                                    className="mt-7 inline-flex items-center gap-2 pl-5 pr-6 py-3 rounded-full bg-[#1f7a4f] text-white text-sm font-bold shadow-lg shadow-[#1f7a4f]/25 hover:bg-[#145c3a] active:scale-95 transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    Explorar canchas
                                </button>
                            )}
                        </motion.div>
                    )}

                    {/* Lista segmentada de reservas (RN-14) */}
                    {bookings.length > 0 && (
                        <div>
                            {/* Tabs */}
                            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
                                {TABS.map((t) => {
                                    const count = buckets[t.key].length;
                                    const active = tab === t.key;
                                    return (
                                        <button
                                            key={t.key}
                                            onClick={() => setTab(t.key)}
                                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                                active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500 hover:text-slate-700"
                                            }`}
                                        >
                                            {t.label}
                                            {count > 0 && (
                                                <span
                                                    className={`text-[10px] font-bold px-1.5 rounded-full ${
                                                        active ? "bg-[#1f7a4f]/10 text-[#1f7a4f]" : "bg-slate-200 text-slate-500"
                                                    }`}
                                                >
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Contenido de la pestaña activa. Las próximas usan card completa;
                                las pasadas (jugadas en Activas, o cualquier Historial) van densas
                                con "Reservar de nuevo". */}
                            {activeBookings.length > 0 ? (
                                <div className="space-y-3">
                                    {activeBookings.map((booking) => {
                                        const pastStyle = tab === "historial" || booking.status === "played";
                                        return pastStyle ? (
                                            <BookingDetailCard
                                                key={booking.id}
                                                booking={booking}
                                                dense
                                                onClick={() => router.push(`/bookings/${booking.id}`)}
                                                onRebook={() => handleRebook(booking, rebookSource(booking))}
                                            />
                                        ) : (
                                            <BookingDetailCard
                                                key={booking.id}
                                                booking={booking}
                                                onClick={() => router.push(`/bookings/${booking.id}`)}
                                            />
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <p className="text-sm text-slate-400">{activeTabConfig.emptyText}</p>
                                </div>
                            )}

                            {/* Load more — solo tiene sentido paginar mientras el usuario ve historial. */}
                            {hasMore && (
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="w-full mt-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 font-semibold hover:bg-slate-50 active:scale-[0.99] transition-all disabled:opacity-60"
                                >
                                    {loadingMore ? "Cargando..." : "Ver más reservas"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* FAB "Reservar" — acción primaria fuera del flujo vertical: no empuja la lista
                y queda siempre a mano sobre el bottom nav. Se alinea al borde derecho de la
                columna max-w-md (también en desktop). Oculto en el empty state (tiene su CTA). */}
            {profile && canCreateBooking(profile) && (bookings.length > 0 || adminVenues.length > 0) && (
                <div className="fixed inset-x-0 bottom-24 md:bottom-6 z-40 pointer-events-none">
                    <div className="max-w-md mx-auto px-4 flex justify-end">
                        <button
                            onClick={() => router.push("/venues")}
                            aria-label="Reservar cancha"
                            className="pointer-events-auto flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full bg-[#1f7a4f] text-white text-sm font-bold shadow-lg shadow-[#1f7a4f]/30 hover:bg-[#145c3a] active:scale-95 transition-all"
                        >
                            <Plus className="w-5 h-5" />
                            Reservar
                        </button>
                    </div>
                </div>
            )}
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
