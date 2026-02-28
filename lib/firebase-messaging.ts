import { getMessaging, onMessage, isSupported } from "firebase/messaging";

export async function listenToPushMessages() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging();

  onMessage(messaging, (payload) => {
    console.log("[FCM] Foreground message received:", payload);

    const title = payload.notification?.title || "La Canchita";
    const body = payload.notification?.body || "";
    const url = payload.data?.url;

    // Show system notification so the user actually sees it
    if (Notification.permission === "granted") {
      const n = new Notification(title, {
        body,
        icon: "/icons/icon-192x192.png",
        data: { url },
      });

      n.onclick = () => {
        if (url) window.open(url, "_blank");
        n.close();
      };
    }
  });
}
