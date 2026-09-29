"use client";

import { NotificationPreferenceKey, NotificationPreferences } from "@/types";
import { apiClient, getAuthToken, getUser } from "@/utils/api";
import { BellRing, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const LABELS: Array<{ key: NotificationPreferenceKey; title: string; help: string }> = [
  {
    key: "applicationReceived",
    title: "Application received",
    help: "When a candidate applies to your job.",
  },
  {
    key: "applicationStatus",
    title: "Application status changes",
    help: "When an employer updates your application status.",
  },
  {
    key: "jobClosingSoon",
    title: "Job closing reminders",
    help: "When a posted job has been open for a long time.",
  },
];

export default function NotificationPreferencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getNotificationPreferences();
        if (!res.success || !res.data) {
          toast.error(res.message || "Could not load preferences");
          return;
        }
        setPrefs(res.data);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const onToggle = async (
    channel: "inApp" | "email",
    key: NotificationPreferenceKey,
    value: boolean,
  ) => {
    if (!prefs) return;
    const prev = prefs;
    const next: NotificationPreferences = {
      ...prefs,
      [channel]: { ...prefs[channel], [key]: value },
    };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await apiClient.updateNotificationPreferences({
        [channel]: { [key]: value },
      });
      if (!res.success || !res.data) {
        setPrefs(prev);
        toast.error(res.message || "Could not save preference");
        return;
      }
      setPrefs(res.data);
    } finally {
      setSaving(false);
    }
  };

  if (!getUser()) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <BellRing className="h-6 w-6 text-accent" />
              Notification preferences
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Choose which alerts you receive in-app and by email.
            </p>
          </div>
          <Link href="/notifications" className="text-sm font-semibold text-accent hover:underline">
            Back to notifications
          </Link>
        </div>

        {loading || !prefs ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              <div>Event</div>
              <div>In-app</div>
              <div>Email</div>
            </div>
            {LABELS.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
              >
                <div>
                  <p className="font-medium text-foreground">{row.title}</p>
                  <p className="text-xs text-fg-subtle">{row.help}</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.inApp[row.key]}
                  disabled={saving}
                  onChange={(e) => void onToggle("inApp", row.key, e.target.checked)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  aria-label={`${row.title} in-app`}
                />
                <input
                  type="checkbox"
                  checked={prefs.email[row.key]}
                  disabled={saving}
                  onChange={(e) => void onToggle("email", row.key, e.target.checked)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  aria-label={`${row.title} email`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
