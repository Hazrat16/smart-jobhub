"use client";

import { Job } from "@/types";
import { apiClient, getAuthToken, getUser } from "@/utils/api";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { Briefcase, Loader2, MapPin, Plus, Rocket, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const BOOST_PRICE_PER_DAY_BDT = 100;
const BOOST_DAY_OPTIONS = [3, 7, 14, 30];

function isJobFeatured(job: Job): boolean {
  return Boolean(job.featuredUntil && new Date(job.featuredUntil) > new Date());
}

export default function MyJobsPage() {
  const router = useRouter();
  const { ready } = useAuthGuard({ roles: ["employer"] });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [boostPanelJobId, setBoostPanelJobId] = useState<string | null>(null);
  const [boostDays, setBoostDays] = useState(7);
  const [boosting, setBoosting] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!getAuthToken() || getUser()?.role !== "employer") return;

    const load = async () => {
      const res = await apiClient.getMyJobs();
      if (!res.success) {
        toast.error(res.message || "Could not load your jobs");
        setLoading(false);
        return;
      }
      setJobs(res.data ?? []);
      setLoading(false);
    };

    void load();
  }, [ready, router]);

  const onStatusChange = async (jobId: string, status: "draft" | "active" | "closed") => {
    setStatusBusyId(jobId);
    try {
      const res = await apiClient.updateJobStatus(jobId, status);
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not update job status");
        return;
      }
      setJobs((prev) => prev.map((job) => (job._id === jobId ? res.data! : job)));
      toast.success("Job status updated");
    } finally {
      setStatusBusyId(null);
    }
  };

  const onBoost = async (jobId: string) => {
    setBoosting(true);
    try {
      const res = await apiClient.initJobBoostPayment(jobId, boostDays);
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not start payment");
        return;
      }
      window.location.href = res.data.gatewayUrl;
    } finally {
      setBoosting(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My job posts</h1>
            <p className="text-fg-muted mt-1">
              Manage listings you have published.
            </p>
          </div>
          <Link
            href="/post-job"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-end px-4 py-2 text-white transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Post a job
          </Link>
        </div>

        {jobs.length === 0 ? (
          <div className="bg-card rounded-lg shadow p-8 text-center text-fg-muted">
            <Briefcase className="mx-auto mb-3 h-12 w-12 text-fg-subtle" />
            <p className="mb-4">You have not posted any jobs yet.</p>
            <Link
              href="/post-job"
              className="text-accent font-medium hover:underline"
            >
              Post your first job
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {jobs.map((job) => (
              <li
                key={job._id}
                className="bg-card rounded-lg shadow border border-border p-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
                    <Link
                      href={`/jobs/${job._id}`}
                      className="hover:text-accent"
                    >
                      {job.title}
                    </Link>
                    {isJobFeatured(job) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        <Sparkles className="h-3 w-3" />
                        Featured
                      </span>
                    )}
                  </h2>
                  <p className="text-fg-muted text-sm">{job.company}</p>
                  <p className="text-fg-subtle text-sm flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {job.location}
                    <span className="mx-2">·</span>
                    <span className="capitalize">
                      {job.status === "active" ? "published" : job.status}
                    </span>
                    <span className="mx-2">·</span>
                    <span>
                      {job.applicationCount ?? 0}{" "}
                      {(job.applicationCount ?? 0) === 1 ? "applicant" : "applicants"}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <select
                    value={job.status}
                    disabled={statusBusyId === job._id}
                    onChange={(e) =>
                      void onStatusChange(
                        job._id,
                        e.target.value as "draft" | "active" | "closed",
                      )
                    }
                    className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                    aria-label="Change job status"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Published</option>
                    <option value="closed">Closed</option>
                  </select>
                  <Link
                    href={`/my-jobs/${job._id}/applications`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    View applicants
                  </Link>
                  <Link
                    href={`/jobs/${job._id}`}
                    className="text-sm text-fg-muted hover:underline"
                  >
                    Public listing
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setBoostPanelJobId((prev) => (prev === job._id ? null : job._id))
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    {isJobFeatured(job) ? "Extend boost" : "Boost"}
                  </button>
                </div>

                {boostPanelJobId === job._id && (
                  <div className="w-full basis-full rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="mb-2 text-sm font-medium text-foreground">
                      Pin &ldquo;{job.title}&rdquo; to the top of search results
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={boostDays}
                        onChange={(e) => setBoostDays(Number(e.target.value))}
                        className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                      >
                        {BOOST_DAY_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d} days — {d * BOOST_PRICE_PER_DAY_BDT} BDT
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={boosting}
                        onClick={() => void onBoost(job._id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {boosting ? "Redirecting…" : "Pay & boost"}
                      </button>
                      <span className="text-xs text-fg-subtle">
                        Redirects to SSLCommerz to complete payment.
                      </span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
