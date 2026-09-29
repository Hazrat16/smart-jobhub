export type StoredActivityEvent = {
  event: string;
  timestamp: number;
  path: string;
  href?: string;
  role?: string;
  userId?: string | null;
  properties?: Record<string, unknown>;
};

export type ActivityTrendPoint = {
  label: string;
  timestamp: number;
  count: number;
};

const MAX_EVENTS = 5000;
const events: StoredActivityEvent[] = [];

export function pushActivityEvent(event: StoredActivityEvent) {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

export function getRecentActivityEvents(limit = 100): StoredActivityEvent[] {
  return events.slice(-Math.max(1, limit)).reverse();
}

export function getActivitySummary() {
  return getActivitySummaryFor();
}

export function getActivitySummaryFor(filter?: {
  userId?: string;
  role?: string;
}) {
  const byEvent = new Map<string, number>();
  const byPath = new Map<string, number>();
  const byRole = new Map<string, number>();

  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const bucketCount = 24;
  const buckets: ActivityTrendPoint[] = Array.from({ length: bucketCount }, (_, idx) => {
    const bucketStart = now - (bucketCount - 1 - idx) * hourMs;
    const dt = new Date(bucketStart);
    const label = `${String(dt.getHours()).padStart(2, "0")}:00`;
    return { label, timestamp: bucketStart, count: 0 };
  });

  const filtered = events.filter((e) => {
    if (filter?.userId && e.userId !== filter.userId) return false;
    if (filter?.role && e.role !== filter.role) return false;
    return true;
  });

  for (const e of filtered) {
    byEvent.set(e.event, (byEvent.get(e.event) ?? 0) + 1);
    byPath.set(e.path || "/", (byPath.get(e.path || "/") ?? 0) + 1);
    byRole.set(e.role || "unknown", (byRole.get(e.role || "unknown") ?? 0) + 1);
    const diff = now - e.timestamp;
    if (diff >= 0 && diff < bucketCount * hourMs) {
      const indexFromNow = Math.floor(diff / hourMs);
      const bucketIndex = bucketCount - 1 - indexFromNow;
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].count += 1;
      }
    }
  }

  const toSortedEntries = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count }));

  return {
    totals: {
      events: filtered.length,
      uniquePaths: byPath.size,
      uniqueRoles: byRole.size,
    },
    byEvent: toSortedEntries(byEvent),
    byPath: toSortedEntries(byPath),
    byRole: toSortedEntries(byRole),
    trend24h: buckets,
    recent: filtered.slice(-40).reverse(),
  };
}
