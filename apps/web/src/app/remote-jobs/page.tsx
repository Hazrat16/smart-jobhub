"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { RemoteJobListing } from "@/types";
import { FilterSelect, type FilterSelectOption } from "@/components/FilterSelect";
import { apiClient } from "@/utils/api";
import { Briefcase, ExternalLink, Globe, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

export default function RemoteJobsPage() {
  const { ready } = useAuthGuard({ roles: ["jobseeker"] });
  const [jobs, setJobs] = useState<RemoteJobListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<
    "" | "remotive" | "arbeitnow" | "remoteok" | "themuse"
  >("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const PAGE_SIZE = 20;
  const SOURCE_OPTIONS: FilterSelectOption[] = [
    { value: "", label: "All sources" },
    { value: "remotive", label: "Remotive" },
    { value: "arbeitnow", label: "Arbeitnow" },
    { value: "remoteok", label: "RemoteOK" },
    { value: "themuse", label: "The Muse" },
  ];

  useEffect(() => {
    setPage(1);
  }, [query, source]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getRemoteJobs({
          search: query || undefined,
          source: source || undefined,
          limit: PAGE_SIZE,
          page,
        });
        if (cancelled) return;
        if (!res.success) {
          toast.error(res.message || "Failed to load remote jobs");
          return;
        }
        setJobs(res.data || []);
        setTotal(Number(res.meta?.total) || 0);
        setSourceCounts((res.meta?.sourceCounts as Record<string, number>) || {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ready, query, source, page]);

  const sorted = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return db - da;
      }),
    [jobs],
  );

  if (!ready) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-fg-muted">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Remote Jobs</h1>
          <p className="text-sm text-fg-muted">
            Aggregated from free job APIs (Remotive and Arbeitnow).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { key: "remotive", label: "Remotive" },
              { key: "arbeitnow", label: "Arbeitnow" },
              { key: "remoteok", label: "RemoteOK" },
              { key: "themuse", label: "The Muse" },
            ].map((item) => (
              <span
                key={item.key}
                className="rounded-full border border-border bg-card-muted px-2.5 py-1 text-xs text-fg-muted"
              >
                {item.label}: {sourceCounts[item.key] ?? 0}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, company, tags..."
              className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <FilterSelect
            id="remote-jobs-source"
            value={source}
            onChange={(value) =>
              setSource(
                value as "" | "remotive" | "arbeitnow" | "remoteok" | "themuse",
              )
            }
            options={SOURCE_OPTIONS}
            fullWidth={false}
          />
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading remote jobs">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="animate-pulse">
                  <div className="mb-3 h-5 w-2/3 rounded bg-skeleton" />
                  <div className="mb-2 flex flex-wrap gap-2">
                    <div className="h-4 w-28 rounded bg-card-muted" />
                    <div className="h-4 w-24 rounded bg-card-muted" />
                    <div className="h-4 w-20 rounded bg-card-muted" />
                  </div>
                  <div className="mt-3 flex gap-1">
                    <div className="h-5 w-16 rounded bg-card-muted" />
                    <div className="h-5 w-14 rounded bg-card-muted" />
                    <div className="h-5 w-20 rounded bg-card-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Globe className="mx-auto mb-2 h-8 w-8 text-fg-subtle" />
            <p className="font-medium text-foreground">No remote jobs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((job) => (
              <article key={job.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground">{job.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        {job.company}
                      </span>
                      <span>{job.location}</span>
                      <span className="rounded-full bg-card-muted px-2 py-0.5 text-xs uppercase">
                        {job.source}
                      </span>
                    </div>
                    {job.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {job.tags.slice(0, 6).map((t) => (
                          <span key={t} className="rounded bg-card-muted px-2 py-0.5 text-xs text-fg-muted">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
                  >
                    Apply
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && total > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-fg-subtle">
              Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= Math.ceil(total / PAGE_SIZE)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

