"use client";

import { useEffect, useState, useCallback } from "react";
import { getAvailableFormats, getDayOfWeek, generateTimeSlots, formatLabel, tierLabelFromCount, formatCourtList } from "@/lib/domain/venue";
import { getAvailableFormatsForSlot, allocateCourts } from "@/lib/domain/court-allocation";
import { getVenueCombos, getVenueSchedule, subscribeToBlockedSlots } from "@/lib/venues";
import { subscribeToBookingsForDate } from "@/lib/bookings";
import { handleError } from "@/lib/utils/error";
import FormatSelector from "./FormatSelector";
import DateCarousel from "./DateCarousel";
import SlotList from "./SlotList";
import type { Court, CourtCombo, DaySchedule, CourtFormat, FormatPricing } from "@/lib/domain/venue";
import type { BlockedSlot } from "@/lib/domain/venue";
import type { Booking } from "@/lib/domain/booking";
import type { SlotItem, OccupantLabel } from "./SlotList";

interface AdminSlotPickerProps {
    venueId: string;
    courts: Court[];
    onHourTapped: (data: {
        date: string;
        startTime: string;
        endTime: string;
        courtIds: string[];
        format: CourtFormat;
        bookings: Booking[];
        blocks: BlockedSlot[];
    }) => void;
}

function todayLocalISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


