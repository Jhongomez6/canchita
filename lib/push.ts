import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";
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

    // Explicit SW registration to bypass browser cache for existing PWA users
    let swRegistration;
    if ("serviceWorker" in navigator) {
      swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js?v=2");
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
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

export async function requestManualReminder(matchId: string) {
  try {
    const functions = getFunctions(app);
    const sendReminder = httpsCallable<{ matchId: string }, { success: boolean, sentTokens: number }>(functions, "sendManualReminder");
    const result = await sendReminder({ matchId });
    return result.data;
  } catch (error: unknown) {
    handleError(error, "Error al enviar recordatorio manual.");
    throw error;
  }
}

export async function triggerMvpNotification(matchId: string) {
  try {
    const functions = getFunctions(app);
    const sendMvpNotification = httpsCallable<{ matchId: string }, { success: boolean, message: string }>(functions, "sendMvpWinnerNotification");
    const result = await sendMvpNotification({ matchId });
    return result.data;
  } catch (error: unknown) {
    console.error("Silenced Error triggering MVP notification (idempotency safety):", error);
    // Silent fail in UI as this is a background opportunistic job triggered by the client
    return null;
  }
}
