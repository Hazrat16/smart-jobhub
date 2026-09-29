"use client";

import { CompanyDetail } from "@/types";
import { apiClient } from "@/utils/api";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function CompanyProfilePage() {
  const params = useParams<{ idOrSlug: string }>();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getCompany(params.idOrSlug);
        if (!res.success || !res.data) {
          toast.error(res.message || "Company not found");
          return;
        }
        setData(res.data);
      } finally {
        setLoading(false);
      }
    };
    if (params.idOrSlug) void load();
  }, [params.idOrSlug]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-fg-muted">
        Company not found.
      </div>
    );
  }

  const { company, jobs } = data;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent/10 text-2xl font-semibold text-accent">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-8 w-8" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {company.name}
                </h1>
                {company.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                <span>{company.industry}</span>
                {company.size && <span>{company.size} employees</span>}
                {company.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {company.location}
                  </span>
                )}
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-line text-fg-muted">{company.description}</p>
        </div>

        <div className="mt-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Briefcase className="h-5 w-5 text-accent" />
            Open roles ({jobs.length})
          </h2>
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-fg-muted">
              No open roles right now.
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <li key={job._id}>
                  <Link
                    href={`/jobs/${job._id}`}
                    className="block rounded-2xl border border-border bg-card px-5 py-4 shadow-sm transition-colors hover:bg-card-muted"
                  >
                    <p className="font-semibold text-foreground">{job.title}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                      </span>
                      <span className="capitalize">{job.type.replace("-", " ")}</span>
                      <span>
                        {job.salary.currency} {job.salary.min.toLocaleString()}–
                        {job.salary.max.toLocaleString()}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
