"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "react-hot-toast";
import { validatePaymentProofFile, compressPaymentProof } from "@/lib/utils/imageCompression";
import { uploadVenueGalleryImage, deleteVenueGalleryImage } from "@/lib/storage";
import { handleError } from "@/lib/utils/error";
import { MAX_GALLERY_IMAGES } from "@/lib/domain/venue";

interface VenueGalleryEditorProps {
    venueId: string;
    value: string[];
    onChange: (next: string[]) => void;
}

/**
 * Editor de galería (solo Super Admin). Sube fotos a Firebase Storage
 * (comprimidas cliente-side), permite quitar y reordenar. Máx MAX_GALLERY_IMAGES.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §9.
 */
export default function VenueGalleryEditor({ venueId, value, onChange }: VenueGalleryEditorProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const atMax = value.length >= MAX_GALLERY_IMAGES;

    const handleFile = async (file: File) => {
        try {
            validatePaymentProofFile(file);
            setUploading(true);
            // Galería: mayor calidad que un comprobante (foto de marketing).
            const { blob } = await compressPaymentProof(file, {
                maxDimension: 1600,
                quality: 0.8,
                targetMaxBytes: 1_500_000,
                minQuality: 0.6,
            });
            const { url } = await uploadVenueGalleryImage(venueId, blob);
            onChange([...value, url]);
            toast.success("Foto agregada");
        } catch (err) {
            handleError(err, "No pudimos subir la foto");
        } finally {
            setUploading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
        e.target.value = "";
    };

    const remove = (idx: number) => {
        const url = value[idx];
        onChange(value.filter((_, i) => i !== idx));
        // Best-effort: borra el objeto de Storage (no bloquea la UI).
        void deleteVenueGalleryImage(url);
    };

    const move = (idx: number, dir: -1 | 1) => {
        const target = idx + dir;
        if (target < 0 || target >= value.length) return;
        const next = [...value];
        [next[idx], next[target]] = [next[target], next[idx]];
        onChange(next);
    };

    return (
        <div>
            <div className="grid grid-cols-3 gap-2">
                {value.map((url, idx) => (
                    <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group">
                        <Image unoptimized src={url} alt={`Foto ${idx + 1}`} fill className="object-cover" />
                        <button
                            type="button"
                            onClick={() => remove(idx)}
                            className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white"
                            aria-label="Quitar foto"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute bottom-1 left-1 right-1 flex justify-between">
                            <button
                                type="button"
                                onClick={() => move(idx, -1)}
                                disabled={idx === 0}
                                className="w-6 h-6 bg-white/85 rounded-full flex items-center justify-center text-slate-700 disabled:opacity-0"
                                aria-label="Mover a la izquierda"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => move(idx, 1)}
                                disabled={idx === value.length - 1}
                                className="w-6 h-6 bg-white/85 rounded-full flex items-center justify-center text-slate-700 disabled:opacity-0"
                                aria-label="Mover a la derecha"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}

                {!atMax && (
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-[#1f7a4f]/40 transition-colors disabled:opacity-60"
                    >
                        {uploading ? (
                            <Loader2 className="w-6 h-6 animate-spin text-[#1f7a4f]" />
                        ) : (
                            <>
                                <Plus className="w-6 h-6" />
                                <span className="text-[11px]">Agregar</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleChange}
            />
            <p className="text-[11px] text-slate-400 mt-2">
                Hasta {MAX_GALLERY_IMAGES} fotos · se comprimen y suben al toque. La portada se configura arriba.
            </p>
        </div>
    );
}
