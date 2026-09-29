"use client";

import { trackActivity } from "@/lib/analytics";
import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";

type ClientErrorPayload = {
  type: "window.error" | "window.unhandledrejection";
  message: string;
  stack?: string;
  href: string;
};

function sendJson(path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(path, blob);
    return;
  }
  void fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export default function MonitoringBootstrap() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useReportWebVitals((metric) => {
    sendJson("/api/monitoring/web-vitals", {
      name: metric.name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: window.location.pathname,
      timestamp: Date.now(),
    });
  });

  useEffect(() => {
    trackActivity("page_view", {
      pathname,
      query: searchParams.toString(),
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const payload: ClientErrorPayload = {
        type: "window.error",
        message: event.message || "Unhandled client error",
        stack: event.error?.stack,
        href: window.location.href,
      };
      sendJson("/api/monitoring/errors", payload);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const payload: ClientErrorPayload = {
        type: "window.unhandledrejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        href: window.location.href,
      };
      sendJson("/api/monitoring/errors", payload);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
