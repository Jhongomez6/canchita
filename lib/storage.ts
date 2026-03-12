import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

/**
 * Sube un avatar en formato Data URL (Base64 WebP) a Firebase Storage.
 * Retorna la URL pública de descarga.
 */
export async function uploadAvatarBase64(uid: string, base64Data: string): Promise<string> {
  // Guardamos en la carpeta avatars/ y usamos webp
  const storageRef = ref(storage, `avatars/${uid}.webp`);
  
  // Usamos uploadString con el formato data_url que intercepta Base64
  await uploadString(storageRef, base64Data, 'data_url');
  
  // Retorna el enlace público "https://firebasestorage.googleapis..."
  return await getDownloadURL(storageRef);
}
