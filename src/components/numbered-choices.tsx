"use client";

import { useEffect } from "react";

export type Choice<T extends string> = { value: T; label: string; hint?: string; tone?: "ok" | "bad" | "warn" };

/**
 * Every choice on a phone screen is numbered, and typing the number works
 * exactly like tapping (house rule 3.1). The number keys are ignored while
 * the person is typing in a field.
 */
export function NumberedChoices<T extends string>({
  choices, value, onChange, name, disabled, autoFocusKeys = true,
}: { choices: Choice<T>[]; value: T | null; onChange: (v: T) => void; name: string; disabled?: boolean; autoFocusKeys?: boolean }) {
  useEffect(() => {
    if (!autoFocusKeys || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
        e.preventDefault();
        onChange(choices[n - 1].value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choices, onChange, disabled, autoFocusKeys]);

  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
      {choices.map((c, i) => {
        const selected = value === c.value;
        const ring = selected
          ? c.tone === "bad" ? "border-bad bg-bad-light" : c.tone === "warn" ? "border-warn bg-warn-light" : c.tone === "ok" ? "border-ok bg-ok-light" : "border-brand bg-brand-light"
          : "border-line bg-surface";
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(c.value)}
            className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left ${ring} disabled:opacity-50`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold ${selected ? "bg-brand text-white" : "bg-background"}`}>
              {i + 1}
            </span>
            <span>
              <span className="block text-base font-medium">{c.label}</span>
              {c.hint && <span className="block text-sm text-muted">{c.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
