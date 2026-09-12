"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, MessageSquare, Send, UserPlus, Users, Video } from "lucide-react";

import { chatApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { chatSocketUrl } from "@/lib/ws";
import type { Conversation, Message, User } from "@/types";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Overlay";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { timeAgo, ROLE_LABELS } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

import { useVideoCall, VideoCallOverlay } from "@/components/chat/VideoCall";
import { useChatStream, type LiveMessage } from "@/hooks/useChatStream";

type DisplayMessage = Message | LiveMessage;

function isImageUrl(url?: string | null): boolean {
  return !!url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ============================================================
   NEW CHAT MODAL
============================================================ */

function NewChatModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (conversation: Conversation) => void;
}) {
  const [contacts, setContacts] = useState<User[] | null>(null);
  const [q, setQ] = useState("");

  const { push } = useToast();

  useEffect(() => {
    if (!open) return;

    setQ("");
    setContacts(null);

    chatApi
      .contacts()
      .then((res) => {
        setContacts(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        setContacts([]);
        push("error", "Couldn't load contacts.");
      });
  }, [open, push]);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();

    if (!search || !contacts) {
      return contacts || [];
    }

    return contacts.filter((contact) => {
      const text = [
        contact.first_name,
        contact.last_name,
        contact.username,
        ROLE_LABELS[contact.role] || "",
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    });
  }, [contacts, q]);

  const start = async (contact: User) => {
    try {
      const conversation = await chatApi.direct(contact.id);

      onStarted(conversation);
      onClose();

      push(
        "success",
        `Conversation with ${
          conversation.partner_name || contact.first_name || contact.username
        } started.`,
      );
    } catch {
      push("error", "Couldn't start the conversation.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New message">
      <div className="space-y-3">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search a name, username or role…"
          className="w-full rounded-lg border border-surface-line bg-surface-sunken/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          autoFocus
        />

        <div className="max-h-[45vh] -mx-1 space-y-1 overflow-y-auto px-1">
          {!contacts && <SkeletonRows rows={6} />}

          {contacts && contacts.length === 0 && (
            <EmptyState
              icon={<MessageSquare size={20} />}
              title="No one to message yet"
              description="Ask an admin to create user accounts first."
            />
          )}

          {filtered.map((contact) => (
            <button
              key={contact.id}
              onClick={() => start(contact)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-sunken"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-100">
                {(
                  contact.first_name?.[0] ||
                  contact.username?.[0] ||
                  "?"
                ).toUpperCase()}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {contact.first_name || contact.last_name
                    ? `${contact.first_name} ${contact.last_name}`.trim()
                    : contact.username}
                </span>

                <span className="block truncate text-xs text-slate-500">
                  {ROLE_LABELS[contact.role] || contact.role}

                  {contact.scoped_lga ? " · LGA-scoped" : ""}
                </span>
              </span>

              <UserPlus size={15} className="shrink-0 text-slate-400" />
            </button>
          ))}

          {contacts && contacts.length > 0 && filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              No contacts match “{q}”.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   CHAT PAGE
============================================================ */

/* ============================================================
   NEW GROUP (BROADCAST) MODAL
   Creates — or reuses, the endpoint is idempotent per title —
   the "all officials in one group chat" broadcast conversation.
   Every active user is a member and stays in sync server-side.
============================================================ */

function NewGroupModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (conversation: Conversation) => void;
}) {
  const [title, setTitle] = useState("All Officials");
  const [creating, setCreating] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (open) setTitle("All Officials");
  }, [open]);

  const create = async () => {
    if (!title.trim() || creating) return;

    setCreating(true);
    try {
      const conversation = await chatApi.broadcast(title.trim());

      onStarted(conversation);
      onClose();
      push("success", `Group "${conversation.title || title}" is live — every active official is in it.`);
    } catch {
      push("error", "Couldn't create the group.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="All-officials group">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          A broadcast channel containing every active user. New accounts are added
          automatically, deactivated ones removed — so it always reaches the whole team.
        </p>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Group title e.g. All Officials"
          className="w-full rounded-lg border border-surface-line bg-surface-sunken/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          autoFocus
        />

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-surface-sunken"
          >
            Cancel
          </button>

          <button
            onClick={create}
            disabled={creating || !title.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ChatPage() {
  const { user, isPrivileged } = useAuth();
  const { push } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);

  const [body, setBody] = useState("");

  const [newChatOpen, setNewChatOpen] = useState(false);

  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const [loading, setLoading] = useState(true);

  const [sending, setSending] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const active =
    conversations.find((conversation) => conversation.id === activeId) || null;

  // Real-time chat stream: auto-reconnecting WebSocket with dedupe.
  const stream = useChatStream(activeId);

  const {
    status,
    incoming,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    localRef,
    remoteRef,
    audioMuted,
    videoOff,
    toggleAudio,
    toggleVideo,
    error,
    clearError,
  } = useVideoCall({
    ws: stream.socket,
    // Live send path for call signalling — survives WebSocket reconnects,
    // unlike the render-time `socket` snapshot above.
    sendFrame: stream.sendFrame,
    myId: user?.id || null,
    myName: user?.first_name || "",
    partnerName: active?.partner_name || "",
  });

  /* ==========================================================
     LOAD CONVERSATIONS
  ========================================================== */

  const loadConversations = useCallback(async () => {
    try {
      const response = await chatApi.conversations();

      setConversations(response.results || []);
    } catch {
      push("error", "Couldn't load conversations.");
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /* ==========================================================
     LOAD MESSAGES
  ========================================================== */

  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const response = await chatApi.messages(conversationId);

        setMessages(response.results || []);

        // Opening a thread counts as reading it: clears the unread badge
        // server-side (last_read_at) and closes the related "New Message"
        // notifications so the bell shrinks too.
        chatApi.markRead(conversationId).catch(() => {});
        loadConversations();
      } catch {
        push("error", "Couldn't load messages.");
      }
    },
    [push, loadConversations],
  );

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
    }
  }, [activeId, loadMessages]);

  /* ==========================================================
     REALTIME MESSAGE MERGE
     The useChatStream hook owns the WebSocket (with reconnect + dedupe).
     When new live messages arrive, merge them into the page's message list
     (which is seeded by loadMessages with the conversation history).
  ========================================================== */

  const liveMsgSig = stream.messages.map((m) => m.id).join(",");

  useEffect(() => {
    if (stream.messages.length === 0) return;
    setMessages((prev) => {
      const existing = new Set(prev.map((m) => m.id));
      const fresh = stream.messages.filter((m) => !existing.has(m.id));
      if (fresh.length === 0) return prev;
      // Opening a thread counts as reading it: clears the unread badge.
      if (activeId) chatApi.markRead(activeId).catch(() => {});
      loadConversations();
      return [...prev, ...fresh];
    });
  }, [liveMsgSig, activeId, loadConversations, stream.messages]);

  /* ==========================================================
     AUTO SCROLL
  ========================================================== */

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, stream.typing]);

  /* ==========================================================
     SEND MESSAGE
  ========================================================== */

  const send = async () => {
    if (!activeId || (!body.trim() && !fileRef.current?.files?.length)) {
      return;
    }

    setSending(true);

    try {
      const file = fileRef.current?.files?.[0];

      if (file) {
        const form = new FormData();

        form.append("conversation", activeId);

        form.append("client_generated_id", newClientId());

        if (body.trim()) {
          form.append("body", body.trim());
        }

        form.append("attachment", file);

        await chatApi.sendWithImage(activeId, body.trim(), newClientId(), file);

        if (fileRef.current) {
          fileRef.current.value = "";
        }
      } else if (body.trim()) {
        await chatApi.send(activeId, body.trim(), newClientId());
      }

      setBody("");

      await loadMessages(activeId);
    } catch {
      push("error", "Couldn't send message.");
    } finally {
      setSending(false);
    }
  };

  /* ==========================================================
     TYPING INDICATOR
  ========================================================== */

  const onType = () => {
    stream.sendTyping();
  };

  /* ==========================================================
     START VIDEO CALL
  ========================================================== */

  const startVideoCall = async () => {
    if (!active || !user) {
      return;
    }

    // Signalling goes through the conversation's WebSocket group; the
    // consumer relays frames to every other member with the caller's id
    // attached, so no explicit callee id is needed here.
    try {
      await startCall();
    } catch {
      push("error", "Couldn't start the video call.");
    }
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Coordinate with field teams in real time."
      />

      <input ref={fileRef} type="file" accept="image/*" className="hidden" />

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onStarted={(conversation) => {
          setActiveId(conversation.id);

          loadConversations();
        }}
      />

      {isPrivileged && (
        <NewGroupModal
          open={newGroupOpen}
          onClose={() => setNewGroupOpen(false)}
          onStarted={(conversation) => {
            setActiveId(conversation.id);

            loadConversations();
          }}
        />
      )}

      {/* Incoming Call */}

      {incoming && status === "ringing" && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-600 px-4 py-3 text-white shadow-pop">
          <div className="flex items-center gap-3">
            <Video size={18} />

            <span className="text-sm font-medium">
              Incoming call from {incoming.caller_name}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => acceptCall()}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-brand-700"
            >
              Answer
            </button>

            <button
              onClick={endCall}
              className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Card */}

      <Card bodyClassName="overflow-hidden p-0">
        <div className="flex h-[70vh]">
          {/* ==================================================
              CONVERSATION LIST
          ================================================== */}

          <div className="w-72 shrink-0 overflow-y-auto border-r border-surface-line">
            <div className="space-y-2 border-b border-surface-line p-3">
              <button
                onClick={() => setNewChatOpen(true)}
                className="flex w-full items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <UserPlus size={16} />
                New message
              </button>

              {isPrivileged && (
                <button
                  onClick={() => setNewGroupOpen(true)}
                  className="
                    flex w-full items-center gap-2
                    rounded-lg border border-brand-200
                    px-3 py-2 text-sm font-medium text-brand-700
                    hover:bg-brand-50
                    dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20
                  "
                >
                  <Users size={16} />
                  All-officials group
                </button>
              )}
            </div>

            {loading && <SkeletonRows rows={4} />}

            {!loading && conversations.length === 0 && (
              <div className="p-6">
                <EmptyState
                  icon={<MessageSquare size={20} />}
                  title="No conversations yet"
                  description="Start a message to coordinate with your team."
                />
              </div>
            )}

            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setActiveId(conversation.id)}
                className={`
                    flex w-full
                    items-center gap-3
                    px-3 py-3
                    text-left
                    hover:bg-surface-sunken
                    ${
                      activeId === conversation.id
                        ? "bg-brand-50 dark:bg-brand-100/5"
                        : ""
                    }
                  `}
              >
                <span className="relative shrink-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {(conversation.is_group ? "#" : conversation.partner_name?.[0] || "?").toUpperCase()}
                  </span>

                  {conversation.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium text-ink">
                      {conversation.partner_name || "Unknown"}
                    </span>

                    {conversation.last_message?.created_at && (
                      <span className="text-[10px] text-slate-400">
                        {timeAgo(conversation.last_message.created_at)}
                      </span>
                    )}
                  </span>

                  <span className="block truncate text-xs text-slate-500">
                    {conversation.last_message
                      ? `${conversation.last_message.sender_name}: ${
                          conversation.last_message.has_attachment && !conversation.last_message.body
                            ? "[attachment]"
                            : conversation.last_message.body
                        }`
                      : "No messages yet"}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* ==================================================
              CHAT WINDOW
          ================================================== */}

          <div className="flex flex-1 flex-col">
            {!active ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={<MessageSquare size={28} />}
                  title="Select a conversation"
                  description="Or start a new message to begin coordinating."
                />
              </div>
            ) : (
              <>
                {/* Chat Header */}

                <div className="flex items-center justify-between border-b border-surface-line px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                      {(active.partner_name?.[0] || "?").toUpperCase()}
                    </span>

                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {active.partner_name}
                      </p>

                      {stream.typing && (
                        <p className="text-[11px] text-brand-600">typing…</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Connection status indicator */}
                    {stream.status !== "connected" && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          stream.status === "connecting" || stream.status === "reconnecting"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                        }`}
                        title={
                          stream.status === "connecting"
                            ? "Connecting to chat…"
                            : stream.status === "reconnecting"
                            ? "Reconnecting…"
                            : "Disconnected"
                        }
                      >
                        {stream.status === "connecting" || stream.status === "reconnecting"
                          ? "Connecting…"
                          : "Offline"}
                      </span>
                    )}

                    <button
                      onClick={startVideoCall}
                      disabled={status !== "idle" || stream.status !== "connected"}
                      className="
                        flex items-center gap-1.5
                        rounded-lg
                        bg-brand-600
                        px-3 py-1.5
                        text-xs font-medium
                        text-white
                        hover:bg-brand-700
                        disabled:opacity-50
                      "
                    >
                      <Video size={14} />
                      Video call
                    </button>
                  </div>
                </div>

                {/* Messages */}

                <div
                  ref={scrollRef}
                  className="
                    flex-1
                    space-y-3
                    overflow-y-auto
                    px-4 py-4
                  "
                >
                  {messages.map((message) => {
                    const mine = message.sender === user?.id;

                    const createdAt =
                      "created_at" in message ? message.created_at : "";

                    return (
                      <div
                        key={message.id}
                        className={`
                            flex
                            ${mine ? "justify-end" : "justify-start"}
                          `}
                      >
                        <div
                          className={`
                              max-w-[70%]
                              rounded-2xl
                              px-3.5 py-2
                              ${
                                mine
                                  ? "bg-brand-600 text-white"
                                  : "bg-surface-sunken text-ink"
                              }
                            `}
                        >
                          {"attachment_url" in message &&
                            message.attachment_url &&
                            isImageUrl(message.attachment_url) && (
                              <img
                                src={message.attachment_url}
                                alt="attachment"
                                className="
                                    mb-1.5
                                    max-h-48
                                    rounded-lg
                                  "
                              />
                            )}

                          {message.body && (
                            <p className="whitespace-pre-wrap text-sm">
                              {message.body}
                            </p>
                          )}

                          <p
                            className={`
                                mt-0.5
                                text-[10px]
                                ${mine ? "text-white/60" : "text-slate-400"}
                              `}
                          >
                            {createdAt ? timeAgo(createdAt) : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Message Input */}

                <div className="border-t border-surface-line p-3">
                  <div className="flex items-end gap-2">
                    {/* Attachment */}

                    <button
                      onClick={() => fileRef.current?.click()}
                      className="
                        rounded-lg
                        p-2
                        text-slate-400
                        hover:bg-surface-sunken
                        hover:text-brand-600
                      "
                      aria-label="Attach image"
                    >
                      <ImagePlus size={18} />
                    </button>

                    {/* Message */}

                    <textarea
                      value={body}
                      onChange={(event) => {
                        setBody(event.target.value);

                        onType();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();

                          send();
                        }
                      }}
                      rows={1}
                      placeholder="Type a message…"
                      className="
                        flex-1
                        resize-none
                        rounded-lg
                        border border-surface-line
                        bg-surface-sunken/40
                        px-3 py-2
                        text-sm
                        focus:outline-none
                        focus:ring-2
                        focus:ring-brand-500/30
                      "
                    />

                    {/* Send */}

                    <button
                      onClick={send}
                      disabled={
                        sending ||
                        (!body.trim() && !fileRef.current?.files?.length)
                      }
                      className="
                        rounded-lg
                        bg-brand-600
                        p-2
                        text-white
                        hover:bg-brand-700
                        disabled:opacity-50
                      "
                      aria-label="Send"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Video Call Overlay */}

      <VideoCallOverlay
        status={status}
        name={active?.partner_name || ""}
        incoming={incoming}
        onAccept={acceptCall}
        onDecline={declineCall}
        localRef={localRef}
        remoteRef={remoteRef}
        audioMuted={audioMuted}
        videoOff={videoOff}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onEnd={endCall}
        error={error}
        onClearError={clearError}
      />
    </div>
  );
}
