// Reconnecting WebSocket + real-time frame dedupe helpers shared by the
// notification bell, notification pages and chat.
//
// Design notes:
// - One socket per concern per page (the shells open a *single* notification
//   socket; chat opens one socket per open conversation) so we never stack
//   duplicate connections.
// - On an unexpected close the socket retries with exponential backoff.
// - An "echo guard" prevents the same server frame being applied twice when a
//   page reconnects and the server re-sends the current state.
// - Consumers call seen()/forget() to dedupe by a stable frame key.

import { notificationsSocketUrl } from "./ws";

export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RealtimeSocketOptions {
  /** Called with the parsed frame payload. */
  onMessage: (frame: Record<string, unknown>) => void;
  /** Called whenever the connection state changes. */
  onStatus?: (status: RealtimeStatus) => void;
  /** Base delay before the first reconnect (ms). */
  initialBackoffMs?: number;
  /** Maximum backoff (ms). */
  maxBackoffMs?: number;
}

function frameStatus(socket: WebSocket): RealtimeStatus {
  if (socket.readyState === WebSocket.OPEN) return "connected";
  if (socket.readyState === WebSocket.CONNECTING) return "connecting";
  return "reconnecting";
}
/**
 * A self-healing WebSocket wrapper. Reconnects with capped exponential
 * backoff, notifies listeners of state transitions and never throws from an
 * async callback (a malformed frame must not kill the stream).
 */
export class ReconnectingSocket {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private backoffMs: number;
  private maxBackoffMs: number;
  private closedByClient = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: RealtimeStatus = "disconnected";
  private readonly url: string;
  private readonly options: RealtimeSocketOptions;

  constructor(url: string, options: RealtimeSocketOptions) {
    this.url = url;
    this.options = options;
    this.backoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 15000;
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** The underlying WebSocket (for WebRTC signalling, video calls, etc.). */
  get rawSocket(): WebSocket | null {
    return this.socket;
  }

  get currentStatus(): RealtimeStatus {
    return this.status;
  }

  /** Open the connection. Safe to call once; reconnect is automatic. */
  connect() {
    if (this.socket && this.socket.readyState <= WebSocket.CONNECTING) return;
    this.closedByClient = false;
    this.open();
  }

  private open() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = ws;
    this.setStatus(frameStatus(ws));

    ws.onopen = () => {
      this.attempts = 0;
      this.backoffMs = this.options.initialBackoffMs ?? 1000;
      this.setStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const frame = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (frame && typeof frame === "object") {
          this.options.onMessage(frame as Record<string, unknown>);
        }
      } catch {
        // Ignore malformed frames — never kill the stream because of one.
      }
    };

    ws.onerror = () => {
      // onclose follows; nothing to do here other than let close() schedule
      // the reconnect.
    };

    ws.onclose = () => {
      if (this.closedByClient) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    this.setStatus("reconnecting");
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.min(this.backoffMs, this.maxBackoffMs);
    this.timer = setTimeout(() => {
      this.attempts += 1;
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      this.open();
    }, delay);
  }

  private setStatus(status: RealtimeStatus) {
    if (this.status === status) return;
    this.status = status;
    try {
      this.options.onStatus?.(status);
    } catch {
      // Listener errors must not break the socket lifecycle.
    }
  }

  /** Send a JSON frame. Returns false if the socket is not connected. */
  send(frame: Record<string, unknown>): boolean {
    if (!this.isConnected) return false;
    try {
      this.socket!.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  /** Close permanently (no reconnect). */
  close() {
    this.closedByClient = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
    this.setStatus("disconnected");
  }
}

/**
 * Generational dedupe set, keyed by e.g. `message:<id>` or `notification:<id>`.
 * `forget()` prunes old entries so a long-lived page doesn't grow unbounded.
 */
export class GenSet {
  private keys = new Set<string>();

  /** Returns true if `key` was already recorded; records it on first call. */
  seen(key: string): boolean {
    if (!key || this.keys.has(key)) return true;
    this.keys.add(key);
    return false;
  }

  forget(key: string) {
    this.keys.delete(key);
  }

  /** Drop oldest entries beyond a simple FIFO cap (memory guard). */
  prune(cap = 800) {
    if (this.keys.size <= cap) return;
    const it = this.keys.values();
    while (this.keys.size > cap) {
      const next = it.next();
      if (next.done) break;
      this.keys.delete(next.value);
    }
  }
}
/** Convenience wrapper standing up a ReconnectingSocket for the auth'd
 *  notification stream and routing its frame types to typed callbacks. */
export interface NotificationStreamHandlers {
  onNotification?: (frame: Record<string, unknown>, unreadCount?: number) => void;
  onBadgeUpdate?: (count: number) => void;
  onNotificationEvent?: (event: string, notificationId: string) => void;
  onStatus?: (status: RealtimeStatus) => void;
}

export function connectNotificationStream(handlers: NotificationStreamHandlers): ReconnectingSocket {
  return new ReconnectingSocket(notificationsSocketUrl(), {
    onStatus: handlers.onStatus,
    onMessage: (frame) => {
      const type = frame.type as string | undefined;
      if (type === "notification") {
        handlers.onNotification?.(frame, Number(frame.unread_count) || undefined);
      } else if (type === "badge_update") {
        handlers.onBadgeUpdate?.(Number(frame.unread_count) || 0);
      } else if (type === "notification_event") {
        handlers.onNotificationEvent?.(String(frame.event || ""), String(frame.notification_id || ""));
      }
    },
  });
}