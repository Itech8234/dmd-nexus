"use client";

// Real-time chat stream hook.
//
// Wraps the per-conversation WebSocket in a ReconnectingSocket so chat
// recovers from transient network drops without a page refresh. The server
// pushes:
//   {type:"message", id, sender, sender_name, body, created_at, attachment_url}
//   {type:"typing"}
//   {type:"badge_update", unread_count}        conversation-level unread total
//   {type:"message_read", message_id, read_at} read/seen sync
//
// Dedupe is by `message:<id>` so a reconnect (the server re-sends recent
// history) never doubles the timeline.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeStatus } from "@/lib/rt";
import { GenSet, ReconnectingSocket } from "@/lib/rt";
import { chatSocketUrl } from "@/lib/ws";

export interface LiveMessage {
  id: string;
  sender: string;
  sender_name: string;
  body: string;
  created_at: string;
  attachment_url?: string | null;
  // Optional fields present on the REST Message but absent on the WS frame.
  client_generated_id?: string;
  conversation?: string;
  attachment?: string | null;
  delivered_at?: string;
}

export interface ChatStreamState {
  status: RealtimeStatus;
  typing: boolean;
  unread: number;
  messages: LiveMessage[];
  sendTyping: () => void;
  resetUnread: () => void;
  /** The underlying WebSocket (for WebRTC signalling). May be null if not connected. */
  socket: WebSocket | null;
  /**
   * Always-current send path (delegates to the ReconnectingSocket at call
   * time, so it stays valid across reconnects). Use this for call signalling.
   */
  sendFrame: (frame: Record<string, unknown>) => boolean;
}

export function useChatStream(conversationId: string | null): ChatStreamState {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<LiveMessage[]>([]);

  const socketRef = useRef<ReconnectingSocket | null>(null);
  const dedupeRef = useRef<GenSet | null>(null);
  if (!dedupeRef.current) dedupeRef.current = new GenSet();
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!conversationId) {
      socketRef.current?.close();
      socketRef.current = null;
      setMessages([]);
      setTyping(false);
      return;
    }

    const socket = new ReconnectingSocket(chatSocketUrl(conversationId), {
      onStatus: (next) => {
        setStatus(next);
      },
      onMessage: (frame) => {
        if (frame.type === "message") {
          const msg = frame as unknown as LiveMessage;
          if (!msg?.id) return;
          if (dedupeRef.current!.seen(`message:${msg.id}`)) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } else if (frame.type === "typing") {
          setTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(false), 2500);
        } else if (frame.type === "badge_update") {
          const count = typeof frame.unread_count === "number" ? frame.unread_count : 0;
          setUnread(count);
        } else if (frame.type === "message_read") {
          // Read receipts: could update individual message read state here
        }
      },
    });

    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
      setMessages([]);
      setTyping(false);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [conversationId]);

  const sendTyping = useCallback(() => {
    if (!socketRef.current?.isConnected) return;
    socketRef.current.send({ type: "typing", payload: {} });
  }, []);

  const resetUnread = useCallback(() => {
    setUnread(0);
  }, []);

  /**
   * Live send path for out-of-band frames (WebRTC call signalling).
   * Reads the CURRENT underlying socket at call time via ReconnectingSocket,
   * so it survives reconnects — unlike the render-time `socket` snapshot,
   * which goes stale the moment the wrapper swaps its WebSocket.
   */
  const sendFrame = useCallback((frame: Record<string, unknown>): boolean => {
    return socketRef.current?.send(frame) ?? false;
  }, []);

  return {
    status,
    typing,
    unread,
    messages,
    sendTyping,
    resetUnread,
    /** Render-time snapshot — kept for back-compat / readyState listeners. */
    socket: socketRef.current?.rawSocket ?? null,
    /** Always-current send path (use this for call signalling). */
    sendFrame,
  };
}
