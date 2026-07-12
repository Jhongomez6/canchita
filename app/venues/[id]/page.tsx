"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Settings, CalendarOff, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isSuperAdmin } from "@/lib/domain/user";
import { getAvailableFormats, getDayOfWeek, generateTimeSlots, applyDurationTier, isSlotBeforeWeekendLead, getEffectiveBookingPolicies, galleryImages, venueCoverage, clampBookingWindowDays } from "@/lib/domain/venue";
import { getAvailableFormatsForSlot } from "@/lib/domain/court-allocation";
import { getVenue, getVenueCourts, getVenueCombos, getVenueSchedule, subscribeToBlockedSlots } from "@/lib/venues";
import { subscribeToBookingsForDate, createBooking } from "@/lib/bookings";
import { getWallet } from "@/lib/wallet";
import { handleError } from "@/lib/utils/error";
import { logVenueViewed, logBookingFormatSelected, logBookingSlotSelected, logBookingConfirmed, logVenuePoliciesExpanded, logBookingNoAvailabilityShown } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import VenueFormatPicker from "@/components/booking/VenueFormatPicker";
import DateCarousel from "@/components/booking/DateCarousel";
import SlotList from "@/components/booking/SlotList";
import SlotListSkeleton from "@/components/skeletons/SlotListSkeleton";
import VenueGallery from "@/components/booking/VenueGallery";
import VenueAmenities from "@/components/booking/VenueAmenities";
import VenueContactActions from "@/components/booking/VenueContactActions";
import BookingPoliciesPreview from "@/components/booking/BookingPoliciesPreview";
import SelectionSummaryBar from "@/components/booking/SelectionSummaryBar";
import BookingConfirmSheet from "@/components/booking/BookingConfirmSheet";
import type { Venue, Court, CourtCombo, DaySchedule, FormatPricing, BlockedSlot } from "@/lib/domain/venue";
import type { Booking } from "@/lib/domain/booking";
import type { SlotItem } from "@/components/booking/SlotList";
import type { Wallet } from "@/lib/domain/wallet";

function VenueDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { profile, user } = useAuth();
    const venueId = params.id as string;

    // Data state
    const [venue, setVenue] = useState<Venue | null>(null);
    const [courts, setCourts] = useState<Court[]>([]);
    const [combos, setCombos] = useState<CourtCombo[]>([]);
    const [schedule, setSchedule] = useState<DaySchedule | null>(null);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
    const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    // Gate de acceso derivado a primitivos: el effect de carga NO debe depender del
    // objeto `profile` (cambia de referencia en cada emit del onSnapshot → refetch y
    // `logVenueViewed` duplicado). Con booleans, solo re-corre si el acceso cambia.
    const profileReady = !!profile;
    const hasAccess = profile ? hasBookingAccess(profile) : false;

    // Selection state. Prefill del formato vía `?format=` (flujo "Reservar de nuevo"
    // desde el historial). Se lee de window para no requerir Suspense de useSearchParams.
    // Ref: docs/BOOKING_SYSTEM_SDD.md RN-15.
    const [selectedFormat, setSelectedFormat] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return new URLSearchParams(window.location.search).get("format");
    });
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const [selectedStart, setSelectedStart] = useState<string | null>(null);
    const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
    const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
    const [, setBookingLoading] = useState(false);

    // Carga de datos de la sede (con timeout en los fetchers → sin cuelgue). Extraída
    // en callback para poder reintentar desde el estado de error.
    const loadVenue = useCallback(() => {
        if (!venueId) return;
        setLoadError(false);
        setLoading(true);
        Promise.all([
            getVenue(venueId),
            getVenueCourts(venueId),
            getVenueCombos(venueId),
        ])
            .then(([v, c, co]) => {
                if (!v) {
                    toast.error("Sede no encontrada");
                    router.replace("/venues");
                    return;
                }
                setVenue(v);
                setCourts(c);
                setCombos(co);
                logVenueViewed(venueId, v.name, "explore");
            })
            .catch((err) => {
                setLoadError(true);
                handleError(err, "Error al cargar la sede");
            })
            .finally(() => setLoading(false));
    }, [venueId, router]);

    // Gate de acceso + carga inicial. Deps primitivas: no refetchea ni re-loguea
    // `venue_viewed` por re-emisión del perfil.
    useEffect(() => {
        if (!profileReady) return;
        if (!hasAccess) {
            router.replace("/");
            return;
        }
        loadVenue();
    }, [profileReady, hasAccess, loadVenue, router]);

    // Load wallet
    useEffect(() => {
        if (!user) return;
        getWallet(user.uid).then(setWallet).catch(() => {});
    }, [user]);

    // Load schedule when date changes (one-shot). `scheduleLoading` muestra un
    // skeleton local mientras carga, evitando ver los slots del día anterior.
    useEffect(() => {
        if (!venueId || !selectedDate) return;
        const dayOfWeek = getDayOfWeek(selectedDate);
        setScheduleLoading(true);
        getVenueSchedule(venueId, dayOfWeek)
            .then(setSchedule)
            .catch((err) => handleError(err, "Error al cargar horarios"))
            .finally(() => setScheduleLoading(false));
        setSelectedStart(null);
        setSelectedEnd(null);
    }, [venueId, selectedDate]);

    // Reactive subscriptions: bookings + blocked slots for the selected date
    useEffect(() => {
        if (!venueId || !selectedDate) return;
        const unsubBookings = subscribeToBookingsForDate(venueId, selectedDate, setExistingBookings);
        const unsubBlocked = subscribeToBlockedSlots(venueId, selectedDate, setBlockedSlots);
        return () => {
            unsubBookings();
            unsubBlocked();
        };
    }, [venueId, selectedDate]);

    // Derived: available formats
    const formatOptions = useCallback(() => {
        if (!schedule || !schedule.enabled) return [];

        // Collect unique formats from schedule with their min price
        const formatMap = new Map<string, number>();
        for (const slot of schedule.slots) {
            for (const fp of slot.formats) {
                const existing = formatMap.get(fp.format);
                if (existing === undefined || fp.priceCOP < existing) {
                    formatMap.set(fp.format, fp.priceCOP);
                }
            }
        }

        // Check which formats have court availability
        const allFormats = getAvailableFormats(courts, combos);

        return Array.from(formatMap.entries()).map(([format, priceCOP]) => ({
            format,
            priceCOP,
            available: allFormats.includes(format),
        }));
    }, [schedule, courts, combos]);

    // Auto-select first available format. Respeta el prefill de `?format=` si es un
    // formato realmente disponible; si no lo es (o no hay prefill), cae al primero disponible.
    useEffect(() => {
        const fmts = formatOptions();
        if (fmts.length === 0) return; // schedule aún cargando: no tocar el prefill
        const preselectValid = selectedFormat && fmts.some((f) => f.format === selectedFormat && f.available);
        if (preselectValid) return;
        const firstAvailable = fmts.find((f) => f.available);
        if (firstAvailable) {
            setSelectedFormat(firstAvailable.format);
            logBookingFormatSelected(venueId, firstAvailable.format);
        }
    }, [formatOptions, selectedFormat, venueId]);

    // Derived: available time slots for selected format
    const timeSlots = useCallback((): SlotItem[] => {
        if (!schedule || !selectedFormat) return [];

        const nowISO = new Date().toISOString();
        const slots = generateTimeSlots(schedule, selectedDate, nowISO);

        // Anticipación mínima (fin de semana, configurable por sede).
        // Ref: docs/WEEKEND_LEAD_TIME_SDD.md
        const nowMs = Date.now();
        const weekendLeadHours = venue?.weekendMinLeadHours ?? 0;

        // Get occupied court IDs for each time slot
        return slots.flatMap((schedSlot) => {
            const formatPricing = schedSlot.formats.find((f: FormatPricing) => f.format === selectedFormat);
            if (!formatPricing) return [];

            // Check if courts are available for this format at this time
            const occupiedCourtIds = existingBookings
                .filter((b) => b.startTime < schedSlot.endTime && b.endTime > schedSlot.startTime)
                .flatMap((b) => b.courtIds);

            const blockedCourtIds = blockedSlots
                .filter((b) => b.startTime < schedSlot.endTime && b.endTime > schedSlot.startTime)
                .flatMap((b) => b.courtIds);

            const availableFormats = getAvailableFormatsForSlot(
                courts, combos, occupiedCourtIds, blockedCourtIds
            );

            const formatAvailable = availableFormats.includes(selectedFormat);
            const tooSoon = isSlotBeforeWeekendLead(selectedDate, schedSlot.startTime, nowMs, weekendLeadHours);

            return [{
                startTime: schedSlot.startTime,
                endTime: schedSlot.endTime,
                priceCOP: formatPricing.priceCOP,
                available: formatAvailable && !tooSoon,
                // Solo marca "Muy pronto" si el slot estaría libre de no ser por la anticipación;
                // si está ocupado se mantiene el "Ocupado" por defecto.
                unavailableReason: formatAvailable && tooSoon ? "Muy pronto" : undefined,
            }];
        });
    }, [schedule, selectedFormat, selectedDate, existingBookings, blockedSlots, courts, combos, venue?.weekendMinLeadHours]);

    // Analytics de empty states de disponibilidad (una vez por fecha+razón).
    const availabilityLoggedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (loading || !venue || scheduleLoading || !selectedFormat) return;
        const closed = !schedule || !schedule.enabled || schedule.slots.length === 0;
        const reason: "closed" | "no_slots_free" | null = closed
            ? "closed"
            : (() => {
                const s = timeSlots();
                return s.length > 0 && !s.some((x) => x.available) ? "no_slots_free" : null;
            })();
        if (!reason) return;
        const key = `${selectedDate}:${reason}`;
        if (availabilityLoggedRef.current.has(key)) return;
        availabilityLoggedRef.current.add(key);
        logBookingNoAvailabilityShown(venueId, selectedDate, reason);
    }, [loading, venue, scheduleLoading, selectedFormat, schedule, selectedDate, venueId, timeSlots]);

    // Slot selection handlers
    const handleSlotSelect = (startTime: string, endTime: string) => {
        if (selectedStart === startTime && selectedEnd === endTime) {
            // Deselect
            setSelectedStart(null);
            setSelectedEnd(null);
        } else {
            setSelectedStart(startTime);
            setSelectedEnd(endTime);
            if (selectedFormat) {
                logBookingSlotSelected(venueId, selectedFormat, selectedDate, startTime);
            }
        }
    };

    const handleSlotExtend = (endTime: string) => {
        setSelectedEnd(endTime);
    };

    // Get price for selection
    const getSelectionBreakdown = (): { subtotalCOP: number; discountCOP: number; finalCOP: number } => {
        if (!selectedStart || !selectedEnd || !selectedFormat) {
            return { subtotalCOP: 0, discountCOP: 0, finalCOP: 0 };
        }
        const slots = timeSlots();
        const selectedSlots = slots.filter(
            (s) => s.startTime >= selectedStart && s.endTime <= selectedEnd && s.available
        );
        const subtotalCOP = selectedSlots.reduce((acc, s) => acc + s.priceCOP, 0);
        if (subtotalCOP === 0) return { subtotalCOP, discountCOP: 0, finalCOP: 0 };

        const vf = venue?.formats?.find((f) => f.id === selectedFormat);
        const [sH, sM] = selectedStart.split(":").map(Number);
        const [eH, eM] = selectedEnd.split(":").map(Number);
        const durationMinutes = (eH * 60 + eM) - (sH * 60 + sM);
        const { finalCOP, discountCOP } = applyDurationTier(subtotalCOP, durationMinutes, vf?.durationTiers);
        return { subtotalCOP, discountCOP, finalCOP };
    };

    // Confirm booking / enviar solicitud
    const handleConfirmBooking = async (args: { proofURL?: string; policiesAccepted: boolean }) => {
        if (!selectedStart || !selectedEnd || !selectedFormat || !venueId) return;

        setBookingLoading(true);
        try {
            const result = await createBooking({
                venueId,
                format: selectedFormat,
                date: selectedDate,
                startTime: selectedStart,
                endTime: selectedEnd,
                proofURL: args.proofURL,
                policiesAccepted: args.policiesAccepted,
            });

            toast.success(
                result.status === "pending_approval"
                    ? "Solicitud enviada · en revisión"
                    : "Reserva confirmada",
            );
            setConfirmSheetOpen(false);

            // Analytics — desglose actual del cliente (el server puede haber recomputado).
            const breakdown = getSelectionBreakdown();
            const vf = venue?.formats?.find((f) => f.id === selectedFormat);
            const [sH, sM] = selectedStart.split(":").map(Number);
            const [eH, eM] = selectedEnd.split(":").map(Number);
            const tier = vf?.durationTiers
                ? vf.durationTiers
                    .filter((t) => ((eH * 60 + eM) - (sH * 60 + sM)) >= t.minMinutes)
                    .reduce<typeof vf.durationTiers[number] | null>(
                        (best, t) => (best === null || t.minMinutes > best.minMinutes ? t : best),
                        null,
                    )
                : null;
            logBookingConfirmed({
                venueId,
                bookingId: result.bookingId,
                format: selectedFormat,
                date: selectedDate,
                startTime: selectedStart,
                amountCOP: breakdown.finalCOP,
                paymentMethod: venue?.depositRequired ? "wallet" : "on_site",
                tierApplied: !!tier,
                tierType: tier ? (tier.percentOff !== undefined ? "percent" : "flat") : undefined,
                tierMinMinutes: tier?.minMinutes,
                tierDiscountCOP: breakdown.discountCOP > 0 ? breakdown.discountCOP : undefined,
            });
            router.push(`/bookings/${result.bookingId}`);
        } catch (err) {
            handleError(err, "Error al crear la reserva");
        } finally {
            setBookingLoading(false);
        }
    };

    // Error de carga sin datos: no dejar el skeleton colgado para siempre.
    if (loadError && !venue) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <button
                    onClick={() => router.back()}
                    className="absolute top-4 left-4 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm z-10"
                    aria-label="Volver"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-700" />
                </button>
                <div className="flex-1 flex items-center justify-center px-6 pb-24">
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center max-w-sm w-full">
                        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                        </div>
                        <p className="font-bold text-slate-800">No pudimos cargar la sede</p>
                        <p className="text-sm text-slate-500 mt-1 mb-5">Revisá tu conexión e intentá de nuevo.</p>
                        <button
                            onClick={loadVenue}
                            className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Skeleton
    if (loading || !venue) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24 animate-pulse">
                <div className="max-w-md mx-auto">
                    <div className="h-48 bg-slate-200" />
                    <div className="px-4 mt-5 space-y-4">
                        <div className="h-6 bg-slate-200 rounded w-40" />
                        <div className="h-4 bg-slate-100 rounded w-56" />
                        <div className="flex gap-3">
                            {[1, 2, 3].map((i) => <div key={i} className="h-16 w-24 bg-slate-200 rounded-2xl" />)}
                        </div>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 w-14 bg-slate-100 rounded-xl" />)}
                        </div>
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const formats = formatOptions();
    const slots = timeSlots();
    const { subtotalCOP, discountCOP, finalCOP } = getSelectionBreakdown();
    const totalPrice = finalCOP;

    // Derivados de detalle de sede
    const images = galleryImages(venue);
    // Cobertura a nivel de sede: alimenta el chip destacado "Cancha techada" en amenidades.
    const { anyCovered } = venueCoverage(courts);
    const effectivePolicies = getEffectiveBookingPolicies(venue);
    const bookingWindow = clampBookingWindowDays(venue.bookingWindowDays);
    const scheduleClosed = !!schedule && (!schedule.enabled || schedule.slots.length === 0);
    const noFreeSlots = slots.length > 0 && !slots.some((s) => s.available);

    const galleryFallback = (
        <div className="h-full bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center">
            {venue.icon && <span className="text-6xl opacity-90" aria-hidden>{venue.icon}</span>}
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header: galería de fotos + overlays */}
                <div className="relative">
                    <VenueGallery
                        venueId={venueId}
                        images={images}
                        venueName={venue.name}
                        fallback={galleryFallback}
                    />
                    {/* Scrim superior para legibilidad de los botones sobre fotos claras */}
                    <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />
                    <button
                        onClick={() => router.back()}
                        className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm z-10"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    {profile && isSuperAdmin(profile) && (
                        <button
                            onClick={() => router.push(`/venues/admin/${venueId}`)}
                            className="absolute top-4 right-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors z-10"
                        >
                            <Settings className="w-5 h-5 text-slate-700" />
                        </button>
                    )}
                </div>

                <div className="px-4 pt-4">
                    {/* Venue info: nombre + contacto/ubicación accionable */}
                    <h1 className="text-xl font-bold text-slate-800 mb-2.5">{venue.name}</h1>
                    <VenueContactActions venue={venue} />

                    {/* Descripción de la sede */}
                    {venue.description && (
                        <p className="mt-3 text-sm text-slate-500 leading-snug">{venue.description}</p>
                    )}

                    {/* Amenidades (servicios) + chip destacado de techada */}
                    <div className="mt-4">
                        <VenueAmenities amenities={venue.amenities} anyCovered={anyCovered} />
                    </div>

                    {/* Preview de políticas antes de reservar */}
                    {effectivePolicies.length > 0 && (
                        <div className="mt-4">
                            <BookingPoliciesPreview
                                policies={effectivePolicies}
                                onExpand={(count) => logVenuePoliciesExpanded(venueId, count)}
                            />
                        </div>
                    )}

                    {/* TAP 1: Format selection */}
                    <div className="mt-5">
                        <h2 className="text-sm font-semibold text-slate-600 mb-2">Formato</h2>
                        <VenueFormatPicker
                            formats={formats}
                            selected={selectedFormat}
                            venueFormats={venue.formats}
                            courts={courts}
                            combos={combos}
                            onSelect={(f) => {
                                setSelectedFormat(f);
                                setSelectedStart(null);
                                setSelectedEnd(null);
                                logBookingFormatSelected(venueId, f);
                            }}
                        />
                    </div>

                    {/* Date picker */}
                    <div className="mt-5">
                        <h2 className="text-sm font-semibold text-slate-600 mb-2">Fecha</h2>
                        <DateCarousel
                            selectedDate={selectedDate}
                            daysAhead={bookingWindow}
                            onSelect={(d) => {
                                setSelectedDate(d);
                                setSelectedStart(null);
                                setSelectedEnd(null);
                            }}
                        />
                    </div>

                    {/* TAP 2: Slot selection */}
                    {selectedFormat && (
                        <div className="mt-5">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-sm font-semibold text-slate-600">Horario</h2>
                                {!scheduleLoading && !scheduleClosed && (
                                    <p className="text-[10px] text-slate-400">Toca para reservar · varias horas seguidas se suman</p>
                                )}
                            </div>

                            {scheduleLoading ? (
                                <SlotListSkeleton />
                            ) : scheduleClosed ? (
                                <div className="text-center py-10 text-slate-400">
                                    <CalendarOff className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                    <p className="text-base font-medium">La sede no abre este día</p>
                                    <p className="text-sm mt-1">Prueba con otra fecha</p>
                                </div>
                            ) : (
                                <>
                                    {noFreeSlots && (
                                        <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                                            <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                            <p className="text-sm text-amber-800">
                                                No quedan horarios libres este día. Prueba con otra fecha.
                                            </p>
                                        </div>
                                    )}
                                    <SlotList
                                        slots={slots}
                                        selectedStart={selectedStart}
                                        selectedEnd={selectedEnd}
                                        onSelect={handleSlotSelect}
                                        onExtend={handleSlotExtend}
                                        dateKey={`${selectedDate}-${selectedFormat}`}
                                    />
                                </>
                            )}
                        </div>
                    )}

                </div>

                {/* TAP 3: Sticky confirm button + resumen de selección */}
                {selectedStart && selectedEnd && (
                    <div className="sticky bottom-20 md:bottom-4 left-0 right-0 px-4 pt-3 pb-2 z-30 pointer-events-none">
                        <SelectionSummaryBar date={selectedDate} startTime={selectedStart} endTime={selectedEnd} />
                        <button
                            onClick={() => setConfirmSheetOpen(true)}
                            className="pointer-events-auto w-full py-3.5 rounded-xl bg-[#1f7a4f] text-white text-base font-bold shadow-lg shadow-[#1f7a4f]/30 hover:bg-[#145c3a] active:scale-[0.98] transition-all"
                        >
                            Confirmar · {new Intl.NumberFormat("es-CO", {
                                style: "currency",
                                currency: "COP",
                                minimumFractionDigits: 0,
                            }).format(totalPrice / 100)}
                        </button>
                    </div>
                )}

                {/* Confirm bottom sheet */}
                <BookingConfirmSheet
                    open={confirmSheetOpen}
                    onClose={() => setConfirmSheetOpen(false)}
                    onConfirm={handleConfirmBooking}
                    venueId={venueId}
                    uid={user?.uid || ""}
                    venueName={venue.name}
                    venueAddress={venue.address}
                    format={selectedFormat!}
                    venueFormats={venue.formats}
                    subtotalCOP={subtotalCOP}
                    discountCOP={discountCOP}
                    date={selectedDate}
                    startTime={selectedStart || ""}
                    endTime={selectedEnd || ""}
                    totalPriceCOP={totalPrice}
                    depositRequired={venue.depositRequired}
                    depositPercent={venue.depositPercent}
                    paymentMethods={venue.paymentMethods}
                    policies={getEffectiveBookingPolicies(venue)}
                />
            </div>
        </div>
    );
}

export default function VenueDetailPage() {
    return (
        <AuthGuard>
            <VenueDetailContent />
        </AuthGuard>
    );
}
