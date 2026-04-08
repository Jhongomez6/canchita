import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import type { AvatarBlobs } from "./avatarProcessing";

/**
 * Sube un avatar en formato Data URL (Base64 WebP) a Firebase Storage.
 * Retorna la URL pública de descarga.
 * @deprecated Usar uploadAvatarBothSizes para nuevos uploads.
 */
export async function uploadAvatarBase64(uid: string, base64Data: string): Promise<string> {
  const storageRef = ref(storage, `avatars/${uid}.webp`);
  await uploadString(storageRef, base64Data, 'data_url');
  return await getDownloadURL(storageRef);
}

/**
 * Sube las dos variantes de avatar en paralelo.
 * Paths: avatars/{uid}_large.webp y avatars/{uid}_thumb.webp
 */
export async function uploadAvatarBothSizes(
  uid: string,
  blobs: AvatarBlobs
): Promise<{ largeURL: string; thumbURL: string }> {
  const largeRef = ref(storage, `avatars/${uid}_large.webp`);
  const thumbRef = ref(storage, `avatars/${uid}_thumb.webp`);

  await Promise.all([
    uploadString(largeRef, blobs.large, 'data_url'),
    uploadString(thumbRef, blobs.thumb, 'data_url'),
  ]);

  const [largeURL, thumbURL] = await Promise.all([
    getDownloadURL(largeRef),
    getDownloadURL(thumbRef),
  ]);

  return { largeURL, thumbURL };
}
