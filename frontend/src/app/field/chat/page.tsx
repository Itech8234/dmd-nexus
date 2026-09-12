"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { chatApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Conversation, Message } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows, EmptyState } from "@/components/ui/States";
import { timeAgo } from "@/lib/format";
import { useChatStream, type LiveMessage } from "@/hooks/useChatStream";

export default function FieldChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<(Message | LiveMessage)[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Real-time stream: auto-reconnecting WebSocket with dedupe.
  const stream = useChatStream(active?.id ?? null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await chatApi.conversations();
      setConversations(res.results || []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const open = useCallback(async (conv: Conversation) => {
    setActive(conv);
    setMessages([]);
    try {
      const res = await chatApi.messages(conv.id);
      setMessages(res.results || []);
      chatApi.markRead(conv.id).catch(() => {});
    } catch {
      /* noop */
    }
  }, []);

  // Merge live messages from the stream into the page's message list.
  const liveMsgSig = stream.messages.map((m) => m.id).join(",");
  useEffect(() => {
    if (stream.messages.length === 0) return;
    setMessages((prev) => {
      const existing = new Set(prev.map((m) => m.id));
      const fresh = stream.messages.filter((m) => !existing.has(m.id));
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh];
    });
  }, [liveMsgSig, stream.messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || !active) return;
    const cgid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: cgid,
        client_generated_id: cgid,
        conversation: active.id,
        sender: user?.id || "",
        sender_name: `${user?.first_name} ${user?.last_name}`.trim() || user?.username || "",
        body,
        attachment: null,
        created_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      } as Message,
    ]);
    setInput("");
    try {
      await chatApi.send(active.id, body, cgid);
    } catch {
      /* keep optimistic */
    }
  };

  if (active) {
    return (
      <div className="flex h-[calc(100vh-150px)] flex-col">
        <PageHeader
          title="Chat"
          description=""
          actions={<button onClick={() => setActive(null)} className="text-xs font-medium text-brand-600">Back</button>}
        />
        <div className="flex-1 space-y-2 overflow-y-auto pb-2">
          {messages.map((m, i) => {
            const mine = (m as Message).sender === user?.id;
            return (
              <div key={m.id || i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-brand-600 text-white" : "bg-white border border-surface-line text-ink"}`}>
                  {!mine && <p className="text-[10px] font-medium text-slate-500">{m.sender_name}</p>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[9px] ${mine ? "text-white/70" : "text-slate-400"}`}>{timeAgo(m.created_at)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="mt-2 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message…"
            className="flex-1 rounded-xl border border-surface-line bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <button type="submit" className="rounded-xl bg-brand-600 p-3 text-white" aria-label="Send">
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Chat" description="Your conversations." />
      <div className="space-y-2">
        {conversations.length === 0 && <EmptyState title="No conversations yet" />}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => open(c)}
            className="w-full rounded-2xl border border-surface-line bg-white p-4 text-left shadow-card hover:bg-surface-sunken/50"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{c.title || "Direct chat"}</p>
              {c.unread_count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {c.unread_count}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {c.last_message ? `${c.last_message.sender_name}: ${c.last_message.body}` : "No messages"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
