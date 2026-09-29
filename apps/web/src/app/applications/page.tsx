"use client";

import { JobApplication } from "@/types";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { apiClient } from "@/utils/api";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-900 ring-1 ring-amber-100",
  reviewed: "bg-sky-50 text-sky-900 ring-1 ring-sky-100",
  shortlisted: "bg-violet-50 text-violet-900 ring-1 ring-violet-100",
  rejected: "bg-red-50 text-red-800 ring-1 ring-red-100",
  accepted: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100",
};

const STATUS_LABEL: Record<JobApplication["status"], string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  accepted: "Accepted",
};

export default function ApplicationsPage() {
  const { ready } = useAuthGuard({ roles: ["jobseeker"] });
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!ready) return;
    const loadApplications = async () => {
      try {
        const response = await apiClient.getMyApplications();
        if (!response.success) {
          const msg = response.message || "Failed to load applications";
          setErrorMessage(msg);
          toast.error(msg);
          return;
        }
        setErrorMessage("");
        setApplications(response.data || []);
      } finally {
        setLoading(false);
      }
    };

    void loadApplications();
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <span className="text-sm text-fg-muted">Checking access…</span>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">My applications</h1>
          <p className="mt-1 text-fg-muted">
            Track roles you have applied to and open the listing anytime.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading applications">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-border bg-card shadow-sm"
              />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-8 text-center text-fg-muted">
            <p className="mb-2 font-medium text-foreground">Could not load applications</p>
            <p className="mb-4 text-sm">{errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-fg-muted hover:bg-card-muted"
            >
              Try again
            </button>
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-fg-muted">
            <p className="mb-4">You have not applied to any jobs yet.</p>
            <Link
              href="/jobs"
              className="inline-flex rounded-xl bg-gradient-to-r from-accent to-accent-end px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
            >
              Browse jobs
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {applications.map((application) => (
              <li
                key={application._id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    {application.job?.title ?? "Job"}
                  </h2>
                  <p className="text-fg-muted">{application.job?.company}</p>
                  <p className="mt-1 text-sm text-fg-subtle">
                    Applied {new Date(application.createdAt).toLocaleDateString()}
                  </p>
                  <div className="mt-3 rounded-lg bg-card-muted/40 px-3 py-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                      Timeline
                    </p>
                    <ol className="space-y-1 text-xs text-fg-muted">
                      {(application.statusHistory && application.statusHistory.length > 0
                        ? application.statusHistory
                        : [{ status: application.status, changedAt: application.updatedAt }]
                      ).map((entry, idx) => (
                        <li key={`${entry.status}-${entry.changedAt}-${idx}`}>
                          <span className="font-medium text-foreground">
                            {STATUS_LABEL[entry.status as JobApplication["status"]] ??
                              entry.status}
                          </span>{" "}
                          — {new Date(entry.changedAt).toLocaleString()}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${
                      statusColors[application.status] || "bg-card-muted text-fg-muted ring-1 ring-border"
                    }`}
                  >
                    {application.status}
                  </span>
                  <Link
                    href={`/jobs/${application.job?._id}`}
                    className="text-sm font-semibold text-accent hover:text-link"
                  >
                    View job →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
