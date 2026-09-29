"use client";

import {
  ActivitySummary,
  DataDeletionRequest,
  ExternalJobSource,
  Job,
  User,
} from "@/types";
import { FilterSelect, type FilterSelectOption } from "@/components/FilterSelect";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { apiClient } from "@/utils/api";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

function BarChart({
  title,
  rows,
  tone = "accent",
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  tone?: "accent" | "link" | "success";
}) {
  const max = rows[0]?.count ?? 1;
  const barTone =
    tone === "link"
      ? "bg-link-soft/70"
      : tone === "success"
        ? "bg-success/70"
        : "bg-accent/70";

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-3 text-sm font-medium text-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const pct = Math.max(4, Math.round((row.count / max) * 100));
            return (
              <li key={row.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-fg-muted">{row.key}</span>
                  <span className="font-semibold text-foreground">{row.count}</span>
                </div>
                <div className="h-2 rounded-full bg-card-muted">
                  <div className={`h-2 rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActivityLineChart({
  title,
  points,
}: {
  title: string;
  points: Array<{ label: string; count: number }>;
}) {
  const chartWidth = 760;
  const chartHeight = 220;
  const padLeft = 36;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 30;
  const innerWidth = chartWidth - padLeft - padRight;
  const innerHeight = chartHeight - padTop - padBottom;

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const toX = (i: number) => padLeft + i * stepX;
  const toY = (count: number) => padTop + innerHeight - (count / maxCount) * innerHeight;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.count).toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      {points.length === 0 ? (
        <p className="text-sm text-fg-subtle">No trend data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-56 w-full min-w-[760px]">
            {[0, 1, 2, 3, 4].map((idx) => {
              const y = padTop + (innerHeight / 4) * idx;
              return (
                <line
                  key={idx}
                  x1={padLeft}
                  y1={y}
                  x2={chartWidth - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
              );
            })}

            <path d={path} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2.5} />
            {points.map((p, i) => (
              <circle
                key={`${p.label}-${i}`}
                cx={toX(i)}
                cy={toY(p.count)}
                r={3}
                fill="currentColor"
                className="text-accent"
              />
            ))}

            <line
              x1={padLeft}
              y1={chartHeight - padBottom}
              x2={chartWidth - padRight}
              y2={chartHeight - padBottom}
              stroke="currentColor"
              className="text-border-strong"
              strokeWidth={1.2}
            />
            <line
              x1={padLeft}
              y1={padTop}
              x2={padLeft}
              y2={chartHeight - padBottom}
              stroke="currentColor"
              className="text-border-strong"
              strokeWidth={1.2}
            />

            {points.map((p, i) =>
              i % 3 === 0 || i === points.length - 1 ? (
                <text
                  key={`x-${p.label}-${i}`}
                  x={toX(i)}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="fill-fg-subtle text-[10px]"
                >
                  {p.label}
                </text>
              ) : null,
            )}

            {[0, Math.round(maxCount / 2), maxCount].map((value) => (
              <text
                key={`y-${value}`}
                x={padLeft - 6}
                y={toY(value) + 3}
                textAnchor="end"
                className="fill-fg-subtle text-[10px]"
              >
                {value}
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { ready } = useAuthGuard({ roles: ["admin"] });
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"analytics" | "users" | "jobs" | "deletions">(
    "analytics",
  );
  const [users, setUsers] = useState<User[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DataDeletionRequest[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [externalSources, setExternalSources] = useState<ExternalJobSource[]>([]);
  const [syncingExternal, setSyncingExternal] = useState(false);
  const [selectedSourceKey, setSelectedSourceKey] = useState("");
  const sourceOptions: FilterSelectOption[] = [
    { value: "", label: "All external sources" },
    ...externalSources.map((source) => ({
      value: source.companyKey,
      label: source.companyName,
    })),
  ];

  useEffect(() => {
    if (!ready) return;
    const load = async () => {
      setLoading(true);
      try {
        const [u, j, d, a] = await Promise.all([
          apiClient.adminListUsers(),
          apiClient.adminListJobs(),
          apiClient.adminListDeletionRequests(),
          apiClient.getActivitySummary(),
        ]);
        const sources = await apiClient.getExternalSources();
        if (u.success) setUsers(u.data || []);
        if (j.success) setJobs(j.data || []);
        if (d.success) setDeletionRequests(d.data || []);
        if (a.success && a.data) setActivitySummary(a.data);
        if (sources.success) setExternalSources(sources.data || []);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [ready]);

  const moderateUser = async (
    id: string,
    action: "suspend" | "unsuspend" | "soft_delete" | "promote_to_admin",
  ) => {
    setBusyId(id);
    try {
      const res = await apiClient.adminModerateUser(id, action);
      if (!res.success || !res.data) return toast.error(res.message || "Could not update user");
      setUsers((prev) => prev.map((u) => (u._id === id ? res.data! : u)));
      toast.success("User updated");
    } finally {
      setBusyId(null);
    }
  };

  const moderateJob = async (id: string, action: "close" | "soft_delete" | "restore") => {
    setBusyId(id);
    try {
      const res = await apiClient.adminModerateJob(id, action);
      if (!res.success || !res.data) return toast.error(res.message || "Could not update job");
      setJobs((prev) => prev.map((j) => (j._id === id ? res.data! : j)));
      toast.success("Job updated");
    } finally {
      setBusyId(null);
    }
  };

  const reviewRequest = async (
    id: string,
    status: "approved" | "rejected" | "processed",
  ) => {
    setBusyId(id);
    try {
      const res = await apiClient.adminReviewDeletionRequest(id, status);
      if (!res.success || !res.data) return toast.error(res.message || "Could not update request");
      setDeletionRequests((prev) => prev.map((r) => (r._id === id ? res.data! : r)));
      toast.success("Request updated");
    } finally {
      setBusyId(null);
    }
  };

  const syncExternalJobs = async () => {
    setSyncingExternal(true);
    try {
      const res = await apiClient.adminSyncExternalJobs(selectedSourceKey || undefined);
      if (!res.success || !res.data) {
        toast.error(res.message || "Failed to sync external jobs");
        return;
      }
      const totalUpserts = res.data.reduce((sum, item) => sum + item.upserted, 0);
      const totalFetched = res.data.reduce((sum, item) => sum + item.fetched, 0);
      const failures = res.data.filter((item) => item.error);
      if (failures.length > 0) {
        toast.error(
          `Sync finished with ${failures.length} source error(s). Fetched ${totalFetched}, upserted ${totalUpserts}.`,
        );
      } else {
        toast.success(`Sync complete. Fetched ${totalFetched}, upserted ${totalUpserts}.`);
      }
      const refreshed = await apiClient.getExternalSources();
      if (refreshed.success) setExternalSources(refreshed.data || []);
    } finally {
      setSyncingExternal(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h1 className="text-2xl font-bold text-foreground">Admin moderation</h1>
          <p className="text-sm text-fg-muted">Review users, jobs, and deletion requests.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveView("analytics")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                activeView === "analytics"
                  ? "bg-accent-muted text-foreground"
                  : "border border-border text-fg-muted hover:bg-card-muted"
              }`}
            >
              Analytics
            </button>
            <button
              type="button"
              onClick={() => setActiveView("users")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                activeView === "users"
                  ? "bg-accent-muted text-foreground"
                  : "border border-border text-fg-muted hover:bg-card-muted"
              }`}
            >
              Users
            </button>
            <button
              type="button"
              onClick={() => setActiveView("jobs")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                activeView === "jobs"
                  ? "bg-accent-muted text-foreground"
                  : "border border-border text-fg-muted hover:bg-card-muted"
              }`}
            >
              Jobs
            </button>
            <button
              type="button"
              onClick={() => setActiveView("deletions")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                activeView === "deletions"
                  ? "bg-accent-muted text-foreground"
                  : "border border-border text-fg-muted hover:bg-card-muted"
              }`}
            >
              Deletion Requests
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">External jobs sync</p>
            <p className="mb-3 text-xs text-fg-subtle">
              Pull latest jobs from tracked company sites.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <FilterSelect
                id="admin-external-source"
                value={selectedSourceKey}
                onChange={setSelectedSourceKey}
                options={sourceOptions}
                fullWidth={false}
              />
              <button
                type="button"
                onClick={() => void syncExternalJobs()}
                disabled={syncingExternal}
                className="rounded-md border border-accent px-3 py-1.5 text-sm text-accent disabled:opacity-60"
              >
                {syncingExternal ? "Syncing..." : "Sync External Jobs"}
              </button>
            </div>
          </div>
        </section>

        {activeView === "analytics" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">User activity analytics</h2>
          {!activitySummary ? (
            <p className="text-sm text-fg-subtle">No activity data yet.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-fg-subtle">Total events</p>
                  <p className="text-xl font-bold text-foreground">{activitySummary.totals.events}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-fg-subtle">Unique paths</p>
                  <p className="text-xl font-bold text-foreground">{activitySummary.totals.uniquePaths}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-fg-subtle">Roles active</p>
                  <p className="text-xl font-bold text-foreground">{activitySummary.totals.uniqueRoles}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <BarChart title="Top events" rows={activitySummary.byEvent.slice(0, 8)} tone="accent" />
                <BarChart title="Top pages" rows={activitySummary.byPath.slice(0, 8)} tone="link" />
                <BarChart title="Role activity" rows={activitySummary.byRole} tone="success" />
              </div>

              <ActivityLineChart
                title="Activity trend (last 24h)"
                points={activitySummary.trend24h}
              />

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium text-foreground">Recent activity</p>
                <ul className="max-h-64 space-y-1 overflow-auto text-xs">
                  {activitySummary.recent.slice(0, 30).map((row, idx) => (
                    <li key={`${row.timestamp}-${idx}`} className="rounded border border-border px-2 py-1 text-fg-muted">
                      <span className="font-medium text-foreground">{row.event}</span> · {row.path} ·{" "}
                      {row.role || "unknown"} · {new Date(row.timestamp).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
        )}

        {activeView === "users" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Users</h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <div className="min-w-[14rem] flex-1 text-sm">
                  <p className="font-medium text-foreground">{u.name} ({u.role})</p>
                  <p className="text-fg-subtle">{u.email}</p>
                </div>
                <button disabled={busyId===u._id} onClick={() => void moderateUser(u._id, "suspend")} className="rounded-md border border-border px-2 py-1 text-xs">Suspend</button>
                <button disabled={busyId===u._id} onClick={() => void moderateUser(u._id, "unsuspend")} className="rounded-md border border-border px-2 py-1 text-xs">Unsuspend</button>
                <button disabled={busyId===u._id} onClick={() => void moderateUser(u._id, "soft_delete")} className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive">Soft delete</button>
                {u.role !== "admin" && (
                  <button
                    disabled={busyId===u._id}
                    onClick={() => void moderateUser(u._id, "promote_to_admin")}
                    className="rounded-md border border-accent px-2 py-1 text-xs text-accent"
                  >
                    Make admin
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        )}

        {activeView === "jobs" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Jobs</h2>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <div className="min-w-[14rem] flex-1 text-sm">
                  <p className="font-medium text-foreground">{j.title}</p>
                  <p className="text-fg-subtle">{j.company} · {j.status}{j.deletedAt ? " · archived" : ""}</p>
                </div>
                <button disabled={busyId===j._id} onClick={() => void moderateJob(j._id, "close")} className="rounded-md border border-border px-2 py-1 text-xs">Close</button>
                <button disabled={busyId===j._id} onClick={() => void moderateJob(j._id, "soft_delete")} className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive">Soft delete</button>
                <button disabled={busyId===j._id} onClick={() => void moderateJob(j._id, "restore")} className="rounded-md border border-border px-2 py-1 text-xs">Restore</button>
              </div>
            ))}
          </div>
        </section>
        )}

        {activeView === "deletions" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Data deletion requests</h2>
          <div className="space-y-2">
            {deletionRequests.map((r) => (
              <div key={r._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <div className="min-w-[14rem] flex-1 text-sm">
                  <p className="font-medium text-foreground">Status: {r.status}</p>
                  <p className="text-fg-subtle">{r.reason || "No reason provided"}</p>
                </div>
                <button disabled={busyId===r._id} onClick={() => void reviewRequest(r._id, "approved")} className="rounded-md border border-border px-2 py-1 text-xs">Approve</button>
                <button disabled={busyId===r._id} onClick={() => void reviewRequest(r._id, "rejected")} className="rounded-md border border-border px-2 py-1 text-xs">Reject</button>
                <button disabled={busyId===r._id} onClick={() => void reviewRequest(r._id, "processed")} className="rounded-md border border-border px-2 py-1 text-xs">Mark processed</button>
              </div>
            ))}
          </div>
        </section>
        )}
      </div>
    </div>
  );
}
