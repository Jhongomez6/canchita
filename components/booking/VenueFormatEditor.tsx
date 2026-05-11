"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, AlertCircle, Download, ChevronDown, Tag, Pencil, Check, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { SPORT_TYPES, SPORT_LABELS, validateVenueFormat } from "@/lib/domain/venue";
import type { VenueFormat, VenueFormatDurationTier, SportType, Court, CourtCombo, DaySchedule } from "@/lib/domain/venue";
import SportBadge from "./SportBadge";
import DurationTiersEditor from "./DurationTiersEditor";

interface VenueFormatEditorProps {
    formats: VenueFormat[];
    /** Canchas y combos que referencian estos formatos. Se usan para advertir antes de borrar
     *  y para detectar formatos legacy a importar. */
    courts: Court[];
    combos: CourtCombo[];
    /** Schedules de la sede. Se usan para detectar formatos legacy referenciados. */
    schedules?: DaySchedule[];
    onFormatsChange: (formats: VenueFormat[]) => void;
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function suggestId(sport: SportType, playersPerTeam: number): string {
    return `${sport}_${playersPerTeam}v${playersPerTeam}`;
}

function suggestLabel(sport: SportType, playersPerTeam: number): string {
    return `${SPORT_LABELS[sport]} ${playersPerTeam}v${playersPerTeam}`;
}

export default function VenueFormatEditor({
    formats,
    courts,
    combos,
    schedules,
    onFormatsChange,
}: VenueFormatEditorProps) {
    const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set());
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [editingLabelValue, setEditingLabelValue] = useState("");

    const toggleTiers = (formatId: string) => {
        setExpandedTiers((prev) => {
            const next = new Set(prev);
            if (next.has(formatId)) next.delete(formatId);
            else next.add(formatId);
            return next;
        });
    };

    // Hint: precio base de slot (mediano) para este formato, para warning visual en tier flat.
    const getSlotBasePriceHint = (formatId: string): number | undefined => {
        const prices: number[] = [];
        for (const s of schedules ?? []) {
            if (!s.slots) continue;
            for (const slot of s.slots) {
                for (const fp of slot.formats) {
                    if (fp.format === formatId && fp.priceCOP > 0) prices.push(fp.priceCOP);
                }
            }
        }
        if (prices.length === 0) return undefined;
        prices.sort((a, b) => a - b);
        return prices[Math.floor(prices.length / 2)];
    };

    const updateFormatTiers = (formatId: string, tiers: VenueFormatDurationTier[]) => {
        onFormatsChange(
            formats.map((f) => (f.id === formatId ? { ...f, durationTiers: tiers.length > 0 ? tiers : undefined } : f)),
        );
    };

    const startEditLabel = (f: VenueFormat) => {
        setEditingLabelId(f.id);
        setEditingLabelValue(f.label);
    };

    const commitEditLabel = () => {
        if (!editingLabelId) return;
        const trimmed = editingLabelValue.trim();
        if (trimmed) {
            onFormatsChange(formats.map((f) => (f.id === editingLabelId ? { ...f, label: trimmed } : f)));
        }
        setEditingLabelId(null);
    };

    const cancelEditLabel = () => setEditingLabelId(null);

    // Formatos legacy en uso (canchas/combos/schedule) que no existen en el catálogo actual.
    // El id se preserva tal cual (ej. "5v5") para que las referencias existentes no se rompan.
    const legacyToImport = useMemo(() => {
        const used = new Set<string>();
        for (const c of courts) used.add(c.baseFormat);
        for (const c of combos) used.add(c.resultingFormat);
        for (const s of schedules ?? []) {
            if (!s.slots) continue;
            for (const slot of s.slots) {
                for (const fp of slot.formats) used.add(fp.format);
            }
        }
        const existing = new Set(formats.map((f) => f.id));
        return [...used]
            .filter((id) => !existing.has(id))
            .filter((id) => /^\d+v\d+$/.test(id))
            .sort((a, b) => parseInt(a) - parseInt(b));
    }, [courts, combos, schedules, formats]);

