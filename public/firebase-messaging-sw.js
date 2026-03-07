importScripts("https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAOMOZgWi2DkEZ1tTrZyFWCLE416D17KH0",
  authDomain: "canchita-16772.firebaseapp.com",
  projectId: "canchita-16772",
  storageBucket: "canchita-16772.firebasestorage.app",
  messagingSenderId: "436163518028",
  appId: "1:436163518028:web:3c4f7dd11296c753bf1ee9",
});

const messaging = firebase.messaging();

// ⚡ Force new SW to activate immediately (don't wait for tabs to close)
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification?.data?.url;

  if (!url) return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// 🔔 Background message handler — explicitly show notification
// as a robust fallback in case FCM auto-display fails.
messaging.onBackgroundMessage(function (payload) {
  console.log("[SW] Background message received:", payload);

  // If FCM already shows the notification (via `notification` field),
  // this won't duplicate because we check for the notification field
  // and only show manually for data-only messages or as a safety net.
  const title = payload.notification?.title || payload.data?.title || "La Canchita";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "/";

  // Only show if this is a data-only message (no notification field)
  // to avoid duplicates with FCM's auto-display
  if (!payload.notification) {
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      data: { url },
    });
  }
});
