"use client";

import type { ExternalJobPosting } from "@/types";
import { apiClient } from "@/utils/api";
import { Briefcase, ExternalLink, Globe, MapPin, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import toast from "react-hot-toast";

const COMPANY_OPTIONS = [
  { key: "", label: "All companies" },
  { key: "enosis", label: "Enosis Solutions" },
  { key: "dsi", label: "DSI" },
  { key: "vivasoft", label: "Vivasoft" },
  { key: "cefalo", label: "Cefalo" },
  { key: "trekarsh", label: "Trekarsh" },
];

export default function ExternalJobsPage() {
  const [jobs, setJobs] = useState<ExternalJobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [companyKey, setCompanyKey] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getExternalJobs({
          companyKey: companyKey || undefined,
        });
        if (cancelled) return;
        if (!response.success) {
          toast.error(response.message || "Failed to load external jobs");
          return;
        }
        setJobs(response.data ?? []);
      } catch {
        if (!cancelled) toast.error("Failed to load external jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [companyKey, reloadToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      const text = `${j.title} ${j.companyName} ${j.location} ${j.descriptionSnippet ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [jobs, search]);

  return (
    <div className="min-h-screen">
      <div className="border-b border-border/40 bg-gradient-to-br from-card/90 via-accent-muted/60 to-hold/15 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            External Jobs
          </h1>
          <p className="mt-3 max-w-2xl text-fg-muted">
            Jobs aggregated from company career sites. Applications continue on the original company pages.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, company, or location"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <select
            value={companyKey}
            onChange={(e) => setCompanyKey(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {COMPANY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-card-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-foreground">{filtered.length}</span> external{" "}
          {filtered.length === 1 ? "job" : "jobs"} found
        </p>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-fg-muted">
            Loading external jobs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Globe className="mx-auto mb-3 h-10 w-10 text-fg-subtle" />
            <p className="font-medium text-foreground">No external jobs found</p>
            <p className="mt-1 text-sm text-fg-muted">
              Try another company filter or broader search text.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((job) => (
              <article key={job._id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-foreground">{job.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-muted">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        {job.companyName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location || "Location not specified"}
                      </span>
                    </div>
                    {job.descriptionSnippet ? (
                      <p className="mt-3 line-clamp-3 text-sm text-fg-muted">{job.descriptionSnippet}</p>
                    ) : null}
                  </div>
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Apply
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

