"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, X, Loader2, Upload, ImageOff } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    PAYMENT_METHOD_TYPES,
    PAYMENT_METHOD_LABELS,
    PAYMENT_METHOD_LABEL_MAX,
    PAYMENT_METHOD_HOLDER_MAX,
    PAYMENT_METHOD_IDENTIFIER_MAX,
    PAYMENT_METHOD_INSTRUCTIONS_MAX,
    MAX_PAYMENT_METHODS_PER_VENUE,
    validatePaymentMethod,
} from "@/lib/domain/venue";
import type { PaymentMethod, PaymentMethodType } from "@/lib/domain/venue";
import { uploadPaymentMethodQR, deletePaymentMethodQR } from "@/lib/storage";
import { compressPaymentProof } from "@/lib/utils/imageCompression";
import { handleError } from "@/lib/utils/error";

interface PaymentMethodEditorProps {
    venueId: string;
    methods: PaymentMethod[];
    /** True si el usuario actual puede editar (Super Admin). Si false, render read-only. */
    canEdit: boolean;
    onChange: (methods: PaymentMethod[]) => void;
}

const TYPE_PLACEHOLDERS: Record<PaymentMethodType, string> = {
    nequi: "Ej: 3112345678",
    bancolombia: "Ej: 1234-5678-9012",
    daviplata: "Ej: 3112345678",
    llave: "Llave Bre-B (@alias, teléfono, cédula)",
    transfer: "Número de cuenta",
    other: "Identificador",
};

const TYPE_HELPERS: Record<PaymentMethodType, string | null> = {
    nequi: null,
    bancolombia: null,
    daviplata: null,
    llave: "Llave Bre-B para transferencias inmediatas (Bancolombia/Nequi/Daviplata/etc.).",
    transfer: null,
    other: null,
};

