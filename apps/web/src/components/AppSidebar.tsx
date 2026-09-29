"use client";

import { trackActivity } from "@/lib/analytics";
import {
  apiClient,
  AUTH_CHANGED_EVENT,
  getUser,
  removeAuthToken,
  removeUser,
} from "@/utils/api";
import {
  Bell,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  FileSearch,
  FolderHeart,
  Globe,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
  MessageCircle,
  Settings2,
  Shield,
  SunMoon,
  UserCircle2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

type SidebarItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STORAGE_KEY = "ui.sidebar.collapsed";

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<"jobseeker" | "employer" | "admin" | null>(
    null,
  );
  const [hasUser, setHasUser] = useState(false);
  const [userName, setUserName] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    setCollapsed(raw === "1");
  }, []);

  // Login, logout, and the axios interceptor's silent token refresh all happen
  // without unmounting this persistent layout component, so a one-time read on
  // mount would go stale the moment any of those occur on another page or tab.
  // Resync on navigation (cheap, covers most cases) and on the explicit
  // auth-changed/storage events (covers same-page and cross-tab changes).
  useEffect(() => {
    const syncAuthState = () => {
      const user = getUser();
      setRole(user?.role ?? null);
      setHasUser(Boolean(user));
      setUserName(user?.name ?? "");
    };
    syncAuthState();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuthState);
    window.addEventListener("storage", syncAuthState);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuthState);
      window.removeEventListener("storage", syncAuthState);
    };
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (accountRef.current?.contains(e.target as Node)) return;
      setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const primaryItems = useMemo<SidebarItem[]>(() => {
    const base: SidebarItem[] = [
      { href: "/", label: "Home", icon: Home },
      { href: "/jobs", label: "Browse Jobs", icon: Briefcase },
      { href: "/profile", label: "Profile", icon: UserCircle2 },
    ];
    if (role === "jobseeker") {
      base.splice(2, 0, {
        href: "/applications",
        label: "My Applications",
        icon: LayoutDashboard,
      });
      base.splice(3, 0, {
        href: "/saved-jobs",
        label: "Saved Jobs",
        icon: FolderHeart,
      });
      base.splice(4, 0, {
        href: "/remote-jobs",
        label: "External Remote Jobs",
        icon: Globe,
      });
      base.splice(5, 0, {
        href: "/resume-fit",
        label: "Resume Fit",
        icon: FileSearch,
      });
      base.splice(6, 0, {
        href: "/analytics",
        label: "My Analytics",
        icon: LineChart,
      });
    }
    if (role === "employer") {
      base.splice(2, 0, {
        href: "/my-jobs",
        label: "My Jobs",
        icon: LayoutDashboard,
      });
      base.splice(3, 0, {
        href: "/post-job",
        label: "Post Job",
        icon: Briefcase,
      });
      base.splice(4, 0, {
        href: "/analytics",
        label: "My Analytics",
        icon: LineChart,
      });
    }
    if (role === "admin") {
      base.splice(2, 0, { href: "/admin", label: "Admin Panel", icon: Shield });
    }
    return base;
  }, [role]);

  const secondaryItems = useMemo<SidebarItem[]>(() => {
    const base: SidebarItem[] = [
      { href: "/messages", label: "Messages", icon: MessageCircle },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings2 },
    ];
    if (role === "employer") {
      base.push({ href: "/payments", label: "Payments", icon: Wallet });
    }
    return base;
  }, [role]);

  const hiddenOnRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ];
  if (hiddenOnRoutes.some((r) => pathname.startsWith(r))) return null;

  return (
    <aside
      className={`hidden border-r border-border bg-card md:sticky md:top-16 md:block md:h-[calc(100vh-4rem)] ${
        collapsed ? "w-20" : "w-64"
      } transition-all duration-200`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          {!collapsed ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Navigation
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            }}
            className="rounded-lg border border-border p-1.5 text-fg-muted hover:bg-card-muted"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto p-2">
          {primaryItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent-muted text-foreground"
                    : "text-fg-muted hover:bg-card-muted hover:text-foreground"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
          {secondaryItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent-muted text-foreground"
                    : "text-fg-muted hover:bg-card-muted hover:text-foreground"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          {hasUser && !collapsed && (
            <div className="relative mb-2" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card-muted/40 px-3 py-2 text-left hover:bg-card-muted"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {userName}
                </p>
                <ChevronsUpDown className="h-4 w-4 text-fg-subtle" />
              </button>
              {accountOpen && (
                <div
                  role="menu"
                  className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive-muted"
                    onClick={async () => {
                      setAccountOpen(false);
                      trackActivity("sign_out", {
                        source: "sidebar_account_menu",
                      });
                      try {
                        await apiClient.logout();
                      } catch {}
                      removeUser();
                      removeAuthToken();
                      router.push("/login");
                    }}
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="mb-2 flex items-center gap-2 rounded-xl px-2 py-1.5 text-fg-muted">
            <SunMoon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-sm">Theme</span>}
            <ThemeToggle className="ml-auto" />
          </div>
          {!hasUser ? (
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-fg-muted hover:bg-card-muted hover:text-foreground"
            >
              <UserCircle2 className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign in</span>}
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
