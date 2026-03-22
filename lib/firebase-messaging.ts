import { getMessaging, onMessage, isSupported } from "firebase/messaging";
import { app } from "./firebase";

// Shared SW registration promise — reused by push.ts to avoid duplicate registrations
let swRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

const CURRENT_SW_URL = "/firebase-messaging-sw.js?v=4";

/**
 * Cleans up old/duplicate service worker registrations that may
 * intercept FCM messages with outdated code.
 */
async function cleanupOldServiceWorkers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    const scriptURL = reg.active?.scriptURL || reg.installing?.scriptURL || "";
    // Keep only our current versioned SW
    if (scriptURL && !scriptURL.includes("?v=4")) {
      console.log("[FCM] Unregistering old SW:", scriptURL);
      await reg.unregister();
    }
  }
}

/**
 * Registers the Firebase Messaging service worker (singleton).
 * Cache-busting v3 forces update for existing PWA installs.
 * Also cleans up old/duplicate SWs first.
 */
export function getSwRegistration(): Promise<ServiceWorkerRegistration> | null {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  if (!swRegistrationPromise) {
    swRegistrationPromise = (async () => {
      await cleanupOldServiceWorkers();
      return navigator.serviceWorker.register(CURRENT_SW_URL);
    })();
  }
  return swRegistrationPromise;
}

export async function listenToPushMessages() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging(app);

  // Register the SW via singleton (also cleans up old SWs)
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
