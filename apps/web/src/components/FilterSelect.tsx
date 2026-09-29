"use client";

import { cn } from "@/lib/cn";
import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type FilterSelectOption = { value: string; label: string };

type FilterSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** Extra classes on the root wrapper */
  className?: string;
  /** When false, trigger sizes to content (e.g. toolbar “Sort”). Default: full width in forms. */
  fullWidth?: boolean;
};

const triggerBase =
  "relative flex w-full items-center rounded-xl border border-input-border bg-input px-3 py-2.5 pr-11 text-left text-sm text-foreground shadow-inner shadow-foreground/5 transition-[color,box-shadow,border-color] hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function FilterSelect({
  id,
  value,
  onChange,
  options,
  className,
  fullWidth = true,
}: FilterSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const found = options.findIndex((o) => o.value === value);
  const selectedIndex = found >= 0 ? found : 0;
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const updateMenuPosition = () => {
      const trigger = buttonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuStyle({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const selectIndex = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    close();
  };

  const onButtonKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setHighlightedIndex(options.length - 1);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      selectIndex(highlightedIndex);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        open && "z-[80]",
        fullWidth
          ? "w-full"
          : "inline-block min-w-[14rem] max-w-[min(100vw-2rem,20rem)] shrink-0",
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-autocomplete="list"
        className={cn(triggerBase, open && "border-accent ring-2 ring-accent/20")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open ? `${id}-option-${highlightedIndex}` : undefined
        }
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
      >
        <span className="block min-w-0 flex-1 truncate">{selectedLabel}</span>
      </button>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle transition-transform duration-200",
          open && "rotate-180 text-accent",
        )}
        aria-hidden
      />

      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              className="fixed z-[9999] max-h-72 overflow-auto rounded-xl border border-border bg-popover py-1 shadow-lg shadow-foreground/10 ring-1 ring-border dark:shadow-black/40"
              style={{
                top: menuStyle.top,
                left: menuStyle.left,
                width: menuStyle.width,
              }}
            >
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <li
                    key={opt.value === "" ? "__all__" : opt.value}
                    id={`${id}-option-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none transition-colors",
                      isHighlighted && "bg-card-muted",
                      !isHighlighted && isSelected && "bg-accent-muted",
                      isHighlighted && isSelected && "bg-accent-muted-strong",
                    )}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectIndex(idx)}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {isSelected && (
                      <Check
                        className="h-4 w-4 shrink-0 text-accent"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    )}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
