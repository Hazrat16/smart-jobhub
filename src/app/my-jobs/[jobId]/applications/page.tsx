"use client";

import { JobApplication } from "@/types";
import { apiClient, getAuthToken, getUser } from "@/utils/api";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

const STATUS_OPTIONS: JobApplication["status"][] = [
  "pending",
  "reviewed",
  "shortlisted",
  "rejected",
  "accepted",
];

const STATUS_LABEL: Record<JobApplication["status"], string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  accepted: "Accepted",
};

export default function JobApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = typeof params["jobId"] === "string" ? params["jobId"] : "";

  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await apiClient.getJobApplications(jobId);
      if (!res.success) {
        toast.error(res.message || "Could not load applicants");
        if (res.message?.toLowerCase().includes("authorized")) {
          router.replace("/my-jobs");
        }
        setApplications([]);
        return;
      }
      setApplications(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [jobId, router]);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
      return;
    }
    if (getUser()?.role !== "employer") {
      router.replace("/jobs");
      return;
    }
    void load();
  }, [router, load]);

  const jobTitle = applications[0]?.job?.title;

  const onStatusChange = async (applicationId: string, status: JobApplication["status"]) => {
    setUpdatingId(applicationId);
    try {
      const res = await apiClient.updateApplicationStatus(applicationId, status);
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not update status");
        return;
      }
      setApplications((prev) =>
        prev.map((a) => (a._id === applicationId ? (res.data as JobApplication) : a)),
      );
      toast.success("Status updated");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!jobId) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/my-jobs"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-link"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to my jobs
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Applicants</h1>
          {jobTitle && (
            <p className="mt-1 text-fg-muted">
              <span className="font-medium text-foreground">{jobTitle}</span>
            </p>
          )}
          <p className="mt-2 text-sm text-fg-subtle">
            {applications.length}{" "}
            {applications.length === 1 ? "person has" : "people have"} applied. Each row
            includes the résumé submitted with that application and basic contact details.
          </p>
        </div>

        {applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-fg-muted">
            No applications yet. When job seekers apply, they will appear here with their CV
            link.
          </div>
        ) : (
          <ul className="space-y-4">
            {applications.map((app) => {
              const profileResume = app.applicant?.profile?.resumeUrl;
              return (
                <li
                  key={app._id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <User className="h-5 w-5 shrink-0 text-fg-subtle" aria-hidden />
                        <span className="text-lg font-semibold text-foreground">
                          {app.applicant?.name ?? "Applicant"}
                        </span>
                      </div>
                      <a
                        href={`mailto:${app.applicant?.email}`}
                        className="mt-1 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                      >
                        <Mail className="h-4 w-4" />
                        {app.applicant?.email}
                      </a>
                      <p className="mt-2 text-xs text-fg-subtle">
                        Applied {new Date(app.createdAt).toLocaleString()}
                      </p>
                      {app.coverLetter?.trim() && (
                        <div className="mt-3 rounded-lg bg-card-muted p-3 text-sm text-fg-muted">
                          <span className="font-medium text-fg-muted">Cover note: </span>
                          {app.coverLetter}
                        </div>
                      )}
                      <div className="mt-4 rounded-lg border border-border bg-card-muted/35 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                          Application timeline
                        </p>
                        <ol className="space-y-2 text-xs text-fg-muted">
                          {(app.statusHistory && app.statusHistory.length > 0
                            ? app.statusHistory
                            : [{ status: app.status, changedAt: app.updatedAt }])
                          .map((entry, idx) => (
                            <li key={`${entry.status}-${entry.changedAt}-${idx}`}>
                              <span className="font-medium text-foreground">
                                {STATUS_LABEL[entry.status as JobApplication["status"]] ??
                                  entry.status}
                              </span>{" "}
                              on{" "}
                              {new Date(entry.changedAt).toLocaleString()}
                              {entry.note ? ` — ${entry.note}` : ""}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-fg-subtle">
                          Status
                        </label>
                        <select
                          className="w-full min-w-[10rem] rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                          value={app.status}
                          disabled={updatingId === app._id}
                          onChange={(e) =>
                            void onStatusChange(
                              app._id,
                              e.target.value as JobApplication["status"],
                            )
                          }
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <a
                          href={app.resume}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:opacity-90"
                        >
                          <FileText className="h-4 w-4" />
                          Application CV
                          <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
                        </a>
                        {profileResume ? (
                          <a
                            href={profileResume}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-card-muted"
                          >
                            Profile résumé
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : null}
                        {app.applicant?._id && (
                          <Link
                            href={`/messages/${app.applicant._id}?name=${encodeURIComponent(
                              app.applicant.name || "Applicant",
                            )}&photo=${encodeURIComponent(app.applicant.photo || "")}`}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-card-muted"
                          >
                            <MessageCircle className="h-4 w-4" />
                            Message
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
