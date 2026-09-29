"use client";

import { getUser } from "@/utils/api";

export type ActivityEventName =
  | "page_view"
  | "job_search"
  | "post_job_submit"
  | "apply_submit"
  | "profile_save"
  | "sign_out";

export function trackActivity(
  event: ActivityEventName,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  const user = getUser();
  const payload = {
    event,
    timestamp: Date.now(),
    path: window.location.pathname,
    href: window.location.href,
    role: user?.role ?? "guest",
    userId: user?._id ?? null,
    properties: properties ?? {},
  };
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/monitoring/activity", blob);
    return;
  }
  void fetch("/api/monitoring/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}
