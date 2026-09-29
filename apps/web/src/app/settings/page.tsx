"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { getUser } from "@/utils/api";
import {
  Bell,
  Building2,
  FileLock2,
  Gavel,
  Settings2,
  Shield,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";

type SettingsLink = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Array<"jobseeker" | "employer" | "admin">;
};

const SETTINGS_LINKS: SettingsLink[] = [
  {
    href: "/notifications/preferences",
    title: "Notification preferences",
    description: "Choose which alerts you receive and where.",
    icon: Bell,
  },
  {
    href: "/profile/data-deletion",
    title: "Data deletion request",
    description: "Request account/data deletion for admin review.",
    icon: Trash2,
  },
  {
    href: "/privacy",
    title: "Privacy policy",
    description: "See how your data is collected and handled.",
    icon: Shield,
  },
  {
    href: "/terms",
    title: "Terms of service",
    description: "Platform usage terms and moderation policy.",
    icon: Gavel,
  },
  {
    href: "/company",
    title: "Company profile",
    description: "Create or manage your company page and team members.",
    icon: Building2,
    roles: ["employer"],
  },
  {
    href: "/payments",
    title: "Payments",
    description: "Review payment records and billing status.",
    icon: Wallet,
    roles: ["employer"],
  },
  {
    href: "/admin",
    title: "Admin panel",
    description: "Moderate users, jobs, and deletion requests.",
    icon: FileLock2,
    roles: ["admin"],
  },
];

export default function SettingsPage() {
  const user = getUser();
  const role = user?.role;
  const links = SETTINGS_LINKS.filter(
    (item) => !item.roles || (role ? item.roles.includes(role) : false),
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Settings2 className="h-6 w-6 text-accent" />
            Settings
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Manage preferences, legal information, and account controls.
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">Theme</p>
              <p className="text-sm text-fg-muted">Switch between light and dark mode.</p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-card-muted"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-accent" />
                  <p className="font-medium text-foreground">{item.title}</p>
                </div>
                <p className="text-sm text-fg-muted">{item.description}</p>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
