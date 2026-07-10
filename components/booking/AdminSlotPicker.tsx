"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAvailableFormats, getDayOfWeek, generateTimeSlots, tierLabelFromCount, formatCourtList, formatLabel, sportOfFormat } from "@/lib/domain/venue";
import { getAvailableFormatsForSlot, allocateCourts } from "@/lib/domain/court-allocation";
import { getVenueCombos, getVenueSchedule, subscribeToBlockedSlots } from "@/lib/venues";
import { subscribeToAllBookingsForDate, SLOT_BLOCKING_BOOKING_STATUSES } from "@/lib/bookings";
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
        /** Ids de canchas del mismo DEPORTE que el formato seleccionado. Define qué reservas
         *  ver en el detalle de la hora (RN-10). La suscripción realtime del padre las filtra. */
        sameSportCourtIds: string[];
    }) => void;
    /** Fecha mínima navegable (YYYY-MM-DD). Acota el inicio del carrusel de días. Sin valor ⇒ 2 meses atrás. */
    minDate?: string;
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

// Días entre `startISO` (inclusive) y el último día de +2 meses desde hoy, de modo
// que la ventana futura sea la misma sin importar dónde empiece el carrusel.
function windowDaysFrom(startISO: string): number {
    const now = new Date();
    const start = new Date(`${startISO}T12:00:00`);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 0); // último día del mes +2
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}


export default function AdminSlotPicker({ venueId, courts, venueFormats, onHourTapped, minDate }: AdminSlotPickerProps) {
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
        // Trae TODAS las reservas del día (incluyendo no_show, paid, cancelled).
        // El filtrado por status para disponibilidad se hace inline más abajo.
        const unsubBookings = subscribeToAllBookingsForDate(venueId, selectedDate, setExistingBookings);
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

    // RN-10: alcance por DEPORTE (no por formato). El detalle/lista de una hora muestra
    // todas las reservas —online o manuales, activas o canceladas— del mismo deporte que
    // el formato seleccionado, aunque sean de otro formato (ej. futbol-5 se ve en futbol-7).
    // Reservas de otros deportes (vóley, etc.) quedan fuera: no comparten canchas ni
    // interesan a la gestión de este deporte.
    // Nota: `relevantCourtIds` (arriba) sigue acotado al formato EXACTO — se usa solo para
    // la disponibilidad del CTA "Crear reserva manual", no para el display.
    const sameSportCourtIds = useMemo(() => {
        if (!selectedFormat) return new Set<string>();
        const selectedSport = sportOfFormat(selectedFormat, venueFormats);
        // Modo legacy / deporte no resoluble ⇒ sede mono-deporte: todas las canchas cuentan.
        if (selectedSport === null) return new Set(courts.map((c) => c.id));
        const ids = new Set<string>();
        for (const c of courts) {
            if (sportOfFormat(c.baseFormat, venueFormats) === selectedSport) ids.add(c.id);
        }
        return ids;
    }, [courts, venueFormats, selectedFormat]);

    const touchesSelectedSport = useCallback(
        (courtIds: string[]) => courtIds.some((id) => sameSportCourtIds.has(id)),
        [sameSportCourtIds],
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

            // Solo las reservas en estados que bloquean slot ocupan canchas.
            // no_show/paid/cancelled/expired no impiden re-reservar la cancha (aunque las
            // mostramos en la card para que el admin vea el histórico del slot).
            const occupiedCourtIds = overlappingBookings
                .filter((b) => (SLOT_BLOCKING_BOOKING_STATUSES as readonly string[]).includes(b.status))
                .flatMap((b) => b.courtIds);
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
                    return { who, detail: where ? `${tier} · ${where}` : tier, isBirthday: !!b.isBirthday };
                };

                // Construye la label de una reserva online (jugador).
                const bookingLabel = (b: typeof overlappingBookings[0]): OccupantLabel => {
                    let who = b.bookedByName || "Reservado";
                    if (b.bookedByName && b.bookedByPhone) {
                        who = `${b.bookedByName} · ${b.bookedByPhone}`;
                    }
                    const tier = b.formatLabel || formatLabel(b.format, venueFormats);
                    const where = courtListFor(b.courtIds);
                    return {
                        who,
                        detail: where ? `${tier} · ${where}` : tier,
                        pending: b.status === "pending_approval",
                    };
                };

                // Una reserva online se considera "muerta" para esta vista si está
                // cancelled, expired, no_show, o si su TTL ya venció estando en
                // pending_payment (cron aún no la marcó).
                const nowMs = Date.now();
                const isDeadBooking = (b: typeof overlappingBookings[0]): boolean => {
                    if (b.status === "cancelled" || b.status === "expired" || b.status === "no_show") return true;
                    if (b.status === "pending_payment" && b.expiresAt && new Date(b.expiresAt).getTime() <= nowMs) return true;
                    return false;
                };

                const activeEntries: OccupantLabel[] = [];
                const cancelledEntries: OccupantLabel[] = [];

                for (const b of overlappingBookings.filter((b) => touchesSelectedSport(b.courtIds))) {
                    if (isDeadBooking(b)) {
                        cancelledEntries.push(bookingLabel(b));
                    } else {
                        activeEntries.push(bookingLabel(b));
                    }
                }
                for (const b of activeBlocks.filter((b) => touchesSelectedSport(b.courtIds))) {
                    activeEntries.push(blockLabel(b));
                }
                for (const b of cancelledBlocks.filter((b) => touchesSelectedSport(b.courtIds))) {
                    cancelledEntries.push(blockLabel(b));
                }

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
    }, [schedule, selectedFormat, selectedDate, existingBookings, blockedSlots, courts, combos, venueFormats, touchesSelectedSport]);

    const handleSlotTap = (slot: SlotItem) => {
        if (!selectedFormat) return;
        const overlappingBookings = existingBookings.filter(
            (b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
        );
        const overlappingBlocks = blockedSlots.filter(
            (b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
        );
        const activeBlocks = overlappingBlocks.filter((b) => b.status !== "cancelled");
        // Solo cuentan como "occupied" las reservas en estados que efectivamente bloquean
        // el slot. Cancelled / no_show / paid / expired no impiden re-reservar la cancha
        // (mismo criterio que el cálculo de disponibilidad en `timeSlots`).
        const occupiedCourtIds = overlappingBookings
            .filter((b) => (SLOT_BLOCKING_BOOKING_STATUSES as readonly string[]).includes(b.status))
            .flatMap((b) => b.courtIds);
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
            bookings: overlappingBookings.filter((b) => touchesSelectedSport(b.courtIds)),
            blocks: overlappingBlocks.filter((b) => touchesSelectedSport(b.courtIds)),
            relevantCourtIds: relevantIds,
            unavailableRelevantCourtIds,
            sameSportCourtIds: [...sameSportCourtIds],
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
                startDate={minDate ?? twoMonthsBackISO()}
                daysAhead={windowDaysFrom(minDate ?? twoMonthsBackISO())}
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
