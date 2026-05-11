"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { COURT_FORMATS, DAY_OF_WEEK_ORDER, DAY_OF_WEEK_LABELS } from "@/lib/domain/venue";
import type { DaySchedule, ScheduleSlot, FormatPricing, DayOfWeek, VenueFormat } from "@/lib/domain/venue";

interface ScheduleEditorProps {
    schedules: DaySchedule[];
    /** Catálogo multi-deporte de la sede. Si vacío/undefined, usa COURT_FORMATS legacy. */
    venueFormats?: VenueFormat[];
    onScheduleChange: (day: DayOfWeek, schedule: DaySchedule) => void;
}

interface FormatOption {
    value: string;
    label: string;
}

const EMPTY_DAY = (day: DayOfWeek): DaySchedule => ({
    dayOfWeek: day,
    enabled: false,
    slots: [],
});

const DAY_SHORT_LABELS: Record<DayOfWeek, string> = {
    monday: "L",
    tuesday: "M",
    wednesday: "Mi",
    thursday: "J",
    friday: "V",
    saturday: "S",
    sunday: "D",
};

const SLOT_DURATIONS = [
    { label: "1 hora", minutes: 60 },
    { label: "1½ horas", minutes: 90 },
    { label: "2 horas", minutes: 120 },
];

function formatPrice(centavos: number): string {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
    }).format(centavos / 100);
}

function generateSlots(
    startTime: string,
    endTime: string,
    durationMinutes: number,
    formats: FormatPricing[],
): ScheduleSlot[] {
    const slots: ScheduleSlot[] = [];
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    for (let t = startTotal; t + durationMinutes <= endTotal; t += durationMinutes) {
        const sH = Math.floor(t / 60);
        const sM = t % 60;
        const eH = Math.floor((t + durationMinutes) / 60);
        const eM = (t + durationMinutes) % 60;
        slots.push({
            startTime: `${String(sH).padStart(2, "0")}:${String(sM).padStart(2, "0")}`,
            endTime: `${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}`,
            formats: formats.map((f) => ({ ...f })),
        });
    }

    return slots;
}

