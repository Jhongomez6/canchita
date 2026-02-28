import { getMessaging, onMessage, isSupported } from "firebase/messaging";

export async function listenToPushMessages() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging();

  onMessage(messaging, payload => {
    const title = payload.data?.title || payload.notification?.title;
    const body = payload.data?.body || payload.notification?.body;

    if (title && Notification.permission === "granted") {
      new Notification(title, { body: body || "" });
    }
  });
}
