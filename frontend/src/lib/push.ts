/**
 * Web-Push (FCM) client glue.
 *
 * Reads the Firebase web config from NEXT_PUBLIC_FIREBASE_* env vars,
 * asks the browser for notification permission, obtains an FCM token and
 * registers it with the backend so ``notifications.services.notify`` can
 * reach this device's notification tray while the app is backgrounded.
 *
 * Everything degrades silently when Firebase isn't configured (or the
 * firebase package isn't installed): chat + in-app notifications keep
 * working over WebSocket/REST, push is simply a no-op.
 */

import { notificationDevicesApi } from "./api";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export function isPushConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

function localStorageKey(): string {
  return `fcm_token_registered:${firebaseConfig.projectId || ""}`;
}

/**
 * Ask permission, obtain the FCM token and POST it to the backend.
 * Idempotent per browser profile: a token already registered successfully
 * isn't re-registered on every page load (the backend upserts anyway, this
 * just avoids the permission prompt round-trip noise).
 */
export async function registerPush(): Promise<void> {
  if (typeof window === "undefined" || !isPushConfigured()) return;
  if (!("Notification" in window)) return;
  if (localStorage.getItem(localStorageKey()) === "1") return;

  try {
    const { getApps, initializeApp } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");

    if (!(await isSupported())) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    // The VAPID key pair is managed in the Firebase console. The service
    // worker receives the web config via its URL query string (see
    // public/firebase-messaging-sw.js) so it can initialise Firebase too.
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    const swQuery = new URLSearchParams({
      apiKey: firebaseConfig.apiKey || "",
      authDomain: firebaseConfig.authDomain || "",
      projectId: firebaseConfig.projectId || "",
      storageBucket: firebaseConfig.storageBucket || "",
      senderId: firebaseConfig.messagingSenderId || "",
      appId: firebaseConfig.appId || "",
      measurementId: firebaseConfig.measurementId || "",
    }).toString();
    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${swQuery}`,
    );

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    await notificationDevicesApi.register({
      fcm_token: token,
      platform: "web",
      device_id: navigator.userAgent.slice(0, 255),
    });

    localStorage.setItem(localStorageKey(), "1");
  } catch {
    // No firebase package installed, blocked permission, or a backend
    // hiccup — in-app delivery is unaffected, so stay quiet.
  }
}

/**
 * Listen for FCM messages while the tab is focused (backgrounded tabs are
 * handled by the service worker). ``onMessage`` fires for foreground
 * deliveries — we use it to refresh the bell badge immediately.
 */
export async function onForegroundPush(callback: () => void): Promise<() => void> {
  if (typeof window === "undefined" || !isPushConfigured()) return () => {};

  try {
    const { getApps, initializeApp } = await import("firebase/app");
    const { getMessaging, isSupported, onMessage } = await import("firebase/messaging");

    if (!(await isSupported())) return () => {};

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const unsubscribe = onMessage(getMessaging(app), () => callback());
    return unsubscribe;
  } catch {
    return () => {};
  }
}

/** Forget the registered-token marker (e.g. on logout). */
export function resetPushRegistration(): void {
  try {
    localStorage.removeItem(localStorageKey());
  } catch {
    // Ignore storage errors (private mode).
  }
}