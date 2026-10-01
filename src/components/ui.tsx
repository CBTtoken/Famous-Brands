import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Page({ title, back, children, actions }: { title: string; back?: { href: string; label: string }; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:pb-10">
      {back && (
        <Link href={back.href} className="no-print mb-2 inline-block text-sm text-brand underline-offset-2 hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export function Card({ children, className = "", title, aside }: { children: ReactNode; className?: string; title?: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`print-break rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const tone = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-line bg-surface hover:bg-brand-light",
  danger: "bg-bad text-white hover:opacity-90",
  ghost: "text-brand hover:bg-brand-light",
};

export function ButtonLink({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: keyof typeof tone; className?: string }) {
  return (
    <Link href={href} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 font-medium ${tone[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: keyof typeof tone }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tone[variant]} ${className}`}
    />
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "ok" | "bad" | "warn"; children: ReactNode }) {
  const k = { info: "bg-brand-light border-brand/30", ok: "bg-ok-light border-ok/40", bad: "bg-bad-light border-bad/40", warn: "bg-warn-light border-warn/40" }[kind];
  return <div role={kind === "bad" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${k}`}>{children}</div>;
}

export function Badge({ children, kind = "neutral" }: { children: ReactNode; kind?: "neutral" | "ok" | "bad" | "warn" | "brand" }) {
  const k = { neutral: "bg-line/60", ok: "bg-ok-light text-ok", bad: "bg-bad-light text-bad", warn: "bg-warn-light text-warn", brand: "bg-brand-light text-brand" }[kind];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${k}`}>{children}</span>;
}

export function Progress({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label ?? `${done} of ${total} done`}</span>
        <span className="text-muted">{total - done} left</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
        <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">{children}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = "min-h-11 w-full rounded-lg border border-line px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

export function Stat({ label, value, hint, kind }: { label: string; value: ReactNode; hint?: ReactNode; kind?: "ok" | "bad" | "warn" }) {
  const c = kind === "bad" ? "text-bad" : kind === "warn" ? "text-warn" : kind === "ok" ? "text-ok" : "";
  return (
    <div className="rounded-lg bg-background p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