    const importLegacy = () => {
        const imported: VenueFormat[] = legacyToImport.map((id) => {
            const perTeam = parseInt(id.split("v")[0], 10);
            return {
                id,
                sport: "football",
                label: `Fútbol ${id}`,
                playersPerTeam: perTeam,
            };
        });
        onFormatsChange([...formats, ...imported]);
        toast.success(`${imported.length} formato${imported.length !== 1 ? "s" : ""} importado${imported.length !== 1 ? "s" : ""}`);
    };

    const [newSport, setNewSport] = useState<SportType>("football");
    const [newPlayersPerTeam, setNewPlayersPerTeam] = useState<number>(5);
    const [newLabel, setNewLabel] = useState("");
    const [newId, setNewId] = useState("");
    const [idEdited, setIdEdited] = useState(false);
    const [labelEdited, setLabelEdited] = useState(false);

    const effectiveId = idEdited ? newId : suggestId(newSport, newPlayersPerTeam);
    const effectiveLabel = labelEdited ? newLabel : suggestLabel(newSport, newPlayersPerTeam);

    const handleSportChange = (sport: SportType) => {
        setNewSport(sport);
    };

    const handlePlayersChange = (value: number) => {
        setNewPlayersPerTeam(value);
    };

    const countReferences = (formatId: string): number => {
        let n = 0;
        for (const c of courts) if (c.baseFormat === formatId) n++;
        for (const c of combos) if (c.resultingFormat === formatId) n++;
        return n;
    };

    const addFormat = () => {
        const candidate: VenueFormat = {
            id: effectiveId,
            sport: newSport,
            label: effectiveLabel,
            playersPerTeam: newPlayersPerTeam,
        };
        try {
            validateVenueFormat(candidate);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Formato inválido");
            return;
        }
        if (formats.some((f) => f.id === candidate.id)) {
            toast.error(`Ya existe un formato con id "${candidate.id}"`);
            return;
        }
        onFormatsChange([...formats, candidate]);
        // Reset
        setNewLabel("");
        setNewId("");
        setIdEdited(false);
        setLabelEdited(false);
    };

    const removeFormat = (id: string) => {
        const refs = countReferences(id);
        if (refs > 0) {
            const ok = window.confirm(
                `${refs} cancha${refs > 1 ? "s" : ""}/combo${refs > 1 ? "s" : ""} usan este formato. Si lo eliminas, esas referencias mostrarán una advertencia. ¿Eliminar de todos modos?`,
            );
            if (!ok) return;
        }
        onFormatsChange(formats.filter((f) => f.id !== id));
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-slate-700">Deportes y formatos</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                    Configura los formatos de juego de esta sede. Aplican a canchas y horarios.
                </p>
            </div>

            {/* Botón de importar legacy: aparece cuando hay refs a XvX no catalogadas */}
            {legacyToImport.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-3">
                    <Download className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-blue-900">
                            Formatos legacy detectados
                        </p>
                        <p className="text-[11px] text-blue-700 mt-0.5">
                            Tus canchas u horarios usan {legacyToImport.join(", ")}. Impórtalos como
                            Fútbol para mantenerlos funcionando antes de agregar otros deportes.
                        </p>
                        <button
                            onClick={importLegacy}
                            type="button"
                            className="mt-2 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all"
                        >
                            Importar {legacyToImport.length} formato{legacyToImport.length !== 1 ? "s" : ""}
                        </button>
                    </div>
                </div>
            )}

