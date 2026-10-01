"use client";

import BrandLogo from "@/components/BrandLogo";
import { getUser } from "@/utils/api";
import {
  ArrowRight,
  Briefcase,
  Globe,
  Search,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    if (getUser()) {
      router.replace("/jobs");
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  // Signed-in users are redirected to /jobs above — this marketing landing page
  // is only ever meant for signed-out visitors, so avoid flashing it first.
  if (!checkedAuth) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          aria-hidden
          style={{
            backgroundImage: `linear-gradient(var(--grid-line) 1px, transparent 1px),
              linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute -right-24 top-20 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-accent/30 via-accent-end/20 to-hold/25 blur-3xl" />
        <div className="absolute -left-32 bottom-0 h-[360px] w-[360px] rounded-full bg-gradient-to-tr from-accent-end/20 via-accent/15 to-transparent blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="text-center">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-card/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-link shadow-sm shadow-accent/10 backdrop-blur-md sm:text-sm">
              Hiring &amp; job search
            </p>
            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-foreground md:text-5xl lg:text-6xl lg:leading-[1.08]">
              Find your next role or{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-accent via-accent-end to-hold bg-clip-text text-transparent">
                  hire with clarity
                </span>
                <span
                  className="absolute -bottom-1 left-0 right-0 mx-auto h-1 max-w-[12rem] rounded-full bg-gradient-to-r from-accent/60 via-accent-end/50 to-hold/40 blur-[2px]"
                  aria-hidden
                />
              </span>
            </h1>
            <p className="mx-auto mb-12 mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted md:text-xl">
              Search real listings, save jobs, and manage applications—without noisy clutter or
              guesswork.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-accent to-accent-end px-8 py-4 text-base font-semibold text-white shadow-xl shadow-accent/25 transition-all hover:brightness-110 hover:shadow-accent/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Search className="mr-2 h-5 w-5" aria-hidden />
                Browse jobs
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-2xl border border-border/70 bg-card/80 px-8 py-4 text-base font-semibold text-foreground shadow-lg shadow-foreground/5 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-card hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Briefcase className="mr-2 h-5 w-5 text-accent" aria-hidden />
                Create account
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="relative py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
              Built for a calm workflow
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-fg-muted">
              Straightforward tools for candidates and hiring teams—no hype, just what you need
              to move faster.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Search,
                color: "from-accent-end to-accent",
                title: "Search & filters",
                body: "Narrow roles by keyword, location, type, and salary so you spend less time scrolling and more time applying.",
              },
              {
                icon: Users,
                color: "from-emerald-500 to-teal-600",
                title: "Structured profiles",
                body: "Résumé upload, experience, and education in one profile—ready when you apply or share with employers.",
              },
              {
                icon: TrendingUp,
                color: "from-violet-500 to-purple-600",
                title: "Saved jobs",
                body: "Bookmark listings and return when you are ready—your shortlist stays in sync across sessions.",
              },
              {
                icon: Shield,
                color: "from-amber-500 to-orange-600",
                title: "Account safety",
                body: "Email verification and secure sessions help keep accounts and applications trustworthy.",
              },
              {
                icon: Globe,
                color: "from-sky-500 to-accent-end",
                title: "Remote-friendly",
                body: "Location fields and listings work well for on-site, hybrid, and remote roles.",
              },
              {
                icon: Briefcase,
                color: "from-accent to-accent-end",
                title: "Applications in one place",
                body: "Track where you have applied and follow up from a single applications list.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="group rounded-3xl border border-border/60 bg-card/65 p-8 text-center shadow-lg shadow-foreground/[0.04] ring-1 ring-foreground/[0.03] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/45 hover:bg-card/85 hover:shadow-xl hover:shadow-accent/10"
              >
                <div
                  className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-lg shadow-foreground/15`}
                >
                  <item.icon className="h-7 w-7" aria-hidden />
                </div>
                <h3 className="mb-2 text-lg font-bold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-fg-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative border-y border-border/50 bg-card/50 py-16 shadow-inner shadow-foreground/5 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Clear listings",
                body: "Titles, salary bands, and requirements at a glance.",
              },
              {
                title: "Profile completeness",
                body: "Hints nudge job seekers toward a stronger profile.",
              },
              {
                title: "Employer tools",
                body: "Post roles and review applicants without extra noise.",
              },
              {
                title: "Responsive UI",
                body: "Skeleton states and layouts that work on every screen.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border bg-gradient-to-br from-card/90 to-card-muted/80 p-6 shadow-md shadow-foreground/5 ring-1 ring-border/80"
              >
                <h3 className="mb-2 font-bold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-fg-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden bg-gradient-to-br from-[#0259cc] via-accent to-hold py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          aria-hidden
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 45%),
              radial-gradient(circle at 80% 70%, rgba(255,255,255,0.35) 0%, transparent 40%)`,
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Ready when you are
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-white/90">
            Create a free account to post jobs, apply, or save listings for later.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-2xl bg-card px-8 py-4 text-base font-semibold text-link shadow-xl shadow-foreground/15 transition-all hover:bg-accent-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0259cc]"
            >
              Get started
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-border/40 bg-card/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-card/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0259cc]"
            >
              Browse jobs
            </Link>
          </div>
        </div>
      </div>

      <footer className="relative border-t border-footer-border bg-footer py-14 text-white">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-end/50 to-transparent"
          aria-hidden
        />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div>
              {/* The footer is navy in both themes, so it always uses the dark logo. */}
              <BrandLogo variant="dark" className="mb-4 h-14 w-auto" />
              <p className="text-sm leading-relaxed text-footer-muted">
                Connecting talented professionals with amazing opportunities worldwide.
              </p>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-footer-muted">
                For job seekers
              </h3>
              <ul className="space-y-2.5 text-sm text-footer-muted">
                <li>
                  <Link href="/jobs" className="transition-colors hover:text-white">
                    Browse Jobs
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="transition-colors hover:text-white">
                    Create Profile
                  </Link>
                </li>
                <li>
                  <Link href="/applications" className="transition-colors hover:text-white">
                    My Applications
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-footer-muted">
                For employers
              </h3>
              <ul className="space-y-2.5 text-sm text-footer-muted">
                <li>
                  <Link href="/post-job" className="transition-colors hover:text-white">
                    Post a Job
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="transition-colors hover:text-white">
                    Create Account
                  </Link>
                </li>
                <li>
                  <Link href="/my-jobs" className="transition-colors hover:text-white">
                    Manage Jobs
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-footer-muted">
                Company
              </h3>
              <ul className="space-y-2.5 text-sm text-footer-muted">
                <li>
                  <Link href="/about" className="transition-colors hover:text-white">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="transition-colors hover:text-white">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="transition-colors hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-footer-border pt-8 text-center text-sm text-footer-muted">
            <p>&copy; 2026 Smart JobHub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
