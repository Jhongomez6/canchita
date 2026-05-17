"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAvailableFormats, getDayOfWeek, generateTimeSlots, tierLabelFromCount, formatCourtList } from "@/lib/domain/venue";
import { getAvailableFormatsForSlot, allocateCourts } from "@/lib/domain/court-allocation";
import { getVenueCombos, getVenueSchedule, subscribeToBlockedSlots } from "@/lib/venues";
import { subscribeToBookingsForDate } from "@/lib/bookings";
import { handleError } from "@/lib/utils/error";
import FormatSelector from "./FormatSelector";
import DateCarousel from "./DateCarousel";
import SlotList from "./SlotList";
import type { Court, CourtCombo, DaySchedule, FormatPricing, VenueFormat } from "@/lib/domain/venue";
import type { BlockedSlot } from "@/lib/domain/venue";
import type { Booking } from "@/lib/domain/booking";
import type { SlotItem, OccupantLabel } from "./SlotList";

interface AdminSlotPickerProps {
    venueId: string;
    courts: Court[];
    venueFormats?: VenueFormat[];
    onHourTapped: (data: {
        date: string;
        startTime: string;
        endTime: string;
        courtIds: string[];
        format: string;
        bookings: Booking[];
        blocks: BlockedSlot[];
        /** Ids de canchas que pueden usarse para este formato (base + combos). */
        relevantCourtIds: string[];
        /** Ids de canchas relevantes que están ocupadas en este horario (por cualquier reserva/block). */
        unavailableRelevantCourtIds: string[];
    }) => void;
}

function todayLocalISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function twoMonthsBackISO(): string {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
}

function fourMonthsWindowDays(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 0); // último día del mes +2
    return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}


export default function AdminSlotPicker({ venueId, courts, venueFormats, onHourTapped }: AdminSlotPickerProps) {
    const [combos, setCombos] = useState<CourtCombo[]>([]);
    const [schedule, setSchedule] = useState<DaySchedule | null>(null);
    const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
    const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);

    const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
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
        const formatMap = new Map<string, number>();
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
            // Auto-select default format on mount. setState en effect es intencional aquí
            // y solo corre una vez (cuando selectedFormat es null y hay formato disponible).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedFormat(firstAvailable.format);
        }
    }, [formatOptions, selectedFormat]);

    // Conjunto de courtIds que pueden usarse para el formato seleccionado
    // (canchas con baseFormat coincidente + canchas que participan en combos que producen el formato).
    // Sirve para filtrar reservas manuales — un block que no toca ninguna de estas canchas
    // es irrelevante para la vista de este formato.
    const relevantCourtIds = useMemo(() => {
        if (!selectedFormat) return new Set<string>();
        const ids = new Set<string>();
        for (const c of courts) {
            if (c.baseFormat === selectedFormat) ids.add(c.id);
        }
        for (const combo of combos) {
            if (combo.resultingFormat === selectedFormat) {
                for (const id of combo.courtIds) ids.add(id);
            }
        }
        return ids;
    }, [courts, combos, selectedFormat]);

    const blockTouchesFormat = useCallback(
        (b: BlockedSlot) => b.courtIds.some((id) => relevantCourtIds.has(id)),
        [relevantCourtIds],
    );

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
                for (const b of overlappingBookings.filter((b) => b.format === selectedFormat)) {
                    const who = b.bookedByName || "Reservado";
                    const where = courtListFor(b.courtIds);
                    activeEntries.push({ who, detail: where });
                }
                for (const b of activeBlocks.filter(blockTouchesFormat)) {
                    activeEntries.push(blockLabel(b));
                }

                const cancelledEntries = cancelledBlocks.filter(blockTouchesFormat).map(blockLabel);

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
    }, [schedule, selectedFormat, selectedDate, existingBookings, blockedSlots, courts, combos, blockTouchesFormat]);

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

        // Canchas relevantes ocupadas considerando TODAS las reservas (cross-formato cuenta:
        // una cancha de combo ocupada por fútbol no puede usarse para volley).
        const occupiedSet = new Set<string>([...occupiedCourtIds, ...blockedCourtIds]);
        const relevantIds = [...relevantCourtIds];
        const unavailableRelevantCourtIds = relevantIds.filter((id) => occupiedSet.has(id));

        onHourTapped({
            date: selectedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            courtIds: allocation?.courtIds ?? [],
            format: selectedFormat,
            bookings: overlappingBookings.filter((b) => b.format === selectedFormat),
            blocks: overlappingBlocks.filter(blockTouchesFormat),
            relevantCourtIds: relevantIds,
            unavailableRelevantCourtIds,
        });
    };

    const formats = formatOptions();
    const slots = timeSlots();

    return (
        <div className="space-y-4">
            <FormatSelector
                formats={formats}
                selected={selectedFormat}
                venueFormats={venueFormats}
                onSelect={(f) => setSelectedFormat(f)}
                hidePrice
                compact
            />

            <DateCarousel
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                startDate={twoMonthsBackISO()}
                daysAhead={fourMonthsWindowDays()}
            />

            {selectedFormat && (
                slots.length === 0 ? (
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
                )
            )}
        </div>
    );
}