            {/* Lista actual */}
            {formats.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800">
                        <p className="font-semibold mb-0.5">Sin formatos configurados</p>
                        <p className="text-amber-700">
                            La sede opera en modo fútbol legacy. Agrega formatos para habilitar otros deportes.
                        </p>
                    </div>
                </div>
            ) : (
                <AnimatePresence>
                    <div className="space-y-2">
                        {formats.map((f) => {
                            const refs = countReferences(f.id);
                            const isExpanded = expandedTiers.has(f.id);
                            const tierCount = f.durationTiers?.length ?? 0;
                            return (
                                <motion.div
                                    key={f.id}
                                    layout
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -8 }}
                                    className="rounded-xl bg-white border border-slate-200 overflow-hidden"
                                >
                                    <div className="flex items-center gap-3 px-3 py-2.5">
                                        <SportBadge sport={f.sport} iconOnly />
                                        <div className="flex-1 min-w-0">
                                            {editingLabelId === f.id ? (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editingLabelValue}
                                                        onChange={(e) => setEditingLabelValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") commitEditLabel();
                                                            if (e.key === "Escape") cancelEditLabel();
                                                        }}
                                                        className="flex-1 min-w-0 text-sm font-semibold text-slate-800 border border-[#1f7a4f]/50 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 bg-white"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={commitEditLabel}
                                                        className="p-1 text-[#1f7a4f] hover:bg-emerald-50 rounded-md transition-colors"
                                                        aria-label="Guardar"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditLabel}
                                                        className="p-1 text-slate-400 hover:bg-slate-100 rounded-md transition-colors"
                                                        aria-label="Cancelar"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                                        {f.label}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 font-mono">
                                                        {f.id}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditLabel(f)}
                                                        className="p-0.5 text-slate-300 hover:text-slate-600 transition-colors"
                                                        aria-label="Editar label"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                {f.playersPerTeam}v{f.playersPerTeam}
                                                {refs > 0 && (
                                                    <span className="ml-1.5 text-slate-500">
                                                        · {refs} referencia{refs !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {editingLabelId !== f.id && (
                                            <button
                                                onClick={() => removeFormat(f.id)}
                                                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                aria-label="Eliminar formato"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => toggleTiers(f.id)}
                                        className="w-full px-3 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <Tag className="w-3 h-3" />
                                            Tarifas por duración
                                            {tierCount > 0 && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-[#1f7a4f]/10 text-[#1f7a4f] text-[10px]">
                                                    {tierCount}
                                                </span>
                                            )}
                                        </span>
                                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                    </button>
                                    {isExpanded && (
                                        <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/50">
                                            <DurationTiersEditor
                                                tiers={f.durationTiers ?? []}
                                                slotBasePriceHint={getSlotBasePriceHint(f.id)}
                                                onChange={(tiers) => updateFormatTiers(f.id, tiers)}
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </AnimatePresence>
            )}

            {/* Form para agregar */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Agregar formato
                </h4>

                {/* Sport chips */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Deporte</label>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                        {SPORT_TYPES.map((s) => {
                            const selected = newSport === s;
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => handleSportChange(s)}
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${selected
                                        ? "bg-[#1f7a4f] text-white border-[#1f7a4f]"
                                        : "bg-white text-slate-600 border-slate-200"
                                        }`}
                                >
                                    {SPORT_LABELS[s]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Players per team */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                        Jugadores por equipo
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={20}
                        value={newPlayersPerTeam}
                        onChange={(e) => handlePlayersChange(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    />
                </div>

                {/* Label */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Label visible</label>
                    <input
                        type="text"
                        value={effectiveLabel}
                        onChange={(e) => {
                            setNewLabel(e.target.value);
                            setLabelEdited(true);
                        }}
                        placeholder="ej. Fútbol 5"
                        className="w-full px-3 py-2 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    />
                </div>

                {/* Id slug */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                        Id único (slug)
                    </label>
                    <input
                        type="text"
                        value={effectiveId}
                        onChange={(e) => {
                            setNewId(slugify(e.target.value));
                            setIdEdited(true);
                        }}
                        placeholder="ej. football_5v5"
                        className="w-full px-3 py-2 text-base font-mono border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                        Se auto-genera. Edítalo solo si necesitas un id distinto.
                    </p>
                </div>

                <button
                    onClick={addFormat}
                    className="w-full py-2.5 rounded-xl bg-[#1f7a4f] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#145c3a] active:scale-[0.98] transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Agregar formato
                </button>
            </div>
        </div>
    );
}
