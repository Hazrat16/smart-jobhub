"use client";

import { JOB_SKILL_SUGGESTIONS } from "@/lib/job-skill-suggestions";
import { Plus, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const MAX_SKILLS = 30;
const MAX_LEN = 60;

function normalizeSkill(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
}

function dedupeSkills(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

type SkillTagPickerProps = {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  hint?: string;
  error?: string;
};

export function SkillTagPicker({
  id = "job-skills",
  value,
  onChange,
  label = "Skills",
  hint = "Pick from suggestions or type your own and press Enter.",
  error,
}: SkillTagPickerProps) {
  const [draft, setDraft] = useState("");

  const addSkill = useCallback(
    (raw: string) => {
      const next = normalizeSkill(raw);
      if (!next) return;
      if (value.length >= MAX_SKILLS) return;
      const merged = dedupeSkills([...value, next]);
      if (merged.length === value.length) return;
      onChange(merged);
      setDraft("");
    },
    [onChange, value],
  );

  const removeSkill = useCallback(
    (skill: string) => {
      onChange(value.filter((s) => s !== skill));
    },
    [onChange, value],
  );

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const selected = new Set(value.map((s) => s.toLowerCase()));
    return JOB_SKILL_SUGGESTIONS.filter((s) => {
      if (selected.has(s.toLowerCase())) return false;
      if (!q) return true;
      return s.toLowerCase().includes(q);
    }).slice(0, 12);
  }, [draft, value]);

  return (
    <div className="space-y-3">
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-fg-muted">
          {label} <span className="text-destructive">*</span>
        </label>
      ) : null}

      <div
        className={`flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-xl border bg-background px-2 py-2 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
          error ? "border-destructive ring-2 ring-destructive/20" : "border-border-strong"
        }`}
      >
        {value.map((skill) => (
          <span
            key={skill}
            className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-card-muted/80 px-2 py-1 text-sm text-foreground"
          >
            <span className="truncate">{skill}</span>
            <button
              type="button"
              onClick={() => removeSkill(skill)}
              className="rounded p-0.5 text-fg-subtle hover:bg-card hover:text-foreground"
              aria-label={`Remove ${skill}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addSkill(draft.replace(/,$/, ""));
            }
          }}
          placeholder={value.length === 0 ? "e.g. React, Terraform…" : "Add another…"}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-fg-subtle"
          autoComplete="off"
        />
      </div>

      {draft.trim() && !suggestions.some((s) => s.toLowerCase() === draft.trim().toLowerCase()) ? (
        <button
          type="button"
          onClick={() => addSkill(draft)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-card-muted"
        >
          <Plus className="h-4 w-4 text-accent" />
          Add &quot;{normalizeSkill(draft) || "…"}&quot;
        </button>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Suggestions
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions.length === 0 ? (
            <p className="text-sm text-fg-subtle">No matching suggestions — type and press Enter.</p>
          ) : (
            suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSkill(s)}
                disabled={value.length >= MAX_SKILLS}
                className="rounded-full border border-border bg-card-muted/50 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                + {s}
              </button>
            ))
          )}
        </div>
      </div>

      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