export default function ScheduleEditor({
    schedules,
    venueFormats,
    onScheduleChange,
}: ScheduleEditorProps) {
    const hasVenueFormats = !!venueFormats && venueFormats.length > 0;

    const formatOptions: FormatOption[] = useMemo(() => {
        if (hasVenueFormats) {
            return venueFormats!.map((f) => ({ value: f.id, label: f.label }));
        }
        return (COURT_FORMATS as readonly string[]).map((f) => ({ value: f, label: f }));
    }, [hasVenueFormats, venueFormats]);

    const knownFormatIds = useMemo(() => new Set(formatOptions.map((o) => o.value)), [formatOptions]);

    const defaultFormat: string = formatOptions[0]?.value ?? "6v6";

    const [expandedDay, setExpandedDay] = useState<DayOfWeek | null>(null);
    const [showQuickSetup, setShowQuickSetup] = useState(
        () => schedules.every((s) => !s.enabled || s.slots.length === 0),
    );

    // Quick setup state
    const [qsDays, setQsDays] = useState<Set<DayOfWeek>>(
        new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]),
    );
    const [qsStartTime, setQsStartTime] = useState("08:00");
    const [qsEndTime, setQsEndTime] = useState("22:00");
    const [qsDuration, setQsDuration] = useState(60);
    const [qsFormats, setQsFormats] = useState<FormatPricing[]>([
        { format: defaultFormat, priceCOP: 15000000 },
    ]);

    const getSchedule = (day: DayOfWeek): DaySchedule => {
        return schedules.find((s) => s.dayOfWeek === day) || EMPTY_DAY(day);
    };

    // ── Quick setup handlers ──

    const toggleQsDay = (day: DayOfWeek) => {
        setQsDays((prev) => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            return next;
        });
    };

    const addQsFormat = () => {
        const used = new Set(qsFormats.map((f) => f.format));
        const next = formatOptions.find((o) => !used.has(o.value));
        if (!next) return;
        setQsFormats([...qsFormats, { format: next.value, priceCOP: 15000000 }]);
    };

    const removeQsFormat = (index: number) => {
        setQsFormats(qsFormats.filter((_, i) => i !== index));
    };

    const updateQsFormat = (index: number, field: keyof FormatPricing, value: string | number) => {
        setQsFormats(qsFormats.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
    };

    const applyQuickSetup = () => {
        if (qsDays.size === 0 || qsFormats.length === 0) return;
        if (qsStartTime >= qsEndTime) return;

        const slots = generateSlots(qsStartTime, qsEndTime, qsDuration, qsFormats);

        for (const day of DAY_OF_WEEK_ORDER) {
            if (qsDays.has(day)) {
                onScheduleChange(day, { dayOfWeek: day, enabled: true, slots });
            } else {
                const existing = getSchedule(day);
                if (!existing.enabled) {
                    onScheduleChange(day, { dayOfWeek: day, enabled: false, slots: [] });
                }
            }
        }

        setShowQuickSetup(false);
    };

    // ── Per-day handlers ──

    const toggleDay = (day: DayOfWeek) => {
        const current = getSchedule(day);
        onScheduleChange(day, { ...current, enabled: !current.enabled });
    };

    const toggleExpand = (day: DayOfWeek) => {
        setExpandedDay((prev) => (prev === day ? null : day));
    };

    const addSlot = (day: DayOfWeek) => {
        const current = getSchedule(day);
        const lastSlot = current.slots[current.slots.length - 1];
        const startTime = lastSlot ? lastSlot.endTime : "08:00";
        const [h, m] = startTime.split(":").map(Number);
        const endH = h + 1;
        const endTime = endH >= 24 ? "23:59" : `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

        const lastFormats = lastSlot
            ? lastSlot.formats.map((f) => ({ ...f }))
            : [{ format: defaultFormat, priceCOP: 15000000 }];

        const newSlot: ScheduleSlot = {
            startTime,
            endTime,
            formats: lastFormats,
        };

        onScheduleChange(day, {
            ...current,
            enabled: true,
            slots: [...current.slots, newSlot],
        });
    };

    const removeSlot = (day: DayOfWeek, slotIndex: number) => {
        const current = getSchedule(day);
        onScheduleChange(day, {
            ...current,
            slots: current.slots.filter((_, i) => i !== slotIndex),
        });
    };

    const updateSlotTime = (
        day: DayOfWeek,
        slotIndex: number,
        field: "startTime" | "endTime",
        value: string,
    ) => {
        const current = getSchedule(day);
        const updated = current.slots.map((s, i) =>
            i === slotIndex ? { ...s, [field]: value } : s,
        );
        onScheduleChange(day, { ...current, slots: updated });
    };

    const addFormatToSlot = (day: DayOfWeek, slotIndex: number) => {
        const current = getSchedule(day);
        const slot = current.slots[slotIndex];
        const usedFormats = new Set(slot.formats.map((f) => f.format));
        const nextFormat = formatOptions.find((o) => !usedFormats.has(o.value));
        if (!nextFormat) return;

        const updated = current.slots.map((s, i) =>
            i === slotIndex
                ? { ...s, formats: [...s.formats, { format: nextFormat.value, priceCOP: 15000000 }] }
                : s,
        );
        onScheduleChange(day, { ...current, slots: updated });
    };

    const removeFormatFromSlot = (day: DayOfWeek, slotIndex: number, formatIndex: number) => {
        const current = getSchedule(day);
        const updated = current.slots.map((s, i) =>
            i === slotIndex
                ? { ...s, formats: s.formats.filter((_, fi) => fi !== formatIndex) }
                : s,
        );
        onScheduleChange(day, { ...current, slots: updated });
    };

    const updateFormat = (
        day: DayOfWeek,
        slotIndex: number,
        formatIndex: number,
        field: keyof FormatPricing,
        value: string | number,
    ) => {
        const current = getSchedule(day);
        const updated = current.slots.map((s, i) =>
            i === slotIndex
                ? {
                    ...s,
                    formats: s.formats.map((fp, fi) =>
                        fi === formatIndex ? { ...fp, [field]: value } : fp,
                    ),
                }
                : s,
        );
        onScheduleChange(day, { ...current, slots: updated });
    };

    const copyDayTo = (sourceDay: DayOfWeek, targetDay: DayOfWeek) => {
        const source = getSchedule(sourceDay);
        onScheduleChange(targetDay, {
            ...source,
            dayOfWeek: targetDay,
        });
    };

    // Count configured slots
    const totalSlots = schedules.reduce((sum, s) => sum + (s.enabled ? s.slots.length : 0), 0);

    return (
        <div className="space-y-4">
            {/* ═══════════════════════════════
                QUICK SETUP WIZARD
            ═══════════════════════════════ */}
            {showQuickSetup ? (
                <div className="bg-white rounded-2xl border border-[#1f7a4f]/20 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#1f7a4f]/10 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-[#1f7a4f]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">Configuración rápida</h3>
                            <p className="text-xs text-slate-400">Genera horarios en un paso</p>
                        </div>
                    </div>

                    {/* Days */}
                    <div className="mb-4">
                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Días</label>
                        <div className="flex gap-1.5">
                            {DAY_OF_WEEK_ORDER.map((day) => (
                                <button
                                    key={day}
                                    onClick={() => toggleQsDay(day)}
                                    className={`w-10 h-10 rounded-full text-xs font-bold transition-colors ${
                                        qsDays.has(day)
                                            ? "bg-[#1f7a4f] text-white"
                                            : "bg-slate-100 text-slate-400"
                                    }`}
                                >
                                    {DAY_SHORT_LABELS[day]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Time range */}
                    <div className="mb-4">
                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Horario</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="time"
                                value={qsStartTime}
                                onChange={(e) => setQsStartTime(e.target.value)}
                                className="flex-1 px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                            />
                            <span className="text-sm text-slate-400">a</span>
                            <input
                                type="time"
                                value={qsEndTime}
                                onChange={(e) => setQsEndTime(e.target.value)}
                                className="flex-1 px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                            />
                        </div>
                    </div>

                    {/* Slot duration */}
                    <div className="mb-4">
                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Duración de cada slot</label>
                        <div className="flex gap-2">
                            {SLOT_DURATIONS.map(({ label, minutes }) => (
                                <button
                                    key={minutes}
                                    onClick={() => setQsDuration(minutes)}
                                    className={`flex-1 py-2.5 text-xs font-semibold rounded-xl border-2 transition-colors ${
                                        qsDuration === minutes
                                            ? "bg-[#1f7a4f] text-white border-[#1f7a4f]"
                                            : "bg-white text-slate-600 border-slate-200"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Formats + prices */}
                    <div className="mb-5">
                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Formatos y precios</label>
                        <div className="space-y-2">
                            {qsFormats.map((fp, fi) => {
                                const isUnknown = hasVenueFormats && !knownFormatIds.has(fp.format);
                                return (
                                <div key={fi} className="flex items-center gap-2">
                                    <select
                                        value={fp.format}
                                        onChange={(e) => updateQsFormat(fi, "format", e.target.value)}
                                        className={`px-3 py-2.5 text-base border rounded-xl bg-white focus:outline-none ${isUnknown ? "border-red-300 text-red-600" : "border-slate-200"}`}
                                    >
                                        {isUnknown && (
                                            <option value={fp.format}>⚠ {fp.format} (no encontrado)</option>
                                        )}
                                        {formatOptions.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                    <div className="flex items-center gap-1 flex-1">
                                        <span className="text-sm text-slate-400">$</span>
                                        <input
                                            type="number"
                                            value={fp.priceCOP / 100}
                                            onChange={(e) => updateQsFormat(fi, "priceCOP", Math.round(Number(e.target.value) * 100))}
                                            placeholder="Precio"
                                            className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                            min={0}
                                            step={1000}
                                        />
                                    </div>
                                    {qsFormats.length > 1 && (
                                        <button
                                            onClick={() => removeQsFormat(fi)}
                                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                        {qsFormats.length < formatOptions.length && (
                            <button
                                onClick={addQsFormat}
                                className="mt-2 text-xs text-[#1f7a4f] font-semibold hover:underline"
                            >
                                + Agregar formato
                            </button>
                        )}
                    </div>

                    {/* Preview */}
                    {qsDays.size > 0 && qsStartTime < qsEndTime && (
                        <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
                            <p className="text-xs text-slate-500">
                                Se generarán <span className="font-bold text-slate-700">
                                    {generateSlots(qsStartTime, qsEndTime, qsDuration, qsFormats).length} slots
                                </span> por día en <span className="font-bold text-slate-700">
                                    {qsDays.size} día{qsDays.size !== 1 ? "s" : ""}
                                </span>
                            </p>
                        </div>
                    )}

                    {/* Apply button */}
                    <button
                        onClick={applyQuickSetup}
                        disabled={qsDays.size === 0 || qsFormats.length === 0 || qsStartTime >= qsEndTime}
                        className="w-full py-3 rounded-xl bg-[#1f7a4f] text-white text-sm font-bold hover:bg-[#145c3a] active:scale-[0.98] transition-all disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        Generar horarios
                    </button>
                </div>
            ) : (
                /* Button to re-open quick setup */
                <button
                    onClick={() => setShowQuickSetup(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-[#1f7a4f] bg-[#1f7a4f]/10 rounded-xl hover:bg-[#1f7a4f]/20 transition-colors"
                >
                    <Zap className="w-3.5 h-3.5" />
                    Configuración rápida
                    {totalSlots > 0 && <span className="text-slate-400 font-normal">· Regenerar horarios</span>}
                </button>
            )}

            {/* ═══════════════════════════════
                PER-DAY FINE EDITOR
            ═══════════════════════════════ */}
            <div className="space-y-2">
                {DAY_OF_WEEK_ORDER.map((day) => {
                    const sched = getSchedule(day);
                    const isExpanded = expandedDay === day;

                    return (
                        <div
                            key={day}
                            className={`rounded-xl border transition-colors ${sched.enabled ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100"}`}
                        >
                            {/* Day header */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <button
                                    onClick={() => toggleDay(day)}
                                    className={`w-10 h-6 rounded-full transition-colors relative ${sched.enabled ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                                >
                                    <span
                                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sched.enabled ? "left-[18px]" : "left-0.5"}`}
                                    />
                                </button>
                                <span className={`text-sm font-semibold flex-1 ${sched.enabled ? "text-slate-700" : "text-slate-400"}`}>
                                    {DAY_OF_WEEK_LABELS[day]}
                                </span>
                                {sched.enabled && (
                                    <span className="text-xs text-slate-400">
                                        {sched.slots.length} slot{sched.slots.length !== 1 ? "s" : ""}
                                    </span>
                                )}
                                {sched.enabled && (
                                    <button
                                        onClick={() => toggleExpand(day)}
                                        className="p-1 text-slate-400 hover:text-slate-600"
                                    >
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4" />
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Expanded slots */}
                            {sched.enabled && isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                                    {sched.slots.map((slot, si) => (
                                        <SlotEditor
                                            key={si}
                                            slot={slot}
                                            formatOptions={formatOptions}
                                            knownFormatIds={knownFormatIds}
                                            hasVenueFormats={hasVenueFormats}
                                            onUpdateTime={(field, value) =>
                                                updateSlotTime(day, si, field, value)
                                            }
                                            onAddFormat={() => addFormatToSlot(day, si)}
                                            onRemoveFormat={(fi) =>
                                                removeFormatFromSlot(day, si, fi)
                                            }
                                            onUpdateFormat={(fi, field, value) =>
                                                updateFormat(day, si, fi, field, value)
                                            }
                                            onRemove={() => removeSlot(day, si)}
                                        />
                                    ))}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => addSlot(day)}
                                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1f7a4f] bg-[#1f7a4f]/10 rounded-lg hover:bg-[#1f7a4f]/20 transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Agregar horario
                                        </button>

                                        <CopyDayDropdown
                                            sourceDay={day}
                                            onCopy={(target) => copyDayTo(day, target)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ════════════════════════════
// SlotEditor sub-component
// ════════════════════════════

interface SlotEditorProps {
    slot: ScheduleSlot;
    formatOptions: FormatOption[];
    knownFormatIds: Set<string>;
    hasVenueFormats: boolean;
    onUpdateTime: (field: "startTime" | "endTime", value: string) => void;
    onAddFormat: () => void;
    onRemoveFormat: (formatIndex: number) => void;
    onUpdateFormat: (formatIndex: number, field: keyof FormatPricing, value: string | number) => void;
    onRemove: () => void;
}

function SlotEditor({
    slot,
    formatOptions,
    knownFormatIds,
    hasVenueFormats,
    onUpdateTime,
    onAddFormat,
    onRemoveFormat,
    onUpdateFormat,
    onRemove,
}: SlotEditorProps) {
    return (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            {/* Time range */}
            <div className="flex items-center gap-2 mb-3">
                <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => onUpdateTime("startTime", e.target.value)}
                    className="px-2 py-1.5 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                />
                <span className="text-xs text-slate-400">a</span>
                <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => onUpdateTime("endTime", e.target.value)}
                    className="px-2 py-1.5 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                />
                <button
                    onClick={onRemove}
                    className="ml-auto p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Format pricings */}
            <div className="space-y-2">
                {slot.formats.map((fp, fi) => {
                    const isUnknown = hasVenueFormats && !knownFormatIds.has(fp.format);
                    return (
                    <div key={fi} className="flex items-center gap-2">
                        <select
                            value={fp.format}
                            onChange={(e) =>
                                onUpdateFormat(fi, "format", e.target.value)
                            }
                            className={`px-2 py-1.5 text-base border rounded-lg bg-white focus:outline-none ${isUnknown ? "border-red-300 text-red-600" : "border-slate-200"}`}
                        >
                            {isUnknown && (
                                <option value={fp.format}>⚠ {fp.format} (no encontrado)</option>
                            )}
                            {formatOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1 flex-1">
                            <span className="text-xs text-slate-400">$</span>
                            <input
                                type="number"
                                value={fp.priceCOP / 100}
                                onChange={(e) =>
                                    onUpdateFormat(
                                        fi,
                                        "priceCOP",
                                        Math.round(Number(e.target.value) * 100),
                                    )
                                }
                                placeholder="Precio COP"
                                className="w-full px-2 py-1.5 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                                min={0}
                                step={1000}
                            />
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {formatPrice(fp.priceCOP)}
                        </span>
                        {slot.formats.length > 1 && (
                            <button
                                onClick={() => onRemoveFormat(fi)}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    );
                })}
            </div>

            {slot.formats.length < formatOptions.length && (
                <button
                    onClick={onAddFormat}
                    className="mt-2 text-xs text-[#1f7a4f] font-medium hover:underline"
                >
                    + Agregar formato
                </button>
            )}
        </div>
    );
}

// ════════════════════════════
// CopyDayDropdown sub-component
// ════════════════════════════

interface CopyDayDropdownProps {
    sourceDay: DayOfWeek;
    onCopy: (target: DayOfWeek) => void;
}

function CopyDayDropdown({ sourceDay, onCopy }: CopyDayDropdownProps) {
    const [open, setOpen] = useState(false);
    const targets = DAY_OF_WEEK_ORDER.filter((d) => d !== sourceDay);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="px-3 py-2 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
                Copiar a...
            </button>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-lg border border-slate-200 z-20 py-1 min-w-[140px]">
                        {targets.map((day) => (
                            <button
                                key={day}
                                onClick={() => {
                                    onCopy(day);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                {DAY_OF_WEEK_LABELS[day]}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
