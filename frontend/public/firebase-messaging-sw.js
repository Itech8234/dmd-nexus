/**
 * Firebase Cloud Messaging service worker — receives push while the app is
 * backgrounded/closed and shows it in the OS notification tray.
 *
 * The Firebase web config is passed in via the service-worker URL's query
 * string (the app registers this file with `?apiKey=...&projectId=...`),
 * so no build-time templating or committed secrets are needed. Without a
 * config the worker still installs (it just can't show push).
 */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get("apiKey") || undefined,
  authDomain: params.get("authDomain") || undefined,
  projectId: params.get("projectId") || undefined,
  storageBucket: params.get("storageBucket") || undefined,
  messagingSenderId: params.get("senderId") || undefined,
  appId: params.get("appId") || undefined,
  measurementId: params.get("measurementId") || undefined,
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Y-COMPS";
  const body = (payload.notification && payload.notification.body) || "";
  const data = payload.data || {};

  self.registration.showNotification(title, {
    body,
    // Collapse per-notification so five chat messages don't stack five toasts.
    tag: data.notification_id || undefined,
    data: { link: data.related_object_type === "conversation" ? "/chat" : "/notifications" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});