/**
 * ========================
 * AVATAR PROCESSING
 * ========================
 *
 * Módulo cliente — envía la imagen al API route /api/process-avatar
 * donde Sharp (server-side) garantiza encoding WebP real.
 *
 * Genera dos variantes:
 *   - large: 512×512 WebP
 *   - thumb: 96×96 WebP
 */

export interface AvatarBlobs {
    large: string; // data URL 512×512 WebP
    thumb: string; // data URL 96×96 WebP
}

async function callProcessAvatar(file: File, crop?: { x: number; y: number; width: number; height: number }): Promise<AvatarBlobs> {
    const formData = new FormData();
    formData.append("image", file);
    if (crop) {
        formData.append("x", String(Math.round(crop.x)));
        formData.append("y", String(Math.round(crop.y)));
        formData.append("width", String(Math.round(crop.width)));
        formData.append("height", String(Math.round(crop.height)));
    }
    const res = await fetch("/api/process-avatar", { method: "POST", body: formData });
    if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Error procesando imagen" }));
        throw new Error(error ?? "Error procesando imagen");
    }
    return res.json();
}

/**
 * Para el flujo de perfil: genera large + thumb desde un crop preciso.
 *
 * @param file     - Archivo original seleccionado por el usuario
 * @param cropArea - Área de recorte en píxeles del original { x, y, width, height }
 */
export async function generateAvatarSizes(
    file: File,
    cropArea: { x: number; y: number; width: number; height: number }
): Promise<AvatarBlobs> {
    return callProcessAvatar(file, cropArea);
}

/**
 * Para la migración de Google / Storage: genera large + thumb desde un Blob,
 * escalando la imagen completa sin recorte.
 *
 * @param blob - Blob o File de la imagen fuente
 */
export async function generateAvatarSizesFromBlob(blob: Blob): Promise<AvatarBlobs> {
    const file = blob instanceof File ? blob : new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" });
    return callProcessAvatar(file);
}

/**
 * @deprecated Usar generateAvatarSizesFromBlob.
 * Mantiene compatibilidad si algún caller pasa un data URL.
 */
export async function generateAvatarSizesFromDataURL(dataURL: string): Promise<AvatarBlobs> {
    const res = await fetch(dataURL);
    const blob = await res.blob();
    return generateAvatarSizesFromBlob(blob);
}
