import { getMessaging, onMessage, isSupported } from "firebase/messaging";
import { app } from "./firebase";

// Shared SW registration promise — reused by push.ts to avoid duplicate registrations
let swRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

/**
 * Registers the Firebase Messaging service worker (singleton).
 * Cache-busting v3 forces update for existing PWA installs.
 */
export function getSwRegistration(): Promise<ServiceWorkerRegistration> | null {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker.register("/firebase-messaging-sw.js?v=3");
  }
  return swRegistrationPromise;
}

export async function listenToPushMessages() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging(app);

  // Register the SW via singleton
  await getSwRegistration();

  onMessage(messaging, (payload) => {
    console.log("[FCM] Foreground message received:", payload);

    const title = payload.notification?.title || "La Canchita";
    const body = payload.notification?.body || "";
    const url = payload.data?.url;

    // Show system notification so the user actually sees it
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: "/icons/icon-192x192.png",
          data: { url },
        });
      });
    }
  });
}
