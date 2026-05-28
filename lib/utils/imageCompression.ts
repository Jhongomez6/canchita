/**
 * ========================
 * IMAGE COMPRESSION (CLIENT-SIDE)
 * ========================
 *
 * Compresión vía canvas. Reduce el peso del comprobante antes del upload
 * para mantener costos de Storage despreciables a escala (~150KB típico).
 *
 * Ref: docs/RESERVAS_PAGO_EXTERNO_SDD.md §2 (Storage costs)
 */

import { ValidationError } from "@/lib/domain/errors";
import { MAX_PAYMENT_PROOF_BYTES } from "@/lib/domain/booking";

/** Tipos MIME aceptados como input. */
const ACCEPTED_MIME_PREFIXES = ["image/"] as const;

/** Máximo tamaño del archivo ORIGINAL antes de compresión (≤ 10MB para evitar OOM). */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export interface CompressionOptions {
    /** Lado máximo de la imagen (px). Default 1024. */
    maxDimension?: number;
    /** Calidad JPEG 0-1. Default 0.7. */
    quality?: number;
    /** Si el resultado supera este tamaño, retry con menor calidad. */
    targetMaxBytes?: number;
    /** Calidad mínima del retry. Default 0.5. */
    minQuality?: number;
}

export interface CompressionResult {
    blob: Blob;
    sizeBytes: number;
    width: number;
    height: number;
    appliedQuality: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
    maxDimension: 1024,
    quality: 0.7,
    targetMaxBytes: MAX_PAYMENT_PROOF_BYTES,
    minQuality: 0.5,
};

/**
 * Verifica que el archivo sea una imagen aceptable.
 * Lanza ValidationError con mensaje claro al usuario.
 */
export function validatePaymentProofFile(file: File): void {
    if (!file) {
        throw new ValidationError("Selecciona un archivo");
    }
    const accepted = ACCEPTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));
    if (!accepted) {
        throw new ValidationError("Solo se aceptan imágenes (JPG, PNG, etc.)");
    }
    if (file.size > MAX_INPUT_BYTES) {
        throw new ValidationError(
            `La imagen original supera 10MB. Tomá una foto más pequeña.`,
        );
    }
}

/**
 * Carga un File en un HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No se pudo cargar la imagen"));
        };
        img.src = url;
    });
}

/**
 * Calcula las dimensiones finales preservando aspect ratio.
 */
function fitDimensions(
    width: number,
    height: number,
    maxDimension: number,
): { width: number; height: number } {
    if (width <= maxDimension && height <= maxDimension) {
        return { width, height };
    }
    const ratio = width / height;
    if (width >= height) {
        return { width: maxDimension, height: Math.round(maxDimension / ratio) };
    }
    return { width: Math.round(maxDimension * ratio), height: maxDimension };
}

/**
 * Render del image a canvas + export como JPEG con la calidad indicada.
 */
function canvasToJpegBlob(
    img: HTMLImageElement,
    width: number,
    height: number,
    quality: number,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            reject(new Error("Canvas no soportado"));
            return;
        }
        // Fondo blanco para PNG con transparencia (los comprobantes nunca son transparentes en uso real)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("No se pudo generar la imagen comprimida"));
                    return;
                }
                resolve(blob);
            },
            "image/jpeg",
            quality,
        );
    });
}

/**
 * Comprime una imagen para usarla como comprobante de pago.
 *
 * - Reduce a maxDimension (default 1024px lado largo).
 * - Convierte a JPEG con la calidad indicada.
 * - Si el resultado supera targetMaxBytes, reintenta con quality -0.1 (mínimo minQuality).
 * - Lanza ValidationError si después de todos los reintentos sigue siendo demasiado grande.
 */
export async function compressPaymentProof(
    file: File,
    options?: CompressionOptions,
): Promise<CompressionResult> {
    validatePaymentProofFile(file);
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const img = await loadImage(file);
    const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, opts.maxDimension);

    let quality = opts.quality;
    let blob = await canvasToJpegBlob(img, width, height, quality);

    // Retry con calidad menor si excede target
    while (blob.size > opts.targetMaxBytes && quality > opts.minQuality) {
        quality = Math.max(opts.minQuality, +(quality - 0.1).toFixed(2));
        blob = await canvasToJpegBlob(img, width, height, quality);
    }

    if (blob.size > opts.targetMaxBytes) {
        throw new ValidationError(
            `No pudimos comprimir el comprobante por debajo de ${Math.round(opts.targetMaxBytes / 1024)} KB. ` +
            `Intentá con otra foto más liviana.`,
        );
    }

    return {
        blob,
        sizeBytes: blob.size,
        width,
        height,
        appliedQuality: quality,
    };
}
