import { storage } from "./firebase";
import { ref, uploadString, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import type { AvatarBlobs } from "./avatarProcessing";

const WEBP_METADATA = { contentType: 'image/webp' };

/**
 * Sube un avatar en formato Data URL (Base64 WebP) a Firebase Storage.
 * Retorna la URL pública de descarga.
 * @deprecated Usar uploadAvatarBothSizes para nuevos uploads.
 */
export async function uploadAvatarBase64(uid: string, base64Data: string): Promise<string> {
  const storageRef = ref(storage, `avatars/${uid}.webp`);
  await uploadString(storageRef, base64Data, 'data_url', WEBP_METADATA);
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
    uploadString(largeRef, blobs.large, 'data_url', WEBP_METADATA),
    uploadString(thumbRef, blobs.thumb, 'data_url', WEBP_METADATA),
  ]);

  const [largeURL, thumbURL] = await Promise.all([
    getDownloadURL(largeRef),
    getDownloadURL(thumbRef),
  ]);

  return { largeURL, thumbURL };
}

export async function uploadVenueImage(venueId: string, dataUrl: string): Promise<string> {
  const storageRef = ref(storage, `venues/${venueId}/cover.webp`);
  await uploadString(storageRef, dataUrl, 'data_url', { contentType: 'image/webp' });
  return await getDownloadURL(storageRef);
}

// ========================
// PAYMENT PROOFS (comprobantes de abono)
// ========================

/**
 * Sube un comprobante de pago de una reserva al bucket.
 * Path: payment_proofs/{venueId}/{bookingId}_{timestamp}.jpg
 *
 * Lifecycle de 90 días: se borra automáticamente — la booking conserva la metadata.
 * Ref: docs/RESERVAS_PAGO_EXTERNO_SDD.md §4 (Storage Rules) y §2 (lifecycle).
 */
export async function uploadPaymentProof(
  venueId: string,
  bookingId: string,
  blob: Blob,
): Promise<{ url: string; path: string }> {
  const timestamp = Date.now();
  const path = `payment_proofs/${venueId}/${bookingId}_${timestamp}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

// ========================
// VENUE PAYMENT QR (QR de método de pago)
// ========================

/**
 * Sube el QR de un método de pago del venue.
 * Path: venue_payment_qrs/{venueId}/{paymentMethodId}.jpg
 * Solo Super Admin debe poder llamar esto (verificado por Storage Rules).
 */
export async function uploadPaymentMethodQR(
  venueId: string,
  paymentMethodId: string,
  blob: Blob,
): Promise<string> {
  const path = `venue_payment_qrs/${venueId}/${paymentMethodId}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return await getDownloadURL(storageRef);
}

/**
 * Borra el QR de un método de pago (cuando se elimina o reemplaza).
 * Idempotente: ignora errores si el archivo no existe.
 */
export async function deletePaymentMethodQR(
  venueId: string,
  paymentMethodId: string,
): Promise<void> {
  const path = `venue_payment_qrs/${venueId}/${paymentMethodId}.jpg`;
  const storageRef = ref(storage, path);
  try {
    await deleteObject(storageRef);
  } catch {
    // ignore — best effort
  }
}
