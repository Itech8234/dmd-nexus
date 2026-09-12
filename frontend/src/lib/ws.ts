// WebSocket helpers for the Django Channels endpoints.
// Authentication is via a `?token=` query param. In dev, Next.js rewrites
// proxy JSON+media but NOT ws:// — so the browser connects to the WS base
// directly, which is why we keep the token and build the URL from the
// configured WS base.

import { getAccessToken } from "./http";

function wsBase(): string {
  return process.env.NEXT_PUBLIC_WS_BASE || "ws://localhost:8000";
}

export function chatSocketUrl(conversationId: string): string {
  const token = getAccessToken();
  const base = wsBase().replace(/\/$/, "");
  return `${base}/ws/chat/${conversationId}/?token=${encodeURIComponent(token || "")}`;
}

export function notificationsSocketUrl(): string {
  const token = getAccessToken();
  const base = wsBase().replace(/\/$/, "");
  return `${base}/ws/notifications/?token=${encodeURIComponent(token || "")}`;
}

export function operationsSocketUrl(): string {
  const token = getAccessToken();
  const base = wsBase().replace(/\/$/, "");
  return `${base}/ws/operations/?token=${encodeURIComponent(token || "")}`;
}
