/**
 * POST /api/process-avatar
 *
 * Procesa una imagen server-side con Sharp y devuelve dos variantes WebP:
 *   - large: 512×512
 *   - thumb: 96×96
 *
 * Body: multipart/form-data
 *   - image: File
 *   - x, y, width, height: área de recorte en píxeles (opcionales — 0 = sin recorte)
 *
 * Response: { large: string (data URL), thumb: string (data URL) }
 */

import sharp from "sharp";
import { NextRequest } from "next/server";

const LARGE_SIZE = 512;
const THUMB_SIZE = 96;
const WEBP_QUALITY = 85;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return Response.json({ error: "Campo 'image' requerido" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Imagen demasiado grande (máx 5 MB)" }, { status: 413 });
  }

  const x = Math.round(Number(formData.get("x")) || 0);
  const y = Math.round(Number(formData.get("y")) || 0);
  const width = Math.round(Number(formData.get("width")) || 0);
  const height = Math.round(Number(formData.get("height")) || 0);

  const buffer = Buffer.from(await file.arrayBuffer());
  let pipeline = sharp(buffer).rotate(); // auto-orient EXIF

  if (width > 0 && height > 0) {
    pipeline = pipeline.extract({ left: x, top: y, width, height });
  }

  const [largeBuffer, thumbBuffer] = await Promise.all([
    pipeline.clone().resize(LARGE_SIZE, LARGE_SIZE, { fit: "cover" }).webp({ quality: WEBP_QUALITY }).toBuffer(),
    pipeline.clone().resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" }).webp({ quality: WEBP_QUALITY }).toBuffer(),
  ]);

  return Response.json({
    large: `data:image/webp;base64,${largeBuffer.toString("base64")}`,
    thumb: `data:image/webp;base64,${thumbBuffer.toString("base64")}`,
  });
}
