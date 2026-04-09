/**
 * ========================
 * AVATAR MIGRATION
 * ========================
 *
 * Migración automática de fotos de Google → Firebase Storage.
 * Se ejecuta fire & forget en el login, sin bloquear la UI.
 */

import { generateAvatarSizesFromBlob } from "./avatarProcessing";
import { uploadAvatarBothSizes } from "./storage";
import { updateUserPhotoURLs } from "./users";
import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

const WEBP_METADATA = { contentType: 'image/webp' };

// Guard: evita lanzar migraciones en paralelo para el mismo uid
const migrating = new Set<string>();

/**
 * Si el usuario tiene una URL de Google en photoURL y no tiene photoURLThumb,
 * descarga la imagen via proxy, genera las dos variantes WebP y las guarda
 * en Firebase Storage + Firestore.
 *
 * Falla silenciosamente — no lanza errores al caller.
 */
export async function migrateGooglePhotoToStorage(
  uid: string,
  googleURL: string
): Promise<void> {
  if (migrating.has(uid)) return;
  migrating.add(uid);
  try {
    const proxyURL = `/api/proxy-image?url=${encodeURIComponent(googleURL)}`;
    const response = await fetch(proxyURL);
    if (!response.ok) throw new Error(`Proxy respondió ${response.status}`);

    const blob = await response.blob();
    const blobs = await generateAvatarSizesFromBlob(blob);

    const { largeURL, thumbURL } = await uploadAvatarBothSizes(uid, blobs);
    await updateUserPhotoURLs(uid, largeURL, thumbURL);
  } catch (err) {
    console.error("[avatarMigration] Error migrando foto de Google:", err);
  } finally {
    migrating.delete(uid);
  }
}

/**
 * Para usuarios que ya tienen foto en Firebase Storage (path legacy avatars/{uid}.webp)
 * pero no tienen photoURLThumb. Genera solo el thumb sin re-subir el large.
 *
 * Falla silenciosamente — no lanza errores al caller.
 */
export async function generateThumbFromStorageURL(
  uid: string,
  storageURL: string
): Promise<void> {
  if (migrating.has(uid)) return;
  migrating.add(uid);
  try {
    const response = await fetch(storageURL);
    if (!response.ok) throw new Error(`Storage respondió ${response.status}`);

    const blob = await response.blob();
    const blobs = await generateAvatarSizesFromBlob(blob);

    const thumbRef = ref(storage, `avatars/${uid}_thumb.webp`);
    await uploadString(thumbRef, blobs.thumb, 'data_url', WEBP_METADATA);
    const thumbURL = await getDownloadURL(thumbRef);

    await updateUserPhotoURLs(uid, storageURL, thumbURL);
  } catch (err) {
    console.error("[avatarMigration] Error generando thumb desde Storage:", err);
  } finally {
    migrating.delete(uid);
  }
}
