"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ShieldOff, Loader2, Repeat, MoreVertical, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    getBlockedSlots,
    getAllBlockedSlots,
    createBlockedSlot,
    removeBlockedSlot,
    addBlockedSlotException,
} from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import { labelForRecurrence, expandBlockedSlotsForDate } from "@/lib/domain/blocked-slots";
import {
    logBlockedSlotCreated,
    logBlockedSlotRecurrenceExceptionAdded,
    logBlockedSlotRecurrenceDeleted,
    logBlockedSlotConflictsShown,
    logBlockedSlotConflictsForced,
} from "@/lib/analytics";
import type { BlockedSlot, Court, BookingConflict, RecurrenceType } from "@/lib/domain/venue";
import ConflictsWarningModal from "./ConflictsWarningModal";

interface BlockedSlotsEditorProps {
    venueId: string;
    courts: Court[];
}

function fmt12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${suffix}`;
}

function todayLocalISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekDays(startIso: string): string[] {
    const days: string[] = [];
    const start = new Date(startIso + "T12:00:00");
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        days.push(toISODate(d));
    }
    return days;
}

function formatDayHeader(iso: string): string {
    const d = new Date(iso + "T12:00:00");
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

const RECURRENCE_OPTIONS: Array<{ value: RecurrenceType; label: string }> = [
    { value: "weekly", label: "Cada semana" },
    { value: "biweekly", label: "Cada 2 semanas" },
    { value: "monthly", label: "Cada mes" },
    { value: "daily", label: "Todos los días" },
];

export default function BlockedSlotsEditor({
    venueId,
    courts,
}: BlockedSlotsEditorProps) {
    const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [date, setDate] = useState(todayLocalISO);
    const [startTime, setStartTime] = useState("08:00");
    const [endTime, setEndTime] = useState("09:00");
    const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
    const [reason, setReason] = useState("");
    const [clientName, setClientName] = useState("");

    // Recurrence state
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
    const [endDate, setEndDate] = useState("");

    // View mode
    const [view, setView] = useState<"day" | "week">("day");

    // View date (day mode)
    const [viewDate, setViewDate] = useState(todayLocalISO);

    // Week view state
    const [weekStart, setWeekStart] = useState(todayLocalISO);
    const [weekSlots, setWeekSlots] = useState<Record<string, BlockedSlot[]>>({});
    const [weekLoading, setWeekLoading] = useState(false);

    // Conflicts modal
    const [conflicts, setConflicts] = useState<BookingConflict[]>([]);
    const [conflictsOpen, setConflictsOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const loadSlots = useCallback(async () => {
        setLoading(true);
        try {
            const slots = await getBlockedSlots(venueId, viewDate, true);
            setBlockedSlots(slots);
        } catch (err) {
            handleError(err, "Error al cargar bloqueos");
        } finally {
            setLoading(false);
        }
    }, [venueId, viewDate]);

    const loadWeekSlots = useCallback(async () => {
        setWeekLoading(true);
        try {
            const allSlots = await getAllBlockedSlots(venueId);
            const days = getWeekDays(weekStart);
            const byDay: Record<string, BlockedSlot[]> = {};
            for (const day of days) {
                byDay[day] = expandBlockedSlotsForDate(allSlots, day);
            }
            setWeekSlots(byDay);
        } catch (err) {
            handleError(err, "Error al cargar bloqueos");
        } finally {
            setWeekLoading(false);
        }
    }, [venueId, weekStart]);

    useEffect(() => {
        if (view === "day") loadSlots();
    }, [view, loadSlots]);

    useEffect(() => {
        if (view === "week") loadWeekSlots();
    }, [view, loadWeekSlots]);

    const resetForm = () => {
        setShowForm(false);
        setSelectedCourtIds([]);
        setReason("");
        setClientName("");
        setIsRecurring(false);
        setRecurrenceType("weekly");
        setEndDate("");
    };

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
            resetForm();

            if (viewDate === date || isRecurring) {
                await loadSlots();
            } else {
                setViewDate(date);
            }
        } catch (err) {
            handleError(err, "Error al crear bloqueo");
        } finally {
            setAdding(false);
            setConfirming(false);
        }
    };

    const handleRemove = async (slotId: string, isRecurring: boolean) => {
        const confirmMsg = isRecurring
            ? "¿Eliminar la recurrencia completa? Todas las instancias futuras desaparecerán."
            : "¿Eliminar este bloqueo?";
        if (!window.confirm(confirmMsg)) return;

        setRemoving(slotId);
        setMenuOpenId(null);
        try {
            await removeBlockedSlot(venueId, slotId);
            setBlockedSlots((prev) => prev.filter((s) => s.id !== slotId));
            toast.success(isRecurring ? "Recurrencia eliminada" : "Bloqueo eliminado");
            if (isRecurring) {
                logBlockedSlotRecurrenceDeleted(venueId, slotId);
            }
        } catch (err) {
            handleError(err, "Error al eliminar bloqueo");
        } finally {
            setRemoving(null);
        }
    };

    const handleAddException = async (slot: BlockedSlot) => {
        if (!slot.recurrence) return;
        if (!window.confirm(`Cancelar solo el ${viewDate}? La recurrencia seguirá activa en otras fechas.`)) return;

        setRemoving(slot.id);
        setMenuOpenId(null);
        try {
            await addBlockedSlotException(venueId, slot.id, viewDate);
            setBlockedSlots((prev) => prev.filter((s) => s.id !== slot.id));
            toast.success("Cancelado solo esa fecha");
            logBlockedSlotRecurrenceExceptionAdded(venueId, slot.id, viewDate);
        } catch (err) {
            handleError(err, "Error al cancelar instancia");
        } finally {
            setRemoving(null);
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
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                Bloquea horarios para mantenimiento, eventos privados o clientes fijos. Puedes configurar recurrencia semanal, quincenal, mensual o diaria.
            </p>

            {/* View tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                <button
                    onClick={() => setView("day")}
                    className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                        view === "day" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    Por día
                </button>
                <button
                    onClick={() => setView("week")}
                    className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                        view === "week" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    Por semana
                </button>
            </div>

            {/* Week view */}
            {view === "week" && (
                <div className="space-y-3">
                    {/* Week navigation */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => {
                                const d = new Date(weekStart + "T12:00:00");
                                d.setDate(d.getDate() - 7);
                                setWeekStart(toISODate(d));
                            }}
                            className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            ← Anterior
                        </button>
                        <button
                            onClick={() => setWeekStart(todayLocalISO())}
                            className="text-xs font-medium text-[#1f7a4f] hover:underline"
                        >
                            Esta semana
                        </button>
                        <button
                            onClick={() => {
                                const d = new Date(weekStart + "T12:00:00");
                                d.setDate(d.getDate() + 7);
                                setWeekStart(toISODate(d));
                            }}
                            className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Siguiente →
                        </button>
                    </div>

                    {weekLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {getWeekDays(weekStart).map((day) => {
                                const daySlots = weekSlots[day] ?? [];
                                const isToday = day === todayLocalISO();
                                return (
                                    <div key={day} className="border border-slate-100 rounded-xl overflow-hidden">
                                        <div className={`flex items-center justify-between px-3 py-2 ${isToday ? "bg-[#1f7a4f]/8" : "bg-slate-50"}`}>
                                            <span className={`text-sm font-semibold ${isToday ? "text-[#1f7a4f]" : "text-slate-700"}`}>
                                                {formatDayHeader(day)}
                                                {isToday && <span className="ml-1.5 text-[10px] font-bold text-[#1f7a4f] bg-[#1f7a4f]/10 px-1.5 py-0.5 rounded-full">Hoy</span>}
                                            </span>
                                            <button
                                                onClick={() => { setViewDate(day); setView("day"); }}
                                                className="text-xs text-slate-400 hover:text-[#1f7a4f] transition-colors"
                                            >
                                                Ver día →
                                            </button>
                                        </div>
                                        {daySlots.length === 0 ? (
                                            <p className="px-3 py-2 text-xs text-slate-400">Sin bloqueos</p>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {daySlots.map((slot) => {
                                                    const isRec = !!slot.recurrence;
                                                    return (
                                                        <div key={slot.id} className="flex items-center gap-2 px-3 py-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className={`text-xs font-semibold ${isRec ? "text-indigo-700" : "text-red-700"}`}>
                                                                        {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                                                                    </span>
                                                                    {isRec && (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-[10px] font-semibold">
                                                                            <Repeat className="w-2.5 h-2.5" />
                                                                            {slot.recurrence && labelForRecurrence(slot.recurrence)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {slot.clientName && (
                                                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{slot.clientName}</p>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 shrink-0">
                                                                {slot.courtIds.length === courts.length ? "Todas" : `${slot.courtIds.length} cancha${slot.courtIds.length > 1 ? "s" : ""}`}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Day view */}
            {view === "day" && (
            <>
            {/* View date picker */}
            <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-600">Ver bloqueos del:</label>
                <input
                    type="date"
                    value={viewDate}
                    onChange={(e) => setViewDate(e.target.value)}
                    className="px-3 py-1.5 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                />
            </div>

            {/* Existing blocked slots */}
            {loading ? (
                <div className="space-y-2">
                    {[1, 2].map((i) => (
                        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : blockedSlots.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100">
                    <ShieldOff className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Sin bloqueos para esta fecha</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {blockedSlots.map((slot) => {
                        const isRec = !!slot.recurrence;
                        return (
                            <div
                                key={slot.id}
                                className={`relative flex items-start gap-3 px-4 py-3 border rounded-xl ${
                                    isRec
                                        ? "bg-indigo-50 border-indigo-200"
                                        : "bg-red-50 border-red-200"
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-sm font-semibold ${isRec ? "text-indigo-700" : "text-red-700"}`}>
                                            {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                                        </span>
                                        {isRec && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-semibold">
                                                <Repeat className="w-3 h-3" />
                                                {slot.recurrence && labelForRecurrence(slot.recurrence)}
                                            </span>
                                        )}
                                    </div>
                                    {slot.clientName && (
                                        <p className={`text-xs font-medium mt-0.5 ${isRec ? "text-indigo-600" : "text-red-600"}`}>
                                            {slot.clientName}
                                        </p>
                                    )}
                                    <p className={`text-xs mt-0.5 ${isRec ? "text-indigo-500" : "text-red-500"}`}>
                                        {slot.courtIds
                                            .map((id) => courts.find((c) => c.id === id)?.name || id)
                                            .join(", ")}
                                        {slot.reason && ` · ${slot.reason}`}
                                    </p>
                                </div>
                                <div className="relative flex-shrink-0">
                                    <button
                                        onClick={() => {
                                            if (isRec) {
                                                setMenuOpenId(menuOpenId === slot.id ? null : slot.id);
                                            } else {
                                                handleRemove(slot.id, false);
                                            }
                                        }}
                                        disabled={removing === slot.id}
                                        className={`p-1.5 transition-colors disabled:opacity-50 ${
                                            isRec ? "text-indigo-400 hover:text-indigo-600" : "text-red-400 hover:text-red-600"
                                        }`}
                                    >
                                        {removing === slot.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : isRec ? (
                                            <MoreVertical className="w-4 h-4" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                    <AnimatePresence>
                                        {isRec && menuOpenId === slot.id && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -5 }}
                                                className="absolute right-0 top-8 z-10 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[220px]"
                                            >
                                                <button
                                                    onClick={() => handleAddException(slot)}
                                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                >
                                                    Cancelar solo este día
                                                </button>
                                                <button
                                                    onClick={() => handleRemove(slot.id, true)}
                                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                                >
                                                    Eliminar recurrencia completa
                                                </button>
                                                <button
                                                    onClick={() => setMenuOpenId(null)}
                                                    className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-50 border-t border-slate-100 flex items-center gap-1.5"
                                                >
                                                    <X className="w-3 h-3" />
                                                    Cerrar
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add blocked slot */}
            {!showForm ? (
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors w-full justify-center"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo bloqueo
                </button>
            ) : (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700">Nuevo bloqueo</h4>

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
                        <button
                            onClick={resetForm}
                            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
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
                </div>
            )}

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
            </>
            )}
        </div>
    );
}
