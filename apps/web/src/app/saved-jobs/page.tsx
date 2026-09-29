"use client";

import { Job } from "@/types";
import { apiClient } from "@/utils/api";
import { BookmarkX, Briefcase, MapPin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function SavedJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSavedJobs();
      if (!response.success) {
        toast.error(response.message || "Failed to load saved jobs");
        setJobs([]);
        return;
      }
      setJobs(response.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const handleUnsave = async (jobId: string) => {
    setRemovingId(jobId);
    try {
      const response = await apiClient.unsaveJob(jobId);
      if (!response.success) {
        toast.error(response.message || "Could not remove job");
        return;
      }
      setJobs((prev) => prev.filter((j) => j._id !== jobId));
      toast.success("Removed from saved jobs");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="mb-2 bg-gradient-to-r from-foreground via-accent to-foreground dark:via-accent-end bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
          Saved Jobs
        </h1>
        <p className="mb-6 text-fg-muted">
          Jobs you bookmarked from the browse list. Sign in as a job seeker to use this list.
        </p>

        {loading ? (
          <div className="text-fg-subtle">Loading saved jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-accent/40 bg-card/70 p-6 text-fg-muted shadow-inner backdrop-blur-sm">
            No saved jobs yet.{" "}
            <Link href="/jobs" className="font-medium text-accent hover:underline">
              Browse jobs
            </Link>{" "}
            and tap the bookmark icon on a listing.
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job._id}
                className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-5 shadow-lg ring-1 ring-foreground/5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    <Link href={`/jobs/${job._id}`} className="transition-colors hover:text-accent">
                      {job.title}
                    </Link>
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      {job.company}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {job.location}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/jobs/${job._id}`}
                    className="rounded-md bg-gradient-to-r from-accent to-accent-end px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleUnsave(job._id)}
                    disabled={removingId === job._id}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-fg-muted border border-border-strong rounded-md hover:bg-card-muted disabled:opacity-50"
                    title="Remove from saved"
                  >
                    <BookmarkX className="h-4 w-4" />
                    {removingId === job._id ? "..." : "Unsave"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
