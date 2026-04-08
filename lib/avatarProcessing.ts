/**
 * ========================
 * AVATAR PROCESSING
 * ========================
 *
 * Módulo cliente puro — solo canvas API, sin Firebase.
 * Genera dos variantes WebP de una imagen de perfil:
 *   - large: 512×512 (FIFA card, perfil)
 *   - thumb: 96×96 (avatares en listas)
 */

export interface AvatarBlobs {
    large: string; // data URL 512×512 WebP 0.85
    thumb: string; // data URL 96×96 WebP 0.85
}

const LARGE_SIZE = 512;
const THUMB_SIZE = 96;
const WEBP_QUALITY = 0.85;

function drawToCanvas(
    img: HTMLImageElement,
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
    targetSize: number
): string {
    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo obtener el contexto del canvas");
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetSize, targetSize);
    return canvas.toDataURL("image/webp", WEBP_QUALITY);
}

/**
 * Para el flujo de perfil: genera large + thumb desde un crop preciso.
 *
 * @param img      - HTMLImageElement ya cargado
 * @param cropArea - Área de recorte en píxeles del original { x, y, width, height }
 */
export async function generateAvatarSizes(
    img: HTMLImageElement,
    cropArea: { x: number; y: number; width: number; height: number }
): Promise<AvatarBlobs> {
    const { x, y, width, height } = cropArea;
    return {
        large: drawToCanvas(img, x, y, width, height, LARGE_SIZE),
        thumb: drawToCanvas(img, x, y, width, height, THUMB_SIZE),
    };
}

/**
 * Para la migración de Google: genera large + thumb desde un data URL,
 * escalando la imagen completa sin recorte.
 *
 * @param dataURL - Data URL o object URL de la imagen fuente
 */
export async function generateAvatarSizesFromDataURL(
    dataURL: string
): Promise<AvatarBlobs> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const blobs = {
                    large: drawToCanvas(img, 0, 0, img.naturalWidth, img.naturalHeight, LARGE_SIZE),
                    thumb: drawToCanvas(img, 0, 0, img.naturalWidth, img.naturalHeight, THUMB_SIZE),
                };
                resolve(blobs);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
        img.src = dataURL;
    });
}
