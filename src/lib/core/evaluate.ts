// Decides, for one answer, whether it is an exception and what extra proof
// it needs. Pure, no database, so it is tested on its own and the screen and
// the server use exactly the same rules.

export type ItemRules = {
  answer_type: "tick" | "number" | "photo" | "date" | "time" | "text";
  label: string;
  unit: string | null;
  min_value: number | string | null;
  max_value: number | string | null;
  range_unconfirmed: boolean;
  photo_rule: "never" | "always" | "on_exception";
  date_mode?: "expiry" | "max_age" | null;
  date_warn_days: number | null;
  latest_time?: string | null; // HH:MM
};

export type AnswerInput = {
  value_bool?: boolean | null;
  value_number?: number | null;
  value_text?: string | null;
  value_date?: string | null; // YYYY-MM-DD
  value_time?: string | null; // HH:MM
  note?: string | null;
  photo_id?: string | null;
};

export type Evaluation = {
  complete: boolean;
  isException: boolean;
  reason: string | null;
  needsPhoto: boolean;
  needsNote: boolean;
  missing: string[];
};

const num = (v: number | string | null) => (v == null ? null : Number(v));

function fmt(n: number, unit: string | null) {
  return `${n}${unit ? (unit.length <= 2 ? unit : ` ${unit}`) : ""}`;
}

export function rangeText(item: Pick<ItemRules, "min_value" | "max_value" | "unit" | "range_unconfirmed">) {
  if (item.range_unconfirmed) return "Range not confirmed yet";
  const min = num(item.min_value);
  const max = num(item.max_value);
  if (min != null && max != null) return `${fmt(min, item.unit)} to ${fmt(max, item.unit)}`;
  if (min != null) return `At least ${fmt(min, item.unit)}`;
  if (max != null) return `No more than ${fmt(max, item.unit)}`;
  return null;
}

export function daysBetween(fromDate: string, toDate: string) {
  return Math.round((Date.parse(`${toDate}T12:00:00Z`) - Date.parse(`${fromDate}T12:00:00Z`)) / 86400000);
}

export function evaluateAnswer(item: ItemRules, a: AnswerInput, today: string): Evaluation {
  let isException = false;
  let reason: string | null = null;
  const missing: string[] = [];
  const hasNote = !!a.note?.trim();

  switch (item.answer_type) {
    case "tick":
      if (a.value_bool == null) missing.push("Choose done or not done");
      else if (a.value_bool === false) {
        isException = true;
        reason = "Marked not done";
      }
      break;
    case "number": {
      if (a.value_number == null || Number.isNaN(a.value_number)) {
        missing.push("Enter the number");
        break;
      }
      if (item.range_unconfirmed) break;
      const min = num(item.min_value);
      const max = num(item.max_value);
      if (min != null && a.value_number < min) {
        isException = true;
        reason = `${fmt(a.value_number, item.unit)} is below the minimum of ${fmt(min, item.unit)}`;
      } else if (max != null && a.value_number > max) {
        isException = true;
        reason = `${fmt(a.value_number, item.unit)} is above the maximum of ${fmt(max, item.unit)}`;
      }
      break;
    }
    case "date": {
      if (!a.value_date || !/^\d{4}-\d{2}-\d{2}$/.test(a.value_date)) {
        missing.push("Enter the date");
        break;
      }
      if (item.date_warn_days != null && item.date_mode === "max_age") {
        const age = daysBetween(a.value_date, today);
        if (age < 0) {
          isException = true;
          reason = "Date is in the future";
        } else if (age > item.date_warn_days) {
          isException = true;
          reason = `${age} days ago, more than the ${item.date_warn_days} allowed`;
        }
      } else if (item.date_warn_days != null) {
        const days = daysBetween(today, a.value_date);
        if (days < 0) {
          isException = true;
          reason = `Date has passed (${-days} day${days === -1 ? "" : "s"} ago)`;
        } else if (days <= item.date_warn_days) {
          isException = true;
          reason = days === 0 ? "Date is today" : `Only ${days} day${days === 1 ? "" : "s"} left`;
        }
      }
      break;
    }
    case "time": {
      if (!a.value_time || !/^\d{2}:\d{2}$/.test(a.value_time)) {
        missing.push("Enter the time");
        break;
      }
      const latest = item.latest_time?.slice(0, 5);
      if (latest && a.value_time > latest) {
        isException = true;
        reason = `${a.value_time} is after ${latest}`;
      }
      break;
    }
    case "photo":
      if (!a.photo_id) missing.push("Take the photo");
      break;
    case "text":
      if (!a.value_text?.trim()) missing.push("Write a short note");
      break;
  }

  const needsPhoto =
    item.answer_type !== "photo" && (item.photo_rule === "always" || (item.photo_rule === "on_exception" && isException));
  if (needsPhoto && !a.photo_id) missing.push("Take a photo");

  // Anything not done, or out of range, needs a reason in her own words.
  const needsNote = isException;
  if (needsNote && !hasNote) missing.push("Say what happened");

  return { complete: missing.length === 0, isException, reason, needsPhoto, needsNote, missing };
}