function uuid(): string {
    return `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function PaymentMethodEditor({ venueId, methods, canEdit, onChange }: PaymentMethodEditorProps) {
    const [editing, setEditing] = useState<PaymentMethod | null>(null);
    const [isNew, setIsNew] = useState(false);

    const openNew = () => {
        if (methods.length >= MAX_PAYMENT_METHODS_PER_VENUE) {
            toast.error(`Máximo ${MAX_PAYMENT_METHODS_PER_VENUE} métodos de pago`);
            return;
        }
        const draft: PaymentMethod = {
            id: uuid(),
            type: "nequi",
            label: "",
            accountHolderName: "",
            accountIdentifier: "",
            active: true,
            sortOrder: methods.length,
        };
        setEditing(draft);
        setIsNew(true);
    };

    const openEdit = (m: PaymentMethod) => {
        setEditing({ ...m });
        setIsNew(false);
    };

    const closeSheet = () => {
        setEditing(null);
        setIsNew(false);
    };

    const handleSave = (saved: PaymentMethod) => {
        const next = isNew
            ? [...methods, saved]
            : methods.map((m) => (m.id === saved.id ? saved : m));
        onChange(next);
        closeSheet();
    };

    const handleDelete = async (m: PaymentMethod) => {
        if (m.qrImageURL) {
            // best-effort cleanup
            await deletePaymentMethodQR(venueId, m.id);
        }
        onChange(methods.filter((x) => x.id !== m.id));
    };

    const handleToggleActive = (m: PaymentMethod) => {
        onChange(methods.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)));
    };

    if (!canEdit) {
        // Read-only view para Location Admin
        return (
            <div className="space-y-3">
                {methods.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">
                        Aún no hay métodos de pago configurados.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {methods.map((m) => (
                            <MethodRow key={m.id} method={m} readOnly />
                        ))}
                    </div>
                )}
                <p className="text-xs text-slate-400 italic">
                    Solo el Super Admin puede modificar los métodos de pago. Contacta al equipo
                    si necesitas cambios.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {methods.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                    <p className="text-sm text-slate-500 mb-3">No hay métodos de pago configurados.</p>
                    <button
                        onClick={openNew}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1f7a4f] text-white text-sm font-semibold hover:bg-[#16603c]"
                    >
                        <Plus className="w-4 h-4" /> Agregar método
                    </button>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {methods.map((m) => (
                            <MethodRow
                                key={m.id}
                                method={m}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                                onToggleActive={handleToggleActive}
                            />
                        ))}
                    </div>
                    {methods.length < MAX_PAYMENT_METHODS_PER_VENUE && (
                        <button
                            onClick={openNew}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-[#1f7a4f] hover:text-[#1f7a4f] transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Agregar método
                        </button>
                    )}
                </>
            )}

            <AnimatePresence>
                {editing && (
                    <MethodSheet
                        venueId={venueId}
                        method={editing}
                        isNew={isNew}
                        onClose={closeSheet}
                        onSave={handleSave}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// MethodRow
// ────────────────────────────────────────────────────────────────────────────

interface MethodRowProps {
    method: PaymentMethod;
    readOnly?: boolean;
    onEdit?: (m: PaymentMethod) => void;
    onDelete?: (m: PaymentMethod) => void;
    onToggleActive?: (m: PaymentMethod) => void;
}

function MethodRow({ method, readOnly, onEdit, onDelete, onToggleActive }: MethodRowProps) {
    return (
        <div className={`bg-white border rounded-xl p-3 ${method.active ? "border-slate-200" : "border-slate-100 bg-slate-50/50 opacity-70"}`}>
            <div className="flex items-center gap-3">
                {method.qrImageURL ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 bg-white">
                        <Image src={method.qrImageURL} alt="QR" width={48} height={48} className="w-full h-full object-cover" unoptimized />
                    </div>
                ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <ImageOff className="w-4 h-4 text-slate-300" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{method.label}</p>
                    <p className="text-xs text-slate-500 truncate">
                        {method.accountHolderName} · {method.accountIdentifier}
                    </p>
                </div>
                {!readOnly && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={() => onToggleActive?.(method)}
                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                                method.active
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                        >
                            {method.active ? "Activo" : "Inactivo"}
                        </button>
                        <button
                            onClick={() => onEdit?.(method)}
                            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                            aria-label="Editar"
                        >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        <button
                            onClick={() => onDelete?.(method)}
                            className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center"
                            aria-label="Eliminar"
                        >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// MethodSheet (form add/edit)
// ────────────────────────────────────────────────────────────────────────────

interface MethodSheetProps {
    venueId: string;
    method: PaymentMethod;
    isNew: boolean;
    onClose: () => void;
    onSave: (m: PaymentMethod) => void;
}

function MethodSheet({ venueId, method, isNew, onClose, onSave }: MethodSheetProps) {
    const [draft, setDraft] = useState<PaymentMethod>(method);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const set = <K extends keyof PaymentMethod>(key: K, value: PaymentMethod[K]) => {
        setDraft((d) => ({ ...d, [key]: value }));
    };

    const handleUploadQR = async (file: File) => {
        setUploading(true);
        try {
            const result = await compressPaymentProof(file, { maxDimension: 512, quality: 0.85 });
            const url = await uploadPaymentMethodQR(venueId, draft.id, result.blob);
            set("qrImageURL", url);
            toast.success("QR subido");
        } catch (err) {
            handleError(err, "No pudimos subir el QR");
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveQR = async () => {
        await deletePaymentMethodQR(venueId, draft.id);
        set("qrImageURL", undefined);
        toast.success("QR eliminado");
    };

    const handleSave = () => {
        try {
            const candidate: PaymentMethod = {
                ...draft,
                label: draft.label.trim(),
                accountHolderName: draft.accountHolderName.trim(),
                accountIdentifier: draft.accountIdentifier.trim(),
                instructions: draft.instructions?.trim() || undefined,
            };
            validatePaymentMethod(candidate);
            setSaving(true);
            onSave(candidate);
        } catch (err) {
            handleError(err, "Datos inválidos");
            setSaving(false);
        }
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/40 z-[60]"
            />
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[92vh] flex flex-col"
            >
                <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800">
                        {isNew ? "Agregar método de pago" : "Editar método"}
                    </h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                <div className="overflow-y-auto p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
                    {/* Tipo */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            Tipo
                        </label>
                        <select
                            value={draft.type}
                            onChange={(e) => set("type", e.target.value as PaymentMethodType)}
                            className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                        >
                            {PAYMENT_METHOD_TYPES.map((t) => (
                                <option key={t} value={t}>{PAYMENT_METHOD_LABELS[t]}</option>
                            ))}
                        </select>
                        {TYPE_HELPERS[draft.type] && (
                            <p className="text-xs text-slate-500 mt-1">{TYPE_HELPERS[draft.type]}</p>
                        )}
                    </div>

                    {/* Label */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            Etiqueta visible
                        </label>
                        <input
                            type="text"
                            value={draft.label}
                            onChange={(e) => set("label", e.target.value)}
                            placeholder={`Ej: ${PAYMENT_METHOD_LABELS[draft.type]}`}
                            maxLength={PAYMENT_METHOD_LABEL_MAX}
                            className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                        />
                    </div>

                    {/* Holder */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            Nombre del titular
                        </label>
                        <input
                            type="text"
                            value={draft.accountHolderName}
                            onChange={(e) => set("accountHolderName", e.target.value)}
                            placeholder="Ej: María García"
                            maxLength={PAYMENT_METHOD_HOLDER_MAX}
                            className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                        />
                    </div>

                    {/* Identifier */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            {draft.type === "llave" ? "Llave" : "Número / cuenta"}
                        </label>
                        <input
                            type="text"
                            value={draft.accountIdentifier}
                            onChange={(e) => set("accountIdentifier", e.target.value)}
                            placeholder={TYPE_PLACEHOLDERS[draft.type]}
                            maxLength={PAYMENT_METHOD_IDENTIFIER_MAX}
                            className="w-full px-3 py-2.5 text-base font-mono border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                        />
                    </div>

                    {/* Instructions */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            Instrucciones (opcional)
                        </label>
                        <textarea
                            value={draft.instructions ?? ""}
                            onChange={(e) => set("instructions", e.target.value || undefined)}
                            placeholder="Ej: Envía como Nequi normal"
                            maxLength={PAYMENT_METHOD_INSTRUCTIONS_MAX}
                            rows={2}
                            className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50 resize-none"
                        />
                    </div>

                    {/* QR upload */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            QR (opcional)
                        </label>
                        {draft.qrImageURL ? (
                            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                                <Image
                                    src={draft.qrImageURL}
                                    alt="QR"
                                    width={64}
                                    height={64}
                                    className="rounded-lg border border-slate-200"
                                    unoptimized
                                />
                                <button
                                    onClick={handleRemoveQR}
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                                >
                                    Eliminar QR
                                </button>
                            </div>
                        ) : (
                            <>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleUploadQR(f);
                                        e.target.value = "";
                                    }}
                                />
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-[#1f7a4f] hover:text-[#1f7a4f] transition-colors disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    Subir QR
                                </button>
                            </>
                        )}
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center justify-between py-1">
                        <span className="text-sm font-medium text-slate-700">Activo</span>
                        <button
                            onClick={() => set("active", !draft.active)}
                            className={`w-11 h-6 rounded-full transition-colors relative ${draft.active ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                        >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.active ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || uploading}
                        className="flex-1 py-3 rounded-xl bg-[#1f7a4f] text-white text-sm font-bold hover:bg-[#16603c] transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isNew ? "Agregar" : "Guardar"}
                    </button>
                </div>
            </motion.div>
        </>
    );
}
