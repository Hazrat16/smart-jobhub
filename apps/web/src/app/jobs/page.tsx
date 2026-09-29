"use client";

import {
  FilterSelect,
  type FilterSelectOption,
} from "@/components/FilterSelect";
import { Job } from "@/types";
import { apiClient, getUser } from "@/utils/api";
import {
  Bookmark,
  BookmarkPlus,
  Briefcase,
  Calendar,
  DollarSign,
  Filter,
  MapPin,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const JOB_TYPE_FILTER_OPTIONS: FilterSelectOption[] = [
  { value: "", label: "All Types" },
  { value: "full-time", label: "Full Time" },
  { value: "part-time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const SALARY_FILTER_OPTIONS: FilterSelectOption[] = [
  { value: "", label: "All Salaries" },
  { value: "0-50000", label: "$0 - $50,000" },
  { value: "50000-100000", label: "$50,000 - $100,000" },
  { value: "100000-150000", label: "$100,000 - $150,000" },
  { value: "150000-200000", label: "$150,000 - $200,000" },
  { value: "200000-999999", label: "$200,000+" },
];

const SORT_OPTIONS: FilterSelectOption[] = [
  { value: "recent", label: "Most Recent" },
  { value: "salary_desc", label: "Salary: High to Low" },
  { value: "salary_asc", label: "Salary: Low to High" },
];

const PAGE_SIZE = 20;

function JobsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || ""
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSalary, setSelectedSalary] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
  const [bookmarkBusyId, setBookmarkBusyId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("recent");
  const [loading, setLoading] = useState(false);

  const filterKey = useMemo(
    () =>
      [searchQuery, selectedLocation, selectedType, selectedSalary, sortBy].join("|"),
    [searchQuery, selectedLocation, selectedType, selectedSalary, sortBy],
  );
  const prevFilterKeyRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const filtersChanged =
      prevFilterKeyRef.current !== null && prevFilterKeyRef.current !== filterKey;
    prevFilterKeyRef.current = filterKey;
    const pageToFetch = filtersChanged ? 1 : page;
    if (filtersChanged) {
      setPage(1);
    }

    const run = async () => {
      const requestId = ++activeRequestIdRef.current;
      setLoading(true);
      try {
        const salaryParts = selectedSalary
          ? selectedSalary.split("-").map((val) => parseInt(val, 10))
          : [];
        const minSalary = salaryParts[0];
        const maxSalary = salaryParts[1];

        const response = await apiClient.getJobs({
          search: searchQuery || undefined,
          location: selectedLocation || undefined,
          type: selectedType || undefined,
          minSalary: Number.isFinite(minSalary) ? minSalary : undefined,
          maxSalary: Number.isFinite(maxSalary) ? maxSalary : undefined,
          sort: sortBy,
          limit: PAGE_SIZE,
          page: pageToFetch,
        });

        if (cancelled) return;
        if (!response.success) {
          toast.error(response.message || "Failed to load jobs");
          return;
        }

        setFilteredJobs(response.data || []);
        const total = Number(response.meta?.total);
        setTotalJobs(Number.isFinite(total) ? total : (response.data || []).length);
      } catch {
        if (!cancelled) toast.error("Failed to load jobs");
      } finally {
        if (!cancelled && activeRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [filterKey, page, searchQuery, selectedLocation, selectedType, selectedSalary, sortBy]);

  useEffect(() => {
    const user = getUser();
    if (user?.role !== "jobseeker") {
      setSavedJobIds([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await apiClient.getSavedJobs();
      if (cancelled || !response.success || !response.data) return;
      setSavedJobIds(response.data.map((j) => j._id));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSavedJob = async (jobId: string) => {
    const user = getUser();
    if (!user) {
      toast.error("Sign in to save jobs");
      router.push("/login");
      return;
    }
    if (user.role !== "jobseeker") {
      toast.error("Only job seekers can save jobs");
      return;
    }
    if (bookmarkBusyId) return;

    const isSaved = savedJobIds.includes(jobId);
    setBookmarkBusyId(jobId);
    try {
      if (isSaved) {
        const response = await apiClient.unsaveJob(jobId);
        if (!response.success) {
          toast.error(response.message || "Could not unsave job");
          return;
        }
        setSavedJobIds((prev) => prev.filter((id) => id !== jobId));
        toast.success("Removed from saved jobs");
      } else {
        const response = await apiClient.saveJob(jobId);
        if (!response.success) {
          toast.error(response.message || "Could not save job");
          return;
        }
        setSavedJobIds((prev) =>
          prev.includes(jobId) ? prev : [...prev, jobId],
        );
        toast.success("Job saved");
      }
    } finally {
      setBookmarkBusyId(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedLocation("");
    setSelectedType("");
    setSelectedSalary("");
  };

  const formatSalary = (salary: Job["salary"]) => {
    return `${salary.currency}${salary.min.toLocaleString()} - ${
      salary.currency
    }${salary.max.toLocaleString()}`;
  };

  const getJobTypeColor = (type: string) => {
    const colors = {
      "full-time": "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100",
      "part-time": "bg-sky-50 text-sky-800 ring-1 ring-sky-100",
      contract: "bg-violet-50 text-violet-800 ring-1 ring-violet-100",
      internship: "bg-amber-50 text-amber-900 ring-1 ring-amber-100",
    };
    return colors[type as keyof typeof colors] || "bg-card-muted text-fg-muted ring-1 ring-border";
  };

  const fieldClass =
    "w-full rounded-xl border border-border bg-card/90 px-3 py-2.5 text-sm text-foreground shadow-inner shadow-foreground/5 transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

  return (
    <div className="min-h-screen">
      <div className="border-b border-border/40 bg-gradient-to-br from-card/90 via-accent-muted/60 to-hold/15 shadow-sm backdrop-blur-md dark:via-[#1a2e47]/50 dark:to-hold/25">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="bg-gradient-to-r from-foreground via-accent to-foreground dark:via-accent-end bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
            Find your next role
          </h1>
          <p className="mt-3 max-w-2xl text-fg-muted">
            Filter by keywords, location, and salary. Save jobs when you are signed in as a
            job seeker.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-3xl border border-border/70 bg-card/75 p-6 shadow-xl shadow-foreground/5 ring-1 ring-foreground/5 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Filters</h2>
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-card-muted hover:text-foreground lg:hidden"
                  aria-expanded={showFilters}
                  aria-controls="job-filters"
                  aria-label={showFilters ? "Hide filters" : "Show filters"}
                >
                  {showFilters ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Filter className="h-5 w-5" />
                  )}
                </button>
              </div>

              <div
                id="job-filters"
                className={`lg:block ${showFilters ? "block" : "hidden"}`}
              >
                <div className="mb-6">
                  <label
                    htmlFor="search"
                    className="mb-2 block text-sm font-medium text-fg-muted"
                  >
                    Search
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                    <input
                      type="text"
                      id="search"
                      placeholder="Job title, company…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`${fieldClass} pl-10`}
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="jobs-filter-location"
                    className="mb-2 block text-sm font-medium text-fg-muted"
                  >
                    Location
                  </label>
                  <input
                    type="text"
                    id="jobs-filter-location"
                    autoComplete="off"
                    placeholder="City, state, or remote"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="type"
                    className="mb-2 block text-sm font-medium text-fg-muted"
                  >
                    Job type
                  </label>
                  <FilterSelect
                    id="type"
                    value={selectedType}
                    onChange={setSelectedType}
                    options={JOB_TYPE_FILTER_OPTIONS}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="salary"
                    className="mb-2 block text-sm font-medium text-fg-muted"
                  >
                    Salary range
                  </label>
                  <FilterSelect
                    id="salary"
                    value={selectedSalary}
                    onChange={setSelectedSalary}
                    options={SALARY_FILTER_OPTIONS}
                  />
                </div>

                {/* Clear Filters */}
                {(searchQuery ||
                  selectedLocation ||
                  selectedType ||
                  selectedSalary) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="w-full rounded-xl border border-border bg-card-muted px-4 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-card-muted"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Job Listings */}
          <div className="lg:col-span-3">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-fg-muted">
                {totalJobs > 0 ? (
                  <>
                    <span className="font-semibold text-foreground">{totalJobs}</span>{" "}
                    {totalJobs === 1 ? "job" : "jobs"} found
                    {filteredJobs.length > 0 && (
                      <span className="text-fg-subtle">
                        {" "}
                        · showing {(page - 1) * PAGE_SIZE + 1}–
                        {(page - 1) * PAGE_SIZE + filteredJobs.length}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">0</span> jobs
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="sort-jobs" className="text-sm text-fg-subtle">
                  Sort
                </label>
                <FilterSelect
                  id="sort-jobs"
                  value={sortBy}
                  onChange={setSortBy}
                  options={SORT_OPTIONS}
                  fullWidth={false}
                />
              </div>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="space-y-4" aria-busy="true" aria-label="Loading jobs">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-3xl border border-border/60 bg-card/70 p-6 shadow-lg backdrop-blur-sm"
                    >
                      <div className="mb-3 h-5 w-2/3 max-w-md rounded-lg bg-skeleton" />
                      <div className="mb-4 flex gap-2">
                        <div className="h-4 w-24 rounded bg-card-muted" />
                        <div className="h-4 w-28 rounded bg-card-muted" />
                      </div>
                      <div className="mb-2 h-3 w-full rounded bg-card-muted" />
                      <div className="h-3 w-full max-w-lg rounded bg-card-muted opacity-90" />
                    </div>
                  ))}
                </div>
              ) : filteredJobs.length > 0 ? (
                filteredJobs.map((job) => (
                  <article
                    key={job._id}
                    className="group rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lg shadow-foreground/[0.04] ring-1 ring-foreground/[0.03] backdrop-blur-md transition-all duration-300 hover:border-accent/40 hover:bg-card/95 hover:shadow-xl hover:shadow-accent/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
                            <Link
                              href={`/jobs/${job._id}`}
                              className="transition-colors hover:text-accent focus:outline-none focus-visible:text-accent"
                            >
                              {job.title}
                            </Link>
                          </h2>
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getJobTypeColor(
                              job.type,
                            )}`}
                          >
                            {job.type
                              .replace("-", " ")
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        </div>

                        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-muted">
                          <div className="flex items-center gap-1">
                            <Briefcase className="h-4 w-4 shrink-0 text-fg-subtle" />
                            <span>{job.company}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 shrink-0 text-fg-subtle" />
                            <span>{job.location}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 shrink-0 text-fg-subtle" />
                            <span>{formatSalary(job.salary)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 shrink-0 text-fg-subtle" />
                            <span>
                              {new Date(job.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <p className="mb-4 line-clamp-2 text-fg-muted">{job.description}</p>

                        {(job.requirements ?? []).length > 0 ? (
                          <div className="mb-4 flex flex-wrap gap-2">
                            {(job.requirements ?? []).slice(0, 3).map((req, index) => (
                              <span
                                key={index}
                                className="rounded-lg bg-card-muted px-2 py-1 text-xs font-medium text-fg-muted"
                              >
                                {req}
                              </span>
                            ))}
                            {(job.requirements ?? []).length > 3 && (
                              <span className="rounded-lg bg-card-muted px-2 py-1 text-xs font-medium text-fg-muted">
                                +{(job.requirements ?? []).length - 3} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mb-4 text-xs text-fg-subtle">No requirement bullets on this listing.</p>
                        )}

                        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="font-medium text-fg-subtle">Benefits</span>
                            {(job.benefits ?? []).length === 0 ? (
                              <span className="text-fg-subtle">—</span>
                            ) : (
                              (job.benefits ?? []).slice(0, 2).map((benefit, index) => (
                                <span key={index} className="text-emerald-700 dark:text-emerald-400">
                                  {benefit}
                                </span>
                              ))
                            )}
                          </div>

                          <div className="flex shrink-0 items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void toggleSavedJob(job._id)}
                              disabled={bookmarkBusyId === job._id}
                              aria-label={
                                savedJobIds.includes(job._id)
                                  ? "Remove from saved jobs"
                                  : "Save job"
                              }
                              className={`rounded-full p-2.5 transition-colors disabled:opacity-50 ${
                                savedJobIds.includes(job._id)
                                  ? "bg-accent-muted text-accent"
                                  : "text-fg-subtle hover:bg-accent-muted hover:text-accent"
                              }`}
                            >
                              {savedJobIds.includes(job._id) ? (
                                <Bookmark className="h-5 w-5 fill-current" />
                              ) : (
                                <BookmarkPlus className="h-5 w-5" />
                              )}
                            </button>

                            <Link
                              href={`/jobs/${job._id}`}
                              className="inline-flex items-center rounded-xl bg-gradient-to-r from-accent to-accent-end px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                              View details
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-accent/40 bg-card/70 px-6 py-14 text-center shadow-inner backdrop-blur-sm">
                  <Search className="mx-auto mb-4 h-14 w-14 text-fg-subtle" />
                  <h3 className="text-lg font-semibold text-foreground">No jobs match</h3>
                  <p className="mx-auto mt-2 max-w-md text-fg-muted">
                    Loosen filters or clear search to see more roles.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-accent to-accent-end px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
                  >
                    Clear filters
                  </button>
                </div>
              )}

              {totalJobs > PAGE_SIZE && (
                <nav
                  className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row"
                  aria-label="Job results pages"
                >
                  <p className="text-sm text-fg-subtle">
                    Page {page} of {Math.max(1, Math.ceil(totalJobs / PAGE_SIZE))}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= Math.ceil(totalJobs / PAGE_SIZE) || loading}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobsPageFallback() {
  return (
    <div className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-10 max-w-md animate-pulse rounded-xl bg-skeleton" />
        <div className="h-24 animate-pulse rounded-2xl bg-card shadow-sm" />
        <div className="grid gap-8 lg:grid-cols-4">
          <div className="hidden h-64 animate-pulse rounded-2xl bg-card shadow-sm lg:block" />
          <div className="space-y-4 lg:col-span-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl border border-border bg-card"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<JobsPageFallback />}>
      <JobsPageContent />
    </Suspense>
  );
}
