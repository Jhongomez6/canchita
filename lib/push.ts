import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import { handleError } from "./utils/error";

export async function enablePushNotifications(uid: string) {
  try {
    // 1️⃣ Pedir permiso
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("🔕 Permiso de notificaciones denegado");
      return null;
    }

    // 2️⃣ Obtener token
    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });

    if (!token) {
      console.error("❌ No se pudo obtener el token FCM");
      return null;
    }

    // 3️⃣ Guardar token en Firestore
    await updateDoc(doc(db, "users", uid), {
      fcmTokens: arrayUnion(token),
      notificationsEnabled: true, // opcional, informativo
      lastNotificationOptInAt: new Date(),
    });

    // 4️⃣ Guardar estado LOCAL por device
    localStorage.setItem("push-enabled", "true");

    console.log("✅ Token FCM guardado:", token);
    return token;
  } catch (error: unknown) {
    handleError(error, "Error activando notificaciones push. Verifica los permisos de tu navegador.");
    return null;
  }
}
