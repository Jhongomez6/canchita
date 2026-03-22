import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";
import { handleError } from "./utils/error";
import { getSwRegistration } from "./firebase-messaging";

export async function enablePushNotifications(uid: string) {
  try {
    // 1️⃣ Validate VAPID key exists
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error("❌ NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set. Push notifications will not work.");
      return null;
    }

    // 2️⃣ Pedir permiso
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("🔕 Permiso de notificaciones denegado");
      return null;
    }

    // 3️⃣ Obtener token usando SW compartido
    const messaging = getMessaging(app);

    // Reuse the singleton SW registration from firebase-messaging.ts
    const swRegistration = await getSwRegistration();

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration || undefined,
    });

    if (!token) {
      console.error("❌ No se pudo obtener el token FCM (getToken returned null)");
      return null;
    }

    // 4️⃣ Guardar token en Firestore + diagnostics
    await updateDoc(doc(db, "users", uid), {
      fcmTokens: arrayUnion(token),
      notificationsEnabled: true,
      lastNotificationOptInAt: new Date(),
      lastTokenRefresh: new Date().toISOString(),
      lastTokenDevice: navigator.userAgent.substring(0, 100),
      lastTokenPrefix: token.substring(0, 30),
    });

    console.log("✅ Token FCM guardado:", token.substring(0, 20) + "...");
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
