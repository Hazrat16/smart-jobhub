"use client";

import { Notification } from "@/types";
import { apiClient, getAuthToken, getUser } from "@/utils/api";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getNotifications({ limit: 50 });
      if (!res.success) {
        toast.error(res.message || "Could not load notifications");
        setItems([]);
        setUnreadCount(0);
        return;
      }
      setItems((res.data as Notification[]) ?? []);
      setUnreadCount(typeof res.meta?.unreadCount === "number" ? res.meta.unreadCount : 0);
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

  const markAllRead = async () => {
    const res = await apiClient.markAllNotificationsRead();
    if (!res.success) {
      toast.error(res.message || "Could not mark all read");
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    toast.success("All marked as read");
  };

  const openNotification = async (n: Notification) => {
    if (!n.read) {
      const res = await apiClient.markNotificationRead(n._id);
      if (res.success) {
        setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
        if (typeof res.meta?.unreadCount === "number") {
          setUnreadCount(res.meta.unreadCount);
        } else {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
      }
    }
    if (n.href) {
      router.push(n.href);
    }
  };

  if (!getUser()) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <Bell className="h-7 w-7 text-accent" aria-hidden />
              Notifications
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {unreadCount > 0 ? (
                <>
                  You have <span className="font-semibold text-foreground">{unreadCount}</span>{" "}
                  unread.
                </>
              ) : (
                "You are all caught up."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications/preferences"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-card-muted"
            >
              Preferences
            </Link>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-card-muted"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-fg-muted">
            <p className="mb-4">No notifications yet.</p>
            <p className="text-sm text-fg-subtle">
              When someone applies to your job or your application status changes, you will
              see it here.
            </p>
            <Link
              href="/jobs"
              className="mt-6 inline-block text-sm font-semibold text-accent hover:underline"
            >
              Browse jobs
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((n) => (
              <li key={n._id}>
                <button
                  type="button"
                  onClick={() => void openNotification(n)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition-colors ${
                    n.read
                      ? "border-border bg-card hover:border-border-strong"
                      : "border-accent/25 bg-accent-muted/60 hover:border-accent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{n.title}</p>
                      <p className="mt-1 text-sm text-fg-muted">{n.body}</p>
                      <p className="mt-2 text-xs text-fg-subtle">
                        {new Date(n.createdAt).toLocaleString()}
                        {n.href ? (
                          <span className="text-accent"> · Open</span>
                        ) : null}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
