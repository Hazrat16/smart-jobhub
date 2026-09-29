"use client";

import { ActivitySummary, Job, JobApplication } from "@/types";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { apiClient, getUser } from "@/utils/api";
import { LineChart, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

function BarChart({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
}) {
  const max = rows[0]?.count ?? 1;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 8).map((row) => (
            <li key={row.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate text-fg-muted">{row.key}</span>
                <span className="font-medium text-foreground">{row.count}</span>
              </div>
              <div className="h-2 rounded-full bg-card-muted">
                <div
                  className="h-2 rounded-full bg-accent/70"
                  style={{ width: `${Math.max(6, Math.round((row.count / max) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toCountRows(countMap: Record<string, number>) {
  return Object.entries(countMap)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function countBy<T>(
  items: T[],
  toKey: (item: T) => string | undefined | null,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const rawKey = toKey(item);
    const key = rawKey?.trim() || "unknown";
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

function topApplicationJobs(jobs: Job[]) {
  return jobs
    .map((job) => ({ key: job.title, count: job.applicationCount ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function topAppliedJobTitles(applications: JobApplication[]) {
  return toCountRows(countBy(applications, (a) => a.job?.title));
}

function statusLabel(raw: string) {
  if (!raw) return "Unknown";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeStatusRows(rows: Array<{ key: string; count: number }>) {
  return rows.map((row) => ({ ...row, key: statusLabel(row.key) }));
}

function ActivityLineChart({
  points,
}: {
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

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-fg-subtle">No trend data yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
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
    </div>
  );
}

export default function AnalyticsPage() {
  const { ready } = useAuthGuard({});
  const user = getUser();
  const userId = user?._id;
  const userRole = user?.role;
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [myApplications, setMyApplications] = useState<JobApplication[]>([]);

  useEffect(() => {
    if (!ready || !userId || !userRole) return;
    const load = async () => {
      setLoading(true);
      try {
        const activityRes = await apiClient.getActivitySummary({
          userId,
          role: userRole,
        });
        if (activityRes.success && activityRes.data) setActivity(activityRes.data);
        if (userRole === "employer") {
          const jobsRes = await apiClient.getMyJobs();
          if (jobsRes?.success) setMyJobs(jobsRes.data ?? []);
        }
        if (userRole === "jobseeker") {
          const appRes = await apiClient.getMyApplications();
          if (appRes?.success) setMyApplications(appRes.data ?? []);
        }
      } catch {
        toast.error("Could not load analytics");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [ready, userId, userRole]);

  const employerTotals = useMemo(() => {
    const totalApplicants = myJobs.reduce((sum, j) => sum + (j.applicationCount ?? 0), 0);
    const activeJobs = myJobs.filter((j) => j.status === "active").length;
    return { totalApplicants, activeJobs };
  }, [myJobs]);

  const jobseekerTotals = useMemo(() => {
    const accepted = myApplications.filter((a) => a.status === "accepted").length;
    const shortlisted = myApplications.filter((a) => a.status === "shortlisted").length;
    return { accepted, shortlisted };
  }, [myApplications]);

  const jobsGraphRows = useMemo(() => {
    if (userRole === "employer") {
      return normalizeStatusRows(toCountRows(countBy(myJobs, (j) => j.status)));
    }
    return topAppliedJobTitles(myApplications);
  }, [myApplications, myJobs, userRole]);

  const applicationsGraphRows = useMemo(() => {
    if (userRole === "employer") {
      return topApplicationJobs(myJobs);
    }
    return normalizeStatusRows(toCountRows(countBy(myApplications, (a) => a.status)));
  }, [myApplications, myJobs, userRole]);

  if (!ready || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <LineChart className="h-6 w-6 text-accent" />
            My Analytics
          </h1>
          <p className="text-sm text-fg-muted">
            Activity and outcome insights based on your usage.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-fg-subtle">Tracked actions</p>
            <p className="text-2xl font-bold text-foreground">{activity?.totals.events ?? 0}</p>
          </div>
          {user?.role === "employer" ? (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-fg-subtle">Active jobs</p>
                <p className="text-2xl font-bold text-foreground">{employerTotals.activeJobs}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-fg-subtle">Total applicants</p>
                <p className="text-2xl font-bold text-foreground">{employerTotals.totalApplicants}</p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-fg-subtle">Shortlisted</p>
                <p className="text-2xl font-bold text-foreground">{jobseekerTotals.shortlisted}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-fg-subtle">Accepted</p>
                <p className="text-2xl font-bold text-foreground">{jobseekerTotals.accepted}</p>
              </div>
            </>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Actions graph (last 24h)</p>
          <ActivityLineChart points={activity?.trend24h ?? []} />
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BarChart title="Jobs graph" rows={jobsGraphRows} />
          <BarChart title="Applications graph" rows={applicationsGraphRows} />
        </section>
      </div>
    </div>
  );
}
