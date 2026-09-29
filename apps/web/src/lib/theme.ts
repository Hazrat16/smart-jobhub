export const THEME_STORAGE_KEY = "jobplatform-theme" as const;

/** Inline script for `next/script` `beforeInteractive` — keeps theme in sync before paint. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export type ThemePreference = "light" | "dark";

export function getStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function applyThemeClass(pref: ThemePreference) {
  document.documentElement.classList.toggle("dark", pref === "dark");
}

export function persistTheme(pref: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
}
