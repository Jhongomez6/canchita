import { getMessaging, onMessage, isSupported } from "firebase/messaging";

export async function listenToPushMessages() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging();

  onMessage(messaging, payload => {
    if (payload.data?.url) {
      window.location.href = payload.data.url;
    }
  });
}
