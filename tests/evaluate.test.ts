import { describe, expect, it } from "vitest";
import { evaluateAnswer, type ItemRules } from "../src/lib/core/evaluate";
import { periodKey, periodsInRange } from "../src/lib/core/time";
import { checkLocation } from "../src/lib/core/geo";

const base: ItemRules = {
  answer_type: "tick", label: "x", unit: null, min_value: null, max_value: null,
  range_unconfirmed: false, photo_rule: "never", date_warn_days: null,
};
const today = "2026-10-01";

describe("evaluateAnswer", () => {
  it("tick done is complete, not done needs a note", () => {
    expect(evaluateAnswer(base, { value_bool: true }, today)).toMatchObject({ complete: true, isException: false });
    const e = evaluateAnswer(base, { value_bool: false }, today);
    expect(e).toMatchObject({ complete: false, isException: true, needsNote: true });
    expect(evaluateAnswer(base, { value_bool: false, note: "Ran out" }, today).complete).toBe(true);
  });
  it("number out of range is an exception and demands a photo when on_exception", () => {
    const item: ItemRules = { ...base, answer_type: "number", unit: "°C", min_value: 0, max_value: 5, photo_rule: "on_exception" };
    expect(evaluateAnswer(item, { value_number: 4 }, today)).toMatchObject({ complete: true, isException: false, needsPhoto: false });
    const e = evaluateAnswer(item, { value_number: 11 }, today);
    expect(e.isException).toBe(true);
    expect(e.reason).toBe("11°C is above the maximum of 5°C");
    expect(e.missing).toEqual(["Take a photo", "Say what happened"]);
    expect(evaluateAnswer(item, { value_number: 11, photo_id: "p", note: "Door open" }, today).complete).toBe(true);
  });
  it("an unconfirmed range is recorded but never judged", () => {
    const item: ItemRules = { ...base, answer_type: "number", range_unconfirmed: true };
    expect(evaluateAnswer(item, { value_number: 9999 }, today)).toMatchObject({ complete: true, isException: false });
  });
  it("date warns inside the window and when passed", () => {
    const item: ItemRules = { ...base, answer_type: "date", date_warn_days: 30 };
    expect(evaluateAnswer(item, { value_date: "2026-12-31" }, today).isException).toBe(false);
    expect(evaluateAnswer(item, { value_date: "2026-10-15", note: "Booked" }, today).reason).toBe("Only 14 days left");
    expect(evaluateAnswer(item, { value_date: "2026-09-30", note: "x" }, today).reason).toBe("Date has passed (1 day ago)");
  });
  it("photo and text items need their value", () => {
    expect(evaluateAnswer({ ...base, answer_type: "photo" }, {}, today).missing).toEqual(["Take the photo"]);
    expect(evaluateAnswer({ ...base, answer_type: "text" }, { value_text: " " }, today).complete).toBe(false);
    expect(evaluateAnswer({ ...base, photo_rule: "always" }, { value_bool: true }, today).missing).toEqual(["Take a photo"]);
  });
});

describe("periods", () => {
  it("uses store time, not UTC", () => {
    // 23:30 UTC on 30 Sep is 01:30 on 1 Oct in Johannesburg.
    expect(periodKey("daily", new Date("2026-09-30T23:30:00Z"), "Africa/Johannesburg")).toBe("2026-10-01");
  });
  it("ISO weeks and quarters", () => {
    expect(periodKey("weekly", new Date("2026-10-01T10:00:00Z"), "UTC")).toBe("2026-W40");
    expect(periodKey("weekly", new Date("2027-01-01T10:00:00Z"), "UTC")).toBe("2026-W53");
    expect(periodKey("quarterly", new Date("2026-10-01T10:00:00Z"), "UTC")).toBe("2026-Q4");
    expect(periodKey("six_monthly", new Date("2026-06-30T10:00:00Z"), "UTC")).toBe("2026-H1");
  });
  it("lists periods in a range", () => {
    expect(periodsInRange("daily", "2026-09-29", "2026-10-01")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(periodsInRange("monthly", "2026-09-29", "2026-10-01")).toEqual(["2026-09", "2026-10"]);
  });
});

describe("checkLocation", () => {
  const store = { latitude: -26.2041, longitude: 28.0473, geofence_m: 150 };
  it("inside, outside, no fix, no store pin", () => {
    expect(checkLocation(store, { lat: -26.2042, lng: 28.0474, accuracyM: 10 }).result).toBe("ok");
    expect(checkLocation(store, { lat: -26.25, lng: 28.0473, accuracyM: 10 }).result).toBe("outside");
    expect(checkLocation(store, null).result).toBe("no_fix");
    expect(checkLocation({ ...store, latitude: null }, null).result).toBe("store_has_no_location");
  });
  it("a poor fix cannot stretch the fence beyond 250 m", () => {
    expect(checkLocation(store, { lat: -26.2141, lng: 28.0473, accuracyM: 5000 }).result).toBe("outside");
  });
});

describe("time and max-age dates", () => {
  it("flags a time after the latest allowed", () => {
    const item: ItemRules = { ...base, answer_type: "time", latest_time: "09:00:00" };
    expect(evaluateAnswer(item, { value_time: "08:55" }, today).isException).toBe(false);
    expect(evaluateAnswer(item, { value_time: "09:20", note: "Late key" }, today)).toMatchObject({ isException: true, reason: "09:20 is after 09:00", complete: true });
  });
  it("flags a last-done date older than allowed", () => {
    const item: ItemRules = { ...base, answer_type: "date", date_mode: "max_age", date_warn_days: 90 };
    expect(evaluateAnswer(item, { value_date: "2026-08-01" }, today).isException).toBe(false);
    expect(evaluateAnswer(item, { value_date: "2026-06-01", note: "x" }, today).reason).toBe("122 days ago, more than the 90 allowed");
  });
});
