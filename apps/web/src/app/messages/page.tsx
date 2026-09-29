"use client";

import { getSocket } from "@/lib/socket";
import { ChatConversationSummary, LiveChatMessage } from "@/types";
import { apiClient, getAuthToken, getUser } from "@/utils/api";
import { Loader2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MessagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getConversations();
      if (!res.success) {
        toast.error(res.message || "Could not load conversations");
        setConversations([]);
        return;
      }
      setConversations(res.data?.conversations ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [router, load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = (data: LiveChatMessage) => {
      const currentUserId = getUser()?._id;
      const otherId = data.senderId === currentUserId ? data.receiverId : data.senderId;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.otherParticipant.id === otherId || c.otherParticipant._id === otherId);
        if (idx === -1) {
          // A conversation with someone new — refetch to get their profile info.
          void load();
          return prev;
        }
        const updated = [...prev];
        const conv = { ...updated[idx] } as ChatConversationSummary;
        conv.lastMessage = { message: data.message, timestamp: data.timestamp };
        conv.lastMessageAt = data.timestamp;
        if (data.senderId !== currentUserId) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
        updated.splice(idx, 1);
        updated.unshift(conv);
        return updated;
      });
    };

    socket.on("new_message", onNewMessage);
    return () => {
      socket.off("new_message", onNewMessage);
    };
  }, [load]);

  if (!getUser()) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <MessageCircle className="h-7 w-7 text-accent" aria-hidden />
            Messages
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Conversations with employers and candidates.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-fg-muted">
            <p className="mb-2">No conversations yet.</p>
            <p className="text-sm text-fg-subtle">
              Messages you send or receive about job applications will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => {
              const otherId = c.otherParticipant.id || c.otherParticipant._id || "";
              return (
                <li key={c.id}>
                  <Link
                    href={`/messages/${otherId}?name=${encodeURIComponent(
                      c.otherParticipant.name || "",
                    )}&photo=${encodeURIComponent(c.otherParticipant.photo || "")}`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-card-muted"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/10 text-sm font-semibold text-accent">
                      {c.otherParticipant.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.otherParticipant.photo}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (c.otherParticipant.name || "?").slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {c.otherParticipant.name || "Unknown user"}
                        </p>
                        <span className="shrink-0 text-xs text-fg-subtle">
                          {timeAgo(c.lastMessageAt)}
                        </span>
                      </div>
                      <p className="truncate text-sm text-fg-muted">
                        {c.lastMessage?.message || "No messages yet"}
                      </p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
