"use client";

import { useState, useEffect } from "react";
import { Loader2, Repeat } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { createBlockedSlot, getVenueSchedule } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import {
    logBlockedSlotCreated,
    logBlockedSlotConflictsShown,
    logBlockedSlotConflictsForced,
} from "@/lib/analytics";
import { formatCOP } from "@/lib/domain/wallet";
import { getDayOfWeek } from "@/lib/domain/venue";
import { calculateManualReservationPriceBreakdown } from "@/lib/domain/manual-reservation-pricing";
import type { BookingConflict, Court, CourtCombo, DaySchedule, RecurrenceType, VenueFormat } from "@/lib/domain/venue";
import ConflictsWarningModal from "./ConflictsWarningModal";

interface BlockedSlotFormProps {
    venueId: string;
    courts: Court[];
    /** Combos del venue. Necesario para inferir el formato cuando se seleccionan múltiples canchas. */
    combos?: CourtCombo[];
    defaultDate?: string;
    defaultStartTime?: string;
    defaultEndTime?: string;
    defaultCourtIds?: string[];
    /** Formato de la reserva (VenueFormat.id o legacy "5v5"…). Si no se pasa, se infiere de las canchas. */
    defaultFormat?: string;
    /** Catálogo multi-deporte de la sede. Habilita tiers de duración en el cálculo de precio. */
    venueFormats?: VenueFormat[];
    /** IDs de canchas ya ocupadas por bookings o blocks existentes en el mismo horario. Se muestran deshabilitadas. */
    occupiedCourtIds?: string[];
    onCreated?: () => void;
    onCancel?: () => void;
}

function inferFormatFromCourts(
    selectedCourtIds: string[],
    courts: Court[],
    combos: CourtCombo[],
): string | null {
    if (selectedCourtIds.length === 0) return null;
    if (selectedCourtIds.length === 1) {
        const court = courts.find((c) => c.id === selectedCourtIds[0]);
        return court?.baseFormat ?? null;
    }
    // Multi-cancha: buscar un combo activo que matchee exactamente.
    const selSet = new Set(selectedCourtIds);
    const combo = combos.find(
        (c) => c.active
            && c.courtIds.length === selectedCourtIds.length
            && c.courtIds.every((id) => selSet.has(id)),
    );
    return combo?.resultingFormat ?? null;
}

const PHONE_REGEX = /^3\d{9}$/;

function todayLocalISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RECURRENCE_OPTIONS: Array<{ value: RecurrenceType; label: string }> = [
    { value: "weekly", label: "Cada semana" },
    { value: "biweekly", label: "Cada 2 semanas" },
    { value: "monthly", label: "Cada mes" },
    { value: "daily", label: "Todos los días" },
];

