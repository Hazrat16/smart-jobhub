"use client";

import { getSocket } from "@/lib/socket";
import { ChatMessage, LiveChatMessage } from "@/types";
import { apiClient, getAuthToken, getUser } from "@/utils/api";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

function ConversationPageContent() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const otherUserId = params.userId;
  const otherName = searchParams.get("name") || "Conversation";
  const otherPhoto = searchParams.get("photo") || "";

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUserId = getUser()?._id || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getConversationWithUser(otherUserId);
      if (!res.success) {
        toast.error(res.message || "Could not load conversation");
        return;
      }
      setMessages(res.data?.messages ?? []);
      setConversationId(res.data?.conversation.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [otherUserId]);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [router, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return;

    socket.emit("join_conversation", { conversationId });

    const onNewMessage = (data: LiveChatMessage) => {
      if (data.senderId !== otherUserId) return;
      setMessages((prev) => [
        ...prev,
        {
          _id: data.clientMessageId,
          senderId: data.senderId,
          receiverId: data.receiverId,
          message: data.message,
          messageType: data.messageType,
          timestamp: data.timestamp,
          isRead: false,
        },
      ]);
    };

    const onTyping = (data: { userId: string; isTyping: boolean }) => {
      if (data.userId === otherUserId) setIsTyping(data.isTyping);
    };

    socket.on("new_message", onNewMessage);
    socket.on("user_typing", onTyping);
    return () => {
      socket.emit("leave_conversation", { conversationId });
      socket.off("new_message", onNewMessage);
      socket.off("user_typing", onTyping);
    };
  }, [conversationId, otherUserId]);

  const sendTyping = useCallback(
    (typing: boolean) => {
      const socket = getSocket();
      if (!socket) return;
      socket.emit(typing ? "typing_start" : "typing_stop", {
        targetUserId: otherUserId,
        conversationId,
      });
    },
    [otherUserId, conversationId],
  );

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    const socket = getSocket();
    if (!socket) {
      toast.error("Not connected. Refresh and try again.");
      return;
    }

    setSending(true);
    socket.emit(
      "send_message",
      { receiverId: otherUserId, message: text, messageType: "text" },
      () => undefined,
    );

    const onSent = (data: { messageId: string; message: string; timestamp: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          _id: data.messageId,
          senderId: currentUserId,
          receiverId: otherUserId,
          message: data.message,
          messageType: "text",
          timestamp: data.timestamp,
          isRead: false,
        },
      ]);
      setSending(false);
      socket.off("message_sent", onSent);
      socket.off("error", onError);
    };
    const onError = (err: { message?: string }) => {
      toast.error(err.message || "Failed to send message");
      setSending(false);
      socket.off("message_sent", onSent);
      socket.off("error", onError);
    };
    socket.once("message_sent", onSent);
    socket.once("error", onError);

    setDraft("");
    sendTyping(false);
  };

  if (!getUser()) return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <Link
          href="/messages"
          className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-card-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/10 text-sm font-semibold text-accent">
          {otherPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={otherPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            otherName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <p className="font-semibold text-foreground">{otherName}</p>
          {isTyping && <p className="text-xs text-accent">typing…</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-fg-muted">
            <p>Say hello 👋 — no messages yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const senderId = typeof m.senderId === "string" ? m.senderId : m.senderId?._id;
              const mine = senderId === currentUserId;
              return (
                <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      mine
                        ? "bg-accent text-white"
                        : "border border-border bg-card text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.message}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-fg-subtle"}`}>
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card px-4 py-3 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              sendTyping(e.target.value.length > 0);
            }}
            onBlur={() => sendTyping(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ConversationPage() {
  return (
    <Suspense fallback={null}>
      <ConversationPageContent />
    </Suspense>
  );
}
