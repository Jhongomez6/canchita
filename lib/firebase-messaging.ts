import { getMessaging, onMessage, isSupported } from "firebase/messaging";

export async function listenToPushMessages() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging();

  // Register the SW explicitly with a cache-busting query parameter
  // to force an update for all existing installed PWAs.
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js?v=2");
  }

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
