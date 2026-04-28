"use client";

import { useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { createBlockedSlot } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import {
    logBlockedSlotCreated,
    logBlockedSlotConflictsShown,
    logBlockedSlotConflictsForced,
} from "@/lib/analytics";
import type { BookingConflict, Court, RecurrenceType } from "@/lib/domain/venue";
import ConflictsWarningModal from "./ConflictsWarningModal";

interface BlockedSlotFormProps {
    venueId: string;
    courts: Court[];
    defaultDate?: string;
    defaultStartTime?: string;
    defaultEndTime?: string;
    defaultCourtIds?: string[];
    onCreated?: () => void;
    onCancel?: () => void;
}

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
    defaultDate,
    defaultStartTime,
    defaultEndTime,
    defaultCourtIds,
    onCreated,
    onCancel,
}: BlockedSlotFormProps) {
    const [date, setDate] = useState(defaultDate ?? todayLocalISO);
    const [startTime, setStartTime] = useState(defaultStartTime ?? "08:00");
    const [endTime, setEndTime] = useState(defaultEndTime ?? "09:00");
    const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(defaultCourtIds ?? []);
    const [reason, setReason] = useState("");
    const [clientName, setClientName] = useState("");

    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
    const [endDate, setEndDate] = useState("");

    const [adding, setAdding] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [conflicts, setConflicts] = useState<BookingConflict[]>([]);
    const [conflictsOpen, setConflictsOpen] = useState(false);

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
                    clientName: clientName.trim() || undefined,
                    recurrence: isRecurring
                        ? {
                            type: recurrenceType,
                            startDate: date,
                            ...(endDate ? { endDate } : {}),
                        }
                        : undefined,
                },
                force,
            );

            if (res.conflicts && res.conflicts.length > 0) {
                setConflicts(res.conflicts);
                setConflictsOpen(true);
                logBlockedSlotConflictsShown(venueId, res.conflicts.length);
                return;
            }

            toast.success(isRecurring ? "Bloqueo recurrente creado" : "Bloqueo creado");
            logBlockedSlotCreated(venueId, {
                isRecurring,
                recurrenceType: isRecurring ? recurrenceType : undefined,
                hasEndDate: isRecurring && !!endDate,
                hasClientName: !!clientName.trim(),
                courtsCount: selectedCourtIds.length,
            });
            setConflictsOpen(false);
            setConflicts([]);
            onCreated?.();
        } catch (err) {
            handleError(err, "Error al crear bloqueo");
        } finally {
            setAdding(false);
            setConfirming(false);
        }
    };

    const toggleCourtId = (courtId: string) => {
        setSelectedCourtIds((prev) =>
            prev.includes(courtId)
                ? prev.filter((id) => id !== courtId)
                : [...prev, courtId],
        );
    };

    const selectAllCourts = () => {
        const activeCourts = courts.filter((c) => c.active);
        if (selectedCourtIds.length === activeCourts.length) {
            setSelectedCourtIds([]);
        } else {
            setSelectedCourtIds(activeCourts.map((c) => c.id));
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
                        <Repeat className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-medium text-slate-700">Se repite</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsRecurring(!isRecurring)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${isRecurring ? "bg-indigo-500" : "bg-slate-300"}`}
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
                    <label className="text-xs text-slate-500">Canchas a bloquear</label>
                    <button
                        onClick={selectAllCourts}
                        className="text-xs text-[#1f7a4f] font-medium hover:underline"
                    >
                        {selectedCourtIds.length === courts.filter((c) => c.active).length
                            ? "Deseleccionar todas"
                            : "Seleccionar todas"}
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {courts.filter((c) => c.active).map((court) => (
                        <button
                            key={court.id}
                            onClick={() => toggleCourtId(court.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                selectedCourtIds.includes(court.id)
                                    ? "bg-red-500 text-white border-red-500"
                                    : "bg-white text-slate-600 border-slate-200"
                            }`}
                        >
                            {court.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Client name */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">Cliente (opcional, solo visible para admin)</label>
                <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    maxLength={80}
                    className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                />
            </div>

            {/* Reason */}
            <div>
                <label className="text-xs text-slate-500 mb-1 block">Motivo (opcional)</label>
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
                    disabled={adding}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:bg-red-300 flex items-center justify-center gap-1.5"
                >
                    {adding && !confirming ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Creando...
                        </>
                    ) : (
                        "Bloquear"
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
