"use client";

import { Briefcase, Search } from "lucide-react";
import { trackActivity } from "@/lib/analytics";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      trackActivity("job_search", { query: searchQuery.trim() });
      router.push(`/jobs?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const searchInputClass =
    "w-full rounded-xl border border-input-border bg-input py-2.5 pl-10 pr-4 text-sm text-foreground shadow-inner shadow-foreground/5 ring-1 ring-border/40 transition-all placeholder:text-fg-subtle focus:border-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/25";

  return (
    <nav
      className="sticky top-0 z-50 border-b border-border bg-card/95 shadow-sm backdrop-blur-md backdrop-saturate-150"
      aria-label="Main"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5 rounded-xl py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-accent-end to-hold text-white shadow-lg shadow-accent/30 ring-2 ring-card transition-transform duration-300 group-hover:scale-[1.03] dark:shadow-black/40">
              <Briefcase className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-extrabold tracking-tight sm:text-xl">
              <span className="text-foreground">Job</span>
              <span className="bg-gradient-to-r from-accent via-accent-end to-hold bg-clip-text text-transparent dark:from-accent-end dark:via-accent dark:to-hold">
                Platform
              </span>
            </span>
          </Link>

          <div className="mx-4 max-w-md flex-1">
            <form onSubmit={handleSearch} className="w-full">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                  aria-hidden
                />
                <input
                  type="search"
                  name="q"
                  placeholder="Search jobs by title or company…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={searchInputClass}
                  aria-label="Search jobs"
                />
              </div>
            </form>
          </div>

          <div className="w-10 shrink-0" aria-hidden />
        </div>
      </div>
    </nav>
  );
}
