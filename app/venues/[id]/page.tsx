"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Settings } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { hasBookingAccess, isSuperAdmin } from "@/lib/domain/user";
import { getAvailableFormats, getDayOfWeek, generateTimeSlots } from "@/lib/domain/venue";
import { getAvailableFormatsForSlot } from "@/lib/domain/court-allocation";
import { getVenue, getVenueCourts, getVenueCombos, getVenueSchedule, subscribeToBlockedSlots } from "@/lib/venues";
import { subscribeToBookingsForDate, createBooking } from "@/lib/bookings";
import { getWallet } from "@/lib/wallet";
import { handleError } from "@/lib/utils/error";
import { logVenueViewed, logBookingFormatSelected, logBookingSlotSelected, logBookingConfirmed } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import FormatSelector from "@/components/booking/FormatSelector";
import DateCarousel from "@/components/booking/DateCarousel";
import SlotList from "@/components/booking/SlotList";
import BookingConfirmSheet from "@/components/booking/BookingConfirmSheet";
import type { Venue, Court, CourtCombo, DaySchedule, CourtFormat, FormatPricing, BlockedSlot } from "@/lib/domain/venue";
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
    const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
    const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [loading, setLoading] = useState(true);

    // Selection state
    const [selectedFormat, setSelectedFormat] = useState<CourtFormat | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const [selectedStart, setSelectedStart] = useState<string | null>(null);
    const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
    const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
    const [, setBookingLoading] = useState(false);

    // Load venue data
    useEffect(() => {
        if (!profile || !venueId) return;

        if (!hasBookingAccess(profile)) {
            router.replace("/");
            return;
        }

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
            .catch((err) => handleError(err, "Error al cargar la sede"))
            .finally(() => setLoading(false));
    }, [profile, venueId, router]);

    // Load wallet
    useEffect(() => {
        if (!user) return;
        getWallet(user.uid).then(setWallet).catch(() => {});
    }, [user]);

    // Load schedule when date changes (one-shot)
    useEffect(() => {
        if (!venueId || !selectedDate) return;
        const dayOfWeek = getDayOfWeek(selectedDate);
        getVenueSchedule(venueId, dayOfWeek)
            .then(setSchedule)
            .catch((err) => handleError(err, "Error al cargar horarios"));
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
        const formatMap = new Map<CourtFormat, number>();
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

    // Auto-select first available format
    useEffect(() => {
        const fmts = formatOptions();
        const firstAvailable = fmts.find((f) => f.available);
        if (firstAvailable && !selectedFormat) {
            setSelectedFormat(firstAvailable.format);
            logBookingFormatSelected(venueId, firstAvailable.format);
        }
    }, [formatOptions, selectedFormat, venueId]);

    // Derived: available time slots for selected format
    const timeSlots = useCallback((): SlotItem[] => {
        if (!schedule || !selectedFormat) return [];

        const nowISO = new Date().toISOString();
        const slots = generateTimeSlots(schedule, selectedDate, nowISO);

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

            const isAvailable = availableFormats.includes(selectedFormat);

            return [{
                startTime: schedSlot.startTime,
                endTime: schedSlot.endTime,
                priceCOP: formatPricing.priceCOP,
                available: isAvailable,
            }];
        });
    }, [schedule, selectedFormat, selectedDate, existingBookings, blockedSlots, courts, combos]);

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
    const getSelectionPrice = (): number => {
        if (!selectedStart || !selectedEnd || !selectedFormat) return 0;
        const slots = timeSlots();
        const selectedSlots = slots.filter(
            (s) => s.startTime >= selectedStart && s.endTime <= selectedEnd && s.available
        );
        return selectedSlots.reduce((acc, s) => acc + s.priceCOP, 0);
    };

    // Confirm booking
    const handleConfirmBooking = async () => {
        if (!selectedStart || !selectedEnd || !selectedFormat || !venueId) return;

        setBookingLoading(true);
        try {
            const result = await createBooking({
                venueId,
                format: selectedFormat,
                date: selectedDate,
                startTime: selectedStart,
                endTime: selectedEnd,
            });

            toast.success("Reserva confirmada");
            setConfirmSheetOpen(false);
            logBookingConfirmed({
                venueId,
                bookingId: result.bookingId,
                format: selectedFormat,
                date: selectedDate,
                startTime: selectedStart,
                amountCOP: totalPrice,
                paymentMethod: venue?.depositRequired ? "wallet" : "on_site",
            });
            router.push(`/bookings/${result.bookingId}`);
        } catch (err) {
            handleError(err, "Error al crear la reserva");
        } finally {
            setBookingLoading(false);
        }
    };

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
    const totalPrice = getSelectionPrice();

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header image */}
                <div className="relative">
                    {venue.imageURL ? (
                        <div className="relative h-48 overflow-hidden">
                            <Image unoptimized src={venue.imageURL} alt={venue.name} fill className="object-cover" />
                        </div>
                    ) : (
                        <div className="h-48 bg-gradient-to-br from-[#1f7a4f] to-[#145c3a]" />
                    )}
                    <button
                        onClick={() => router.back()}
                        className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    {profile && isSuperAdmin(profile) && (
                        <button
                            onClick={() => router.push(`/venues/admin/${venueId}`)}
                            className="absolute top-4 right-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                        >
                            <Settings className="w-5 h-5 text-slate-700" />
                        </button>
                    )}
                </div>

                <div className="px-4 pt-4">
                    {/* Venue info */}
                    <h1 className="text-xl font-bold text-slate-800">{venue.name}</h1>
                    <div className="flex items-center gap-1.5 text-slate-400 mt-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-xs">{venue.address}</span>
                    </div>

                    {/* TAP 1: Format selection */}
                    <div className="mt-5">
                        <h2 className="text-sm font-semibold text-slate-600 mb-2">Formato</h2>
                        <FormatSelector
                            formats={formats}
                            selected={selectedFormat}
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
                                <p className="text-[10px] text-slate-400">Toca para reservar · varias horas seguidas se suman</p>
                            </div>
                            <SlotList
                                slots={slots}
                                selectedStart={selectedStart}
                                selectedEnd={selectedEnd}
                                onSelect={handleSlotSelect}
                                onExtend={handleSlotExtend}
                                dateKey={`${selectedDate}-${selectedFormat}`}
                            />
                        </div>
                    )}

                </div>

                {/* TAP 3: Sticky confirm button */}
                {selectedStart && selectedEnd && (
                    <div className="sticky bottom-20 md:bottom-4 left-0 right-0 px-4 pt-3 pb-2 z-30 pointer-events-none">
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
                    venueName={venue.name}
                    venueAddress={venue.address}
                    format={selectedFormat!}
                    date={selectedDate}
                    startTime={selectedStart || ""}
                    endTime={selectedEnd || ""}
                    totalPriceCOP={totalPrice}
                    depositRequired={venue.depositRequired}
                    depositPercent={venue.depositPercent}
                    walletBalance={wallet?.balanceCOP ?? null}
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
