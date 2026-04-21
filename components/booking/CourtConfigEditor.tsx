"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { COURT_FORMATS } from "@/lib/domain/venue";
import type { Court, CourtCombo, CourtFormat } from "@/lib/domain/venue";

interface CourtConfigEditorProps {
    courts: Court[];
    combos: CourtCombo[];
    onCourtsChange: (courts: Court[]) => void;
    onCombosChange: (combos: CourtCombo[]) => void;
}

export default function CourtConfigEditor({
    courts,
    combos,
    onCourtsChange,
    onCombosChange,
}: CourtConfigEditorProps) {
    const [newCourtName, setNewCourtName] = useState("");
    const [newCourtFormat, setNewCourtFormat] = useState<CourtFormat>("6v6");

    // New combo state
    const [newComboName, setNewComboName] = useState("");
    const [newComboFormat, setNewComboFormat] = useState<CourtFormat>("9v9");
    const [newComboCourtIds, setNewComboCourtIds] = useState<string[]>([]);

    const addCourt = () => {
        if (!newCourtName.trim()) return;
        const newCourt: Court = {
            id: `court_${Date.now()}`,
            name: newCourtName.trim(),
            baseFormat: newCourtFormat,
            active: true,
            sortOrder: courts.length,
        };
        onCourtsChange([...courts, newCourt]);
        setNewCourtName("");
    };

    const removeCourt = (courtId: string) => {
        onCourtsChange(courts.filter((c) => c.id !== courtId));
        // Also remove from combos
        onCombosChange(
            combos
                .map((combo) => ({
                    ...combo,
                    courtIds: combo.courtIds.filter((id) => id !== courtId),
                }))
                .filter((combo) => combo.courtIds.length >= 2)
        );
    };

    const toggleCourtActive = (courtId: string) => {
        onCourtsChange(
            courts.map((c) => (c.id === courtId ? { ...c, active: !c.active } : c))
        );
    };

    const addCombo = () => {
        if (!newComboName.trim() || newComboCourtIds.length < 2) return;
        const newCombo: CourtCombo = {
            id: `combo_${Date.now()}`,
            name: newComboName.trim(),
            courtIds: [...newComboCourtIds],
            resultingFormat: newComboFormat,
            active: true,
        };
        onCombosChange([...combos, newCombo]);
        setNewComboName("");
        setNewComboCourtIds([]);
    };

    const removeCombo = (comboId: string) => {
        onCombosChange(combos.filter((c) => c.id !== comboId));
    };

    const toggleComboCourtId = (courtId: string) => {
        setNewComboCourtIds((prev) =>
            prev.includes(courtId) ? prev.filter((id) => id !== courtId) : [...prev, courtId]
        );
    };

    return (
        <div className="space-y-6">
            {/* Courts section */}
            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Canchas físicas</h3>

                {courts.length === 0 && (
                    <p className="text-sm text-slate-400 mb-3">No hay canchas configuradas</p>
                )}

                <div className="space-y-2 mb-3">
                    {courts.map((court) => (
                        <div
                            key={court.id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${court.active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-60"}`}
                        >
                            <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-slate-700">{court.name}</span>
                                <span className="text-xs text-slate-400 ml-2">{court.baseFormat}</span>
                            </div>
                            <button
                                onClick={() => toggleCourtActive(court.id)}
                                className={`text-xs px-2 py-0.5 rounded-full border ${court.active ? "text-emerald-600 border-emerald-200 bg-emerald-50" : "text-slate-400 border-slate-200"}`}
                            >
                                {court.active ? "Activa" : "Inactiva"}
                            </button>
                            <button
                                onClick={() => removeCourt(court.id)}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Add court form */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newCourtName}
                        onChange={(e) => setNewCourtName(e.target.value)}
                        placeholder="Nombre (ej: Cancha 1)"
                        className="flex-1 px-3 py-2 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    />
                    <select
                        value={newCourtFormat}
                        onChange={(e) => setNewCourtFormat(e.target.value as CourtFormat)}
                        className="px-3 py-2 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                    >
                        {COURT_FORMATS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                    <button
                        onClick={addCourt}
                        disabled={!newCourtName.trim()}
                        className="p-2 bg-[#1f7a4f] text-white rounded-xl disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Combos section */}
            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Combinaciones</h3>
                <p className="text-xs text-slate-400 mb-3">
                    Combina canchas para formar formatos más grandes (ej: 2 canchas de 6v6 = 1 de 9v9)
                </p>

                {combos.length === 0 && courts.length < 2 && (
                    <p className="text-sm text-slate-400 mb-3">Agrega al menos 2 canchas para crear combinaciones</p>
                )}

                <div className="space-y-2 mb-3">
                    {combos.map((combo) => (
                        <div
                            key={combo.id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white border-slate-200"
                        >
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-slate-700">{combo.name}</span>
                                <span className="text-xs text-slate-400 ml-2">
                                    {combo.courtIds.map((id) => courts.find((c) => c.id === id)?.name || id).join(" + ")} = {combo.resultingFormat}
                                </span>
                            </div>
                            <button
                                onClick={() => removeCombo(combo.id)}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Add combo form */}
                {courts.length >= 2 && (
                    <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <input
                            type="text"
                            value={newComboName}
                            onChange={(e) => setNewComboName(e.target.value)}
                            placeholder="Nombre combo (ej: Cancha Grande A)"
                            className="w-full px-3 py-2 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                        />
                        <div className="flex flex-wrap gap-2">
                            {courts.filter((c) => c.active).map((court) => (
                                <button
                                    key={court.id}
                                    onClick={() => toggleComboCourtId(court.id)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${newComboCourtIds.includes(court.id)
                                        ? "bg-[#1f7a4f] text-white border-[#1f7a4f]"
                                        : "bg-white text-slate-600 border-slate-200"
                                        }`}
                                >
                                    {court.name}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 items-center">
                            <span className="text-xs text-slate-500">Formato resultante:</span>
                            <select
                                value={newComboFormat}
                                onChange={(e) => setNewComboFormat(e.target.value as CourtFormat)}
                                className="px-2 py-1 text-base border border-slate-200 rounded-lg focus:outline-none"
                            >
                                {COURT_FORMATS.map((f) => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                            <button
                                onClick={addCombo}
                                disabled={!newComboName.trim() || newComboCourtIds.length < 2}
                                className="ml-auto px-4 py-1.5 text-xs font-bold bg-[#1f7a4f] text-white rounded-lg disabled:bg-slate-200 disabled:text-slate-400"
                            >
                                Agregar combo
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
