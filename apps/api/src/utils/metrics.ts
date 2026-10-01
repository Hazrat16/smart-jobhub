import mongoose from "mongoose";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { getWebSocketService } from "../chat/websocketRegistry.js";
import { pingRedis } from "../config/redis.js";
import { EMAIL_QUEUE_STATES, getEmailQueueCounts } from "../queues/emailQueue.js";

/**
 * Prometheus metrics, served at GET /metrics (see app.ts). Own registry rather
 * than prom-client's global one, so tests that import the app twice don't trip
 * "metric already registered".
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: "job-platform-api" });

// Process metrics: CPU, RSS/heap, event loop lag, GC, active handles.
collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "HTTP requests handled, by route template and status code.",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency, by route template and status code.",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const PING_TIMEOUT_MS = 1_000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), PING_TIMEOUT_MS).unref();
    }),
  ]);
}

new Gauge({
  name: "app_dependency_up",
  help: "Whether the API can reach a dependency (1 = up, 0 = down).",
  labelNames: ["dependency"] as const,
  registers: [registry],
  async collect() {
    this.set({ dependency: "mongodb" }, mongoose.connection.readyState === 1 ? 1 : 0);
    this.set({ dependency: "redis" }, (await withTimeout(pingRedis(), false)) ? 1 : 0);
  },
});

new Gauge({
  name: "email_queue_jobs",
  help: "BullMQ email queue jobs by state. Absent when the queue is disabled or Redis is unreachable.",
  labelNames: ["state"] as const,
  registers: [registry],
  async collect() {
    this.reset();
    const counts = await getEmailQueueCounts();
    if (!counts) return;
    for (const state of EMAIL_QUEUE_STATES) this.set({ state }, counts[state] ?? 0);
  },
});

new Gauge({
  name: "socketio_connected_clients",
  help: "Socket.IO clients connected to this task.",
  registers: [registry],
  collect() {
    this.set(getWebSocketService()?.connectedClientCount() ?? 0);
  },
});

/**
 * Records one finished request. `route` must be the route TEMPLATE
 * (/api/jobs/:id), never the raw URL: every distinct label value is a new
 * time series, and raw ids would grow them without bound.
 */
export function trackHttp(method: string, route: string, statusCode: number, latencyMs: number) {
  const labels = { method, route, status_code: String(statusCode) };
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, latencyMs / 1000);
}
