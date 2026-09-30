type LogLevel = "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
};

/** Error objects stringify to "{}" (their fields aren't enumerable); log what matters instead. */
function errorAware(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    const extra = value as Error & { code?: unknown; status?: unknown };
    return {
      name: value.name,
      message: value.message,
      ...(extra.code !== undefined ? { code: extra.code } : {}),
      ...(extra.status !== undefined ? { status: extra.status } : {}),
      stack: value.stack,
    };
  }
  return value;
}

export function serializeLog(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, errorAware);
}

function write(payload: LogPayload) {
  const serialized = serializeLog(payload);
  if (payload.level === "error") {
    console.error(serialized);
    return;
  }
  if (payload.level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  write({
    level: "info",
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  });
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  write({
    level: "warn",
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  });
}

export function logError(message: string, meta?: Record<string, unknown>) {
  write({
    level: "error",
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  });
}

const lastLoggedAt = new Map<string, number>();

/**
 * Logs at most once per `intervalMs` for a given `key` — for warnings that fire on
 * every retry of a background reconnect loop (e.g. Redis down for minutes),
 * where logging every attempt would flood the log with an identical line forever.
 * The retry itself still runs on its normal schedule; only the logging is throttled.
 */
export function logWarnThrottled(
  key: string,
  intervalMs: number,
  message: string,
  meta?: Record<string, unknown>,
) {
  const now = Date.now();
  const last = lastLoggedAt.get(key) ?? 0;
  if (now - last < intervalMs) return;
  lastLoggedAt.set(key, now);
  logWarn(message, meta);
}

/** Call when a throttled condition clears (e.g. reconnected), so the next new
 * outage logs immediately instead of waiting out a stale throttle window. */
export function resetLogThrottle(key: string) {
  lastLoggedAt.delete(key);
}
