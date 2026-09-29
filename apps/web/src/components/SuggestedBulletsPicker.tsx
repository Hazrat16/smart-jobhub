"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const MAX_LINE_LEN = 200;

function normalizeLine(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_LINE_LEN);
}

type SuggestedBulletsPickerProps = {
  idPrefix: string;
  suggestions: readonly string[];
  /** Current lines (may include empty strings from open rows). */
  values: string[];
  onAdd: (line: string) => void;
  maxItems: number;
  hint?: string;
  addPlaceholder?: string;
};

export function SuggestedBulletsPicker({
  idPrefix,
  suggestions,
  values,
  onAdd,
  maxItems,
  hint = "Tap a suggestion or type your own and press Enter.",
  addPlaceholder = "Type your own line, then Enter or Add",
}: SuggestedBulletsPickerProps) {
  const [draft, setDraft] = useState("");

  const existing = useMemo(() => {
    const set = new Set<string>();
    for (const v of values) {
      const t = v.trim().toLowerCase();
      if (t) set.add(t);
    }
    return set;
  }, [values]);

  const nonEmptyCount = useMemo(
    () => values.filter((v) => v.trim().length > 0).length,
    [values],
  );

  const atRowCap = values.length >= maxItems;

  const addLine = useCallback(
    (raw: string) => {
      const line = normalizeLine(raw);
      if (!line) return;
      if (atRowCap || nonEmptyCount >= maxItems) return;
      const key = line.toLowerCase();
      if (existing.has(key)) return;
      onAdd(line);
      setDraft("");
    },
    [existing, nonEmptyCount, maxItems, onAdd, atRowCap],
  );

  const filteredSuggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => {
        const k = s.trim().toLowerCase();
        if (!k || existing.has(k)) return false;
        if (!q) return true;
        return k.includes(q);
      })
      .slice(0, 14);
  }, [suggestions, existing, draft]);

  const draftMatchesSuggestion = filteredSuggestions.some(
    (s) => s.trim().toLowerCase() === draft.trim().toLowerCase(),
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card-muted/20 p-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Suggestions
        </p>
        <div className="flex flex-wrap gap-2">
          {filteredSuggestions.length === 0 ? (
            <p className="text-sm text-fg-subtle">
              {atRowCap || nonEmptyCount >= maxItems
                ? "Maximum items reached — remove one to add more."
                : "No matching suggestions — use the field below."}
            </p>
          ) : (
            filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={atRowCap || nonEmptyCount >= maxItems}
                onClick={() => addLine(s)}
                className="rounded-full border border-border bg-card-muted/60 px-3 py-1 text-left text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                + {s}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${idPrefix}-manual`} className="mb-1 block text-xs font-medium text-fg-muted">
            Add your own
          </label>
          <input
            id={`${idPrefix}-manual`}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLine(draft);
              }
            }}
            placeholder={addPlaceholder}
            disabled={atRowCap || nonEmptyCount >= maxItems}
            className="w-full rounded-lg border border-border-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          disabled={atRowCap || nonEmptyCount >= maxItems || !draft.trim()}
          onClick={() => addLine(draft)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4 text-accent" />
          Add
        </button>
      </div>

      {draft.trim() && !draftMatchesSuggestion && !atRowCap && nonEmptyCount < maxItems ? (
        <button
          type="button"
          onClick={() => addLine(draft)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-card-muted"
        >
          <Plus className="h-4 w-4 text-accent" />
          Add &quot;{normalizeLine(draft)}&quot;
        </button>
      ) : null}

      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}
