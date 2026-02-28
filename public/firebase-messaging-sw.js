/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAOMOZgWi2DkEZ1tTrZyFWCLE416D17KH0",
  authDomain: "canchita-16772.firebaseapp.com",
  projectId: "canchita-16772",
  storageBucket: "canchita-16772.firebasestorage.app",
  messagingSenderId: "436163518028",
  appId: "1:436163518028:web:3c4f7dd11296c753bf1ee9",
});

const messaging = firebase.messaging();


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

// We send DATA-ONLY messages (no `notification` field) so that FCM
// does NOT auto-display anything. Instead, we control display here.
messaging.onBackgroundMessage(function (payload) {
  console.log("[SW] Background message received:", payload);

  var title = payload.data && payload.data.title;
  var body = payload.data && payload.data.body;
  var url = payload.data && payload.data.url;

  if (!title) return;

  self.registration.showNotification(title, {
    body: body || "",
    icon: "/icon-192x192.png",
    data: { url: url },
  });
});