export default function BlockedSlotForm({
    venueId,
    courts,
    combos = [],
    defaultDate,
    defaultStartTime,
    defaultEndTime,
    defaultCourtIds,
    defaultFormat,
    venueFormats,
    occupiedCourtIds = [],
    onCreated,
    onCancel,
}: BlockedSlotFormProps) {
    const [date, setDate] = useState(defaultDate ?? todayLocalISO);
    const [startTime, setStartTime] = useState(defaultStartTime ?? "08:00");
    const [endTime, setEndTime] = useState(defaultEndTime ?? "09:00");
    const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(defaultCourtIds ?? []);
    const [reason, setReason] = useState("");
    const [clientName, setClientName] = useState("");
    const [clientPhone, setClientPhone] = useState("");

    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
    const [endDate, setEndDate] = useState("");
    const [isMonthly, setIsMonthly] = useState(false);

    const [adding, setAdding] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [conflicts, setConflicts] = useState<BookingConflict[]>([]);
    const [conflictsOpen, setConflictsOpen] = useState(false);

    // Schedule del día seleccionado, para calcular el precio en vivo.
    const [schedule, setSchedule] = useState<DaySchedule | null>(null);
    useEffect(() => {
        if (!venueId || !date) return;
        let cancelled = false;
        const dayOfWeek = getDayOfWeek(date);
        getVenueSchedule(venueId, dayOfWeek)
            .then((s) => { if (!cancelled) setSchedule(s); })
            .catch(() => { if (!cancelled) setSchedule(null); });
        return () => { cancelled = true; };
    }, [venueId, date]);

    const effectiveFormat = inferFormatFromCourts(selectedCourtIds, courts, combos) ?? defaultFormat ?? null;

    // Canchas compatibles con el formato por defecto (canchas con baseFormat coincidente +
    // canchas que participan en combos que producen el formato). Las canchas fuera de este
    // set se muestran tachadas — pertenecen a otro deporte.
    const compatibleCourtIds = (() => {
        if (!defaultFormat) return null;
        const ids = new Set<string>();
        for (const c of courts) {
            if (c.baseFormat === defaultFormat) ids.add(c.id);
        }
        for (const combo of combos) {
            if (combo.resultingFormat === defaultFormat) {
                for (const id of combo.courtIds) ids.add(id);
            }
        }
        return ids;
    })();

    // Desglose con tier aplicado si corresponde. Si no hay combo exacto y hay múltiples canchas,
    // sumar precio sencilla de cada una (sin tier en ese fallback — caso poco común).
    const priceBreakdown = effectiveFormat
        ? calculateManualReservationPriceBreakdown(schedule, effectiveFormat, startTime, endTime, venueFormats)
        : selectedCourtIds.length > 1
            ? {
                subtotalCOP: selectedCourtIds.reduce((sum, courtId) => {
                    const court = courts.find((c) => c.id === courtId);
                    return sum + calculateManualReservationPriceBreakdown(schedule, court?.baseFormat ?? null, startTime, endTime, venueFormats).finalCOP;
                }, 0),
                discountCOP: 0,
                finalCOP: selectedCourtIds.reduce((sum, courtId) => {
                    const court = courts.find((c) => c.id === courtId);
                    return sum + calculateManualReservationPriceBreakdown(schedule, court?.baseFormat ?? null, startTime, endTime, venueFormats).finalCOP;
                }, 0),
                appliedTier: null,
            }
            : { subtotalCOP: 0, discountCOP: 0, finalCOP: 0, appliedTier: null };
    const priceCOP = priceBreakdown.finalCOP;
    const priceCalculable = priceCOP > 0;

    const phoneTrimmed = clientPhone.trim();
    const phoneValid = phoneTrimmed.length === 0 || PHONE_REGEX.test(phoneTrimmed);
    const nameValid = clientName.trim().length > 0;
    const canSubmit = nameValid && phoneValid && selectedCourtIds.length > 0 && !adding;

    const submitCreate = async (force: boolean) => {
        if (!date || !startTime || !endTime) {
            toast.error("Completa fecha y horario");
            return;
        }
        if (startTime >= endTime) {
            toast.error("La hora de inicio debe ser anterior a la hora de fin");
            return;
        }
        if (selectedCourtIds.length === 0) {
            toast.error("Selecciona al menos una cancha");
            return;
        }
        if (!nameValid) {
            toast.error("El nombre del cliente es obligatorio");
            return;
        }
        if (!phoneValid) {
            toast.error("Celular inválido (10 dígitos empezando en 3)");
            return;
        }
        if (isRecurring && recurrenceType === "monthly") {
            const d = new Date(date + "T12:00:00");
            if (d.getDate() > 28) {
                toast.error("Para recurrencia mensual, elige un día entre 1 y 28");
                return;
            }
        }

        setAdding(true);
        setConfirming(force);
        try {
            const res = await createBlockedSlot(
                venueId,
                {
                    date: isRecurring ? null : date,
                    startTime,
                    endTime,
                    courtIds: selectedCourtIds,
                    reason: reason.trim() || undefined,
                    clientName: clientName.trim(),
                    clientPhone: phoneTrimmed || undefined,
                    priceCOP,
                    status: "pending",
                    recurrence: isRecurring
                        ? {
                            type: recurrenceType,
                            startDate: date,
                            ...(endDate ? { endDate } : {}),
                        }
                        : undefined,
                    isMonthly: isRecurring && isMonthly ? true : undefined,
                },
                force,
            );

            if (res.conflicts && res.conflicts.length > 0) {
                setConflicts(res.conflicts);
                setConflictsOpen(true);
                logBlockedSlotConflictsShown(venueId, res.conflicts.length);
                return;
            }

            toast.success(isRecurring ? "Reserva recurrente creada" : "Reserva creada");
            logBlockedSlotCreated(venueId, {
                isRecurring,
                recurrenceType: isRecurring ? recurrenceType : undefined,
                hasEndDate: isRecurring && !!endDate,
                hasClientName: !!clientName.trim(),
                hasPhone: !!phoneTrimmed,
                priceCOP,
                priceCalculable,
                courtsCount: selectedCourtIds.length,
            });
            setConflictsOpen(false);
            setConflicts([]);
            onCreated?.();
        } catch (err) {
            handleError(err, "Error al crear la reserva");
        } finally {
            setAdding(false);
            setConfirming(false);
        }
    };

    const occupiedSet = new Set(occupiedCourtIds);

    const toggleCourtId = (courtId: string) => {
        if (occupiedSet.has(courtId)) return;
        setSelectedCourtIds((prev) =>
            prev.includes(courtId)
                ? prev.filter((id) => id !== courtId)
                : [...prev, courtId],
        );
    };

    const selectAllCourts = () => {
        const availableCourts = courts.filter(
            (c) => c.active && !occupiedSet.has(c.id) && (compatibleCourtIds === null || compatibleCourtIds.has(c.id)),
        );
        if (selectedCourtIds.length === availableCourts.length) {
            setSelectedCourtIds([]);
        } else {
            setSelectedCourtIds(availableCourts.map((c) => c.id));
        }
    };

    return (
        <div className="space-y-3">
            {/* Date */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">
                    {isRecurring ? "Fecha de inicio" : "Fecha"}
                </label>
                <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                />
            </div>

            {/* Time range */}
            <div className="flex gap-2 items-center">
                <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                    <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    />
                </div>
                <span className="text-xs text-slate-400 mt-5">a</span>
                <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                    <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    />
                </div>
            </div>

            {/* Recurrence toggle */}
            <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Repeat className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700">Se repite</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsRecurring(!isRecurring)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${isRecurring ? "bg-slate-500" : "bg-slate-300"}`}
                    >
                        <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRecurring ? "left-[22px]" : "left-0.5"}`}
                        />
                    </button>
                </div>
                <AnimatePresence>
                    {isRecurring && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="pt-3 space-y-3">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Frecuencia</label>
                                    <select
                                        value={recurrenceType}
                                        onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
                                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                    >
                                        {RECURRENCE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {/* Pago mensual */}
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-sm font-medium text-slate-700">Pago mensual</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsMonthly((v) => !v)}
                                        className={`w-11 h-6 rounded-full transition-colors relative ${isMonthly ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                                    >
                                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isMonthly ? "left-[22px]" : "left-0.5"}`} />
                                    </button>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Hasta (opcional)</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        min={date}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        placeholder="Sin fecha de fin"
                                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Déjalo vacío para que se repita indefinidamente.</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Court selection */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-500">Canchas a reservar</label>
                    <button
                        onClick={selectAllCourts}
                        className="text-xs text-[#1f7a4f] font-medium hover:underline"
                    >
                        {selectedCourtIds.length === courts.filter((c) => c.active && !occupiedSet.has(c.id) && (compatibleCourtIds === null || compatibleCourtIds.has(c.id))).length
                            ? "Deseleccionar todas"
                            : "Seleccionar todas"}
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {courts.filter((c) => c.active).map((court) => {
                        const isOccupied = occupiedSet.has(court.id);
                        const isIncompatible = compatibleCourtIds !== null && !compatibleCourtIds.has(court.id);
                        const isSelected = selectedCourtIds.includes(court.id);
                        const disabled = isOccupied || isIncompatible;
                        const title = isOccupied
                            ? "Cancha ocupada en este horario"
                            : isIncompatible
                                ? "Esta cancha no aplica al deporte seleccionado"
                                : undefined;
                        return (
                            <button
                                key={court.id}
                                onClick={() => toggleCourtId(court.id)}
                                disabled={disabled}
                                title={title}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                    disabled
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through"
                                        : isSelected
                                            ? "bg-[#1f7a4f] text-white border-[#1f7a4f]"
                                            : "bg-white text-slate-600 border-slate-200"
                                }`}
                            >
                                {court.name}
                            </button>
                        );
                    })}
                </div>
                {(occupiedSet.size > 0 || (compatibleCourtIds && courts.some((c) => c.active && !compatibleCourtIds.has(c.id)))) && (
                    <p className="text-[10px] text-slate-400 mt-1.5">Las canchas tachadas no están disponibles para este horario o deporte.</p>
                )}
            </div>

            {/* Client name (obligatorio) */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">
                    Cliente <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    maxLength={80}
                    className={`w-full px-3 py-2 text-base border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 ${
                        clientName.length > 0 && !nameValid
                            ? "border-red-400"
                            : "border-slate-200"
                    }`}
                />
            </div>

            {/* Client phone (opcional) */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">Celular (opcional)</label>
                <div className="flex relative items-center">
                    <span className="absolute left-3 text-slate-400 text-sm select-none">+57</span>
                    <input
                        type="tel"
                        value={clientPhone}
                        onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                            setClientPhone(v);
                        }}
                        placeholder="3001234567"
                        className={`w-full pl-12 pr-3 py-2 text-base border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 ${
                            !phoneValid ? "border-red-400" : "border-slate-200"
                        }`}
                    />
                </div>
                {!phoneValid && (
                    <p className="text-[10px] text-red-500 mt-1">Debe tener 10 dígitos y empezar con 3.</p>
                )}
            </div>

            {/* Price display (auto-calculado, solo lectura) */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">Precio</label>
                {priceCalculable && priceBreakdown.discountCOP > 0 ? (
                    <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 space-y-0.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Subtotal</span>
                            <span className="text-slate-600">{formatCOP(priceBreakdown.subtotalCOP)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-emerald-600">Tarifa especial</span>
                            <span className="text-emerald-600 font-medium">−{formatCOP(priceBreakdown.discountCOP)}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-0.5 border-t border-slate-200 mt-1">
                            <span className="text-slate-700 font-semibold">Total</span>
                            <span className="text-slate-700 font-semibold">{formatCOP(priceCOP)}</span>
                        </div>
                    </div>
                ) : (
                    <div className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-semibold">
                        {priceCalculable ? formatCOP(priceCOP) : "—"}
                    </div>
                )}
                {!priceCalculable && (
                    <p className="text-[10px] text-slate-400 mt-1">No se pudo calcular para este horario; se guardará en 0.</p>
                )}
            </div>

            {/* Información adicional (campo `reason` en Firestore) */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">Información adicional (opcional)</label>
                <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej: Mantenimiento de césped"
                    maxLength={200}
                    className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                )}
                <button
                    onClick={() => submitCreate(false)}
                    disabled={!canSubmit}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1f7a4f] rounded-lg hover:bg-[#16603c] transition-colors disabled:bg-emerald-300 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                    {adding && !confirming ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Creando...
                        </>
                    ) : (
                        "Reservar"
                    )}
                </button>
            </div>

            {/* Conflicts modal */}
            <ConflictsWarningModal
                open={conflictsOpen}
                conflicts={conflicts}
                loading={adding && confirming}
                onCancel={() => {
                    setConflictsOpen(false);
                    setConflicts([]);
                }}
                onConfirm={() => {
                    logBlockedSlotConflictsForced(venueId, conflicts.length);
                    submitCreate(true);
                }}
            />
        </div>
    );
}
