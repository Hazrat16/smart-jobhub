import type { Job } from "@/types";

/** Normalize job list fields from API (legacy docs may omit or use non-array shapes). */
export function sanitizeJob(raw: Job | Record<string, unknown>): Job {
  const j = raw as Record<string, unknown>;
  return {
    ...(raw as Job),
    requirements: normalizeStringList(j["requirements"]),
    benefits: normalizeStringList(j["benefits"]),
    skills: normalizeStringList(j["skills"]),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
