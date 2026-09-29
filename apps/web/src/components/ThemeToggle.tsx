"use client";

import { cn } from "@/lib/cn";
import {
  applyThemeClass,
  getStoredTheme,
  persistTheme,
  type ThemePreference,
} from "@/lib/theme";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = getStoredTheme();
    const dark =
      stored === "dark" ||
      (stored !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(dark);
  }, []);

  const toggle = () => {
    const next: ThemePreference = isDark ? "light" : "dark";
    applyThemeClass(next);
    persistTheme(next);
    setIsDark(next === "dark");
  };

  if (!mounted) {
    return (
      <span
        className={cn("inline-flex h-9 w-9 shrink-0 rounded-xl", className)}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-fg-muted transition-colors hover:bg-card-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
