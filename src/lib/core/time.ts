import { config } from "../config";

// All "today", "this week" and "this month" are worked out in store time
// (Africa/Johannesburg by default), never in the server's own time zone.

export type Cadence = "daily" | "weekly" | "monthly" | "quarterly" | "six_monthly" | "as_needed";

export function localParts(d: Date, timeZone = config.timeZone) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

/** ISO 8601 week number and week-year for a calendar date. */
export function isoWeek(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekYear: d.getUTCFullYear(), week };
}

/** The period a checklist run covers, e.g. 2026-10-01, 2026-W40, 2026-10, 2026-Q4, 2026-H2. */
export function periodKey(cadence: Cadence, at: Date = new Date(), timeZone = config.timeZone): string {
  const { year, month, day, date } = localParts(at, timeZone);
  switch (cadence) {
    case "daily":
      return date;
    case "weekly": {
      const { weekYear, week } = isoWeek(year, month, day);
      return `${weekYear}-W${String(week).padStart(2, "0")}`;
    }
    case "monthly":
      return `${year}-${String(month).padStart(2, "0")}`;
    case "quarterly":
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case "six_monthly":
      return `${year}-H${month <= 6 ? 1 : 2}`;
    case "as_needed":
      return `${date}-adhoc`;
  }
}

/** Every period key of a cadence touched by an inclusive local date range. */
export function periodsInRange(cadence: Cadence, fromDate: string, toDate: string): string[] {
  if (cadence === "as_needed") return [];
  const out = new Set<string>();
  const start = new Date(`${fromDate}T12:00:00Z`);
  const end = new Date(`${toDate}T12:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.add(periodKey(cadence, d, "UTC"));
  }
  return [...out];
}

export const cadenceLabel: Record<Cadence, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every 3 months",
  six_monthly: "Every 6 months",
  as_needed: "When needed",
};

export function todayLocal(timeZone = config.timeZone) {
  return localParts(new Date(), timeZone).date;
}

/** Start of a local date as a UTC instant, for range queries. */
export function localDateStartUtc(date: string, timeZone = config.timeZone): Date {
  // Find the offset of the zone at that date by formatting noon UTC.
  const guess = new Date(`${date}T00:00:00Z`);
  const p = localParts(guess, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offset = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(d: Date | string | null | undefined, timeZone = config.timeZone) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatTime(d: Date | string | null | undefined, timeZone = config.timeZone) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-ZA", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function formatDate(d: Date | string | null | undefined, timeZone = config.timeZone) {
  if (!d) return "";
  const date = typeof d === "string" ? (d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d)) : d;
  return new Intl.DateTimeFormat("en-ZA", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(date);
}
