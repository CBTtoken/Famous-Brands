import Link from "next/link";
import { addDays, todayLocal } from "@/lib/core/time";

/** Date range as plain links and one small form: works with no JavaScript. */
export function RangePicker({ base, from, to, extra = {} }: { base: string; from: string; to: string; extra?: Record<string, string | undefined> }) {
  const today = todayLocal();
  const q = (f: string, t: string) => {
    const p = new URLSearchParams({ ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) as Record<string, string>, from: f, to: t });
    return `${base}?${p}`;
  };
  const presets = [
    { label: "Today", f: today, t: today },
    { label: "Last 7 days", f: addDays(today, -6), t: today },
    { label: "Last 30 days", f: addDays(today, -29), t: today },
  ];
  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-2">
      {presets.map((p) => {
        const on = p.f === from && p.t === to;
        return (
          <Link key={p.label} href={q(p.f, p.t)} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand text-white" : "border-line bg-surface"}`}>
            {p.label}
          </Link>
        );
      })}
      <form action={base} className="flex flex-wrap items-end gap-2 text-sm">
        {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex flex-col">From<input type="date" name="from" defaultValue={from} className="rounded border border-line px-2 py-1" /></label>
        <label className="flex flex-col">To<input type="date" name="to" defaultValue={to} className="rounded border border-line px-2 py-1" /></label>
        <button className="rounded border border-line bg-surface px-3 py-1.5">Show</button>
      </form>
    </div>
  );
}