export default function AdminSlotPicker({ venueId, courts, onHourTapped }: AdminSlotPickerProps) {
    const [combos, setCombos] = useState<CourtCombo[]>([]);
    const [schedule, setSchedule] = useState<DaySchedule | null>(null);
    const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
    const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);

    const [selectedFormat, setSelectedFormat] = useState<CourtFormat | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(todayLocalISO);

    useEffect(() => {
        if (!venueId) return;
        getVenueCombos(venueId).then(setCombos).catch(() => {});
    }, [venueId]);

    useEffect(() => {
        if (!venueId || !selectedDate) return;
        const dayOfWeek = getDayOfWeek(selectedDate);
        getVenueSchedule(venueId, dayOfWeek)
            .then(setSchedule)
            .catch((err) => handleError(err, "Error al cargar horarios"));
    }, [venueId, selectedDate]);

    useEffect(() => {
        if (!venueId || !selectedDate) return;
        const unsubBookings = subscribeToBookingsForDate(venueId, selectedDate, setExistingBookings);
        const unsubBlocked = subscribeToBlockedSlots(venueId, selectedDate, setBlockedSlots, true);
        return () => {
            unsubBookings();
            unsubBlocked();
        };
    }, [venueId, selectedDate]);

    const formatOptions = useCallback(() => {
        if (!schedule || !schedule.enabled) return [];
        const formatMap = new Map<CourtFormat, number>();
        for (const slot of schedule.slots) {
            for (const fp of slot.formats) {
                const existing = formatMap.get(fp.format);
                if (existing === undefined || fp.priceCOP < existing) {
                    formatMap.set(fp.format, fp.priceCOP);
                }
            }
        }
        const allFormats = getAvailableFormats(courts, combos);
        return Array.from(formatMap.entries()).map(([format, priceCOP]) => ({
            format,
            priceCOP,
            available: allFormats.includes(format),
        }));
    }, [schedule, courts, combos]);

    useEffect(() => {
        const fmts = formatOptions();
        const firstAvailable = fmts.find((f) => f.available);
        if (firstAvailable && !selectedFormat) {
            setSelectedFormat(firstAvailable.format);
        }
    }, [formatOptions, selectedFormat]);

    const timeSlots = useCallback((): SlotItem[] => {
        if (!schedule || !selectedFormat) return [];
        // Admin ve todos los slots (incluso los que ya pasaron) para gestionar reservas
        // retroactivas y cambiar status de slots ya jugados.
        const slots = generateTimeSlots(schedule, selectedDate);
        return slots.flatMap((schedSlot) => {
            const formatPricing = schedSlot.formats.find((f: FormatPricing) => f.format === selectedFormat);
            if (!formatPricing) return [];

            const overlappingBookings = existingBookings.filter(
                (b) => b.startTime < schedSlot.endTime && b.endTime > schedSlot.startTime,
            );
            const overlappingBlocks = blockedSlots.filter(
                (b) => b.startTime < schedSlot.endTime && b.endTime > schedSlot.startTime,
            );
            const activeBlocks = overlappingBlocks.filter((b) => b.status !== "cancelled");
            const cancelledBlocks = overlappingBlocks.filter((b) => b.status === "cancelled");

            const occupiedCourtIds = overlappingBookings.flatMap((b) => b.courtIds);
            // Solo los bloques activos ocupan canchas; los cancelados no bloquean disponibilidad.
            const blockedCourtIds = activeBlocks.flatMap((b) => b.courtIds);

            const availableFormats = getAvailableFormatsForSlot(
                courts, combos, occupiedCourtIds, blockedCourtIds,
            );
            const isAvailable = availableFormats.includes(selectedFormat);

            let occupantLabels: OccupantLabel[] | undefined;
            let cancelledLabels: OccupantLabel[] | undefined;

            if (overlappingBookings.length > 0 || overlappingBlocks.length > 0) {
                const courtNameById = new Map(courts.map((c) => [c.id, c.name]));
                const courtListFor = (ids: string[]) =>
                    formatCourtList(ids.map((id) => courtNameById.get(id) ?? id));

                const blockLabel = (b: typeof overlappingBlocks[0]): OccupantLabel => {
                    let who = b.clientName || b.reason || "Reserva manual";
                    if (b.clientName && b.clientPhone) who = `${b.clientName} · ${b.clientPhone}`;
                    else if (!b.clientName && b.clientPhone) who = b.clientPhone;
                    const tier = tierLabelFromCount(b.courtIds.length);
                    const where = courtListFor(b.courtIds);
                    return { who, detail: where ? `${tier} · ${where}` : tier };
                };

                const activeEntries: OccupantLabel[] = [];
                for (const b of overlappingBookings) {
                    const who = b.bookedByName || "Reservado";
                    const tier = formatLabel(b.format);
                    const where = courtListFor(b.courtIds);
                    activeEntries.push({ who, detail: where ? `${tier} · ${where}` : tier });
                }
                for (const b of activeBlocks) {
                    activeEntries.push(blockLabel(b));
                }

                const cancelledEntries = cancelledBlocks.map(blockLabel);

                if (activeEntries.length > 0) occupantLabels = activeEntries;
                if (cancelledEntries.length > 0) cancelledLabels = cancelledEntries;
            }

            return [{
                startTime: schedSlot.startTime,
                endTime: schedSlot.endTime,
                priceCOP: formatPricing.priceCOP,
                available: isAvailable,
                occupantLabels,
                cancelledLabels,
            }];
        });
    }, [schedule, selectedFormat, selectedDate, existingBookings, blockedSlots, courts, combos]);

    const handleSlotTap = (slot: SlotItem) => {
        if (!selectedFormat) return;
        const overlappingBookings = existingBookings.filter(
            (b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
        );
        const overlappingBlocks = blockedSlots.filter(
            (b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
        );
        const activeBlocks = overlappingBlocks.filter((b) => b.status !== "cancelled");
        const occupiedCourtIds = overlappingBookings.flatMap((b) => b.courtIds);
        const blockedCourtIds = activeBlocks.flatMap((b) => b.courtIds);

        const allocation = allocateCourts({
            requestedFormat: selectedFormat,
            courts,
            combos,
            occupiedCourtIds,
            blockedCourtIds,
        });

        onHourTapped({
            date: selectedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            courtIds: allocation?.courtIds ?? [],
            format: selectedFormat,
            bookings: overlappingBookings,
            blocks: overlappingBlocks,
        });
    };

    const formats = formatOptions();
    const slots = timeSlots();

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-sm font-semibold text-slate-600 mb-2">Formato</h2>
                <FormatSelector
                    formats={formats}
                    selected={selectedFormat}
                    onSelect={(f) => setSelectedFormat(f)}
                    hidePrice
                />
            </div>

            <div>
                <h2 className="text-sm font-semibold text-slate-600 mb-2">Fecha</h2>
                <DateCarousel
                    selectedDate={selectedDate}
                    onSelect={setSelectedDate}
                />
            </div>

            {selectedFormat && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-slate-600">Horario</h2>
                        <p className="text-[10px] text-slate-400">Toca un horario para ver detalle</p>
                    </div>
                    {slots.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">
                            Sin horarios configurados para este día
                        </p>
                    ) : (
                        <SlotList
                            slots={slots}
                            selectedStart={null}
                            selectedEnd={null}
                            onSelect={() => {}}
                            onExtend={() => {}}
                            dateKey={`${selectedDate}-${selectedFormat}`}
                            hidePrice
                            onSlotTap={handleSlotTap}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
