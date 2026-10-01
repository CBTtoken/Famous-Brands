// The forty six tasks from the Store Supervision Functional Spec, Draft 1
// (August 2026), as the client wrote them, turned into what the phone asks
// for. Loaded only when an admin chooses to load them, never automatically.
//
// Rules of this file:
// - Every label is the task as the client wrote it.
// - Where the spec says CONFIRM, the range is left empty and marked
//   range_unconfirmed. Nothing here invents a number.
// - No tier is set. Which tasks are critical is the client's call, made on
//   the checklist screen.
// - Where the spec asks the app to compare two figures (sales against
//   deposits), the POC records each figure, or the difference, as typed.
//   An automatic comparison between two answers is not built yet.
// - The long-term list has no confirmed interval, so it is "when needed"
//   until the client says quarterly or six-monthly.

import type { TemplateInput } from "../services/templates";

type Item = TemplateInput["items"][number];

const tick = (label: string, extra: Partial<Item> = {}): Item => ({ label, answer_type: "tick", ...extra });
const note = (label: string, extra: Partial<Item> = {}): Item => ({ label, answer_type: "text", ...extra });
const unconfirmed = (label: string, unit: string | null, help: string, extra: Partial<Item> = {}): Item => ({
  label, answer_type: "number", unit, range_unconfirmed: true, help_text: help, ...extra,
});

export const starterChecklists: { key: string; template: Omit<TemplateInput, "store_ids"> }[] = [
  {
    key: "daily",
    template: {
      name: "Daily supervisor checks",
      category: "Daily",
      cadence: "daily",
      due_by: null,
      roles: ["supervisor"],
      items: [
        { label: "Confirm outlet opened on time (by 09:00)", answer_type: "time", latest_time: "09:00", help_text: "Enter the actual opening time." },
        unconfirmed("Check staff attendance and punctuality: staff on shift", null, "Number of staff on shift. CONFIRM: the app should compare this with the number scheduled."),
        unconfirmed("Check staff attendance and punctuality: staff scheduled", null, "Number of staff scheduled for this shift."),
        tick("Ensure staff in correct uniform and hygiene"),
        tick("Review staff scheduling for next day"),
        {
          label: "Verify previous day's sales reports match deposits", answer_type: "number", unit: "R", min_value: 0, max_value: 0,
          photo_rule: "on_exception", help_text: "Enter the difference: sales total minus deposit total. Any difference is flagged.",
        },
        unconfirmed("Check voids, discounts, unusual transactions", "R", "Rand value of voids. CONFIRM the daily rand limit.", { photo_rule: "on_exception" }),
        {
          label: "Inspect petty cash and tills", answer_type: "number", unit: "R", min_value: 0, max_value: 0, photo_rule: "always",
          help_text: "Enter the difference: petty cash counted minus float expected. Any difference is flagged.",
        },
        tick("Review raw material levels", { help_text: "CONFIRM the item list and the minimum for each." }),
        tick("Spot-check expiry dates, storage, cold-chain"),
        { label: "Spot-check expiry dates: earliest expiry date found", answer_type: "date", date_mode: "expiry", date_warn_days: 7, photo_rule: "on_exception" },
        unconfirmed("Confirm daily stock usage vs sales", null, "Variance figure. CONFIRM the acceptable variance.", { photo_rule: "on_exception" }),
        unconfirmed("Confirm ovens working at 265°C", "°C", "Oven temperature. CONFIRM the range and the number of ovens, then add one task per oven.", { photo_rule: "on_exception" }),
        unconfirmed("Check fridge temperatures", "°C", "CONFIRM the range and the number of fridges.", { photo_rule: "on_exception" }),
        unconfirmed("Check freezer temperatures", "°C", "CONFIRM the range and the number of freezers.", { photo_rule: "on_exception" }),
        tick("Ensure fire extinguishers and first-aid kits usable"),
        { label: "Fire extinguishers and first-aid kits: next service date", answer_type: "date", date_mode: "expiry", date_warn_days: 30 },
        tick("Confirm outlet cleanliness", { photo_rule: "always" }),
        unconfirmed("Review order accuracy, speed, complaints", null, "Complaints since last visit. CONFIRM where this figure comes from."),
        unconfirmed("Check delivery times and quality", "minutes", "Average delivery time. CONFIRM the acceptable time."),
        tick("Ensure promotions and menus displayed correctly", { photo_rule: "always" }),
        tick("Check drivers' reports, sign off meeting notes"),
        note("Drivers' reports and meeting notes"),
      ],
    },
  },
  {
    key: "weekly",
    template: {
      name: "Weekly supervisor checks",
      category: "Weekly",
      cadence: "weekly",
      due_by: null,
      roles: ["supervisor"],
      items: [
        tick("Walkthrough: presentation, signage, cleanliness", { photo_rule: "always" }),
        note("Check staff performance and customer service"),
        tick("Verify deep cleaning: ovens, fridges, storerooms", { photo_rule: "always" }),
        unconfirmed("Compare weekly sales vs targets: actual sales", "R", "Actual sales for the week."),
        unconfirmed("Compare weekly sales vs targets: target", "R", "Sales target for the week. The percentage is worked out in the report."),
        unconfirmed("Review wastage report and investigate", "R", "Rand value of wastage. CONFIRM the weekly limit."),
        {
          label: "Audit random tills", answer_type: "number", unit: "R", min_value: 0, max_value: 0, photo_rule: "always",
          help_text: "Enter the difference: amount counted minus amount expected. Any difference is flagged.",
        },
        tick("Verify stock ordering vs consumption"),
        note("Stock ordering vs consumption: notes"),
        tick("Check supplier deliveries: quantity, quality, invoices", { photo_rule: "always" }),
        tick("Rotate stock to prevent expiry"),
        tick("Review staff hygiene logs"),
        { label: "Staff hygiene logs: date of last entry", answer_type: "date", date_mode: "max_age", date_warn_days: 7 },
        tick("Test safety equipment: alarms, extinguishers, exits", { photo_rule: "always" }),
        tick("Ensure H&S and labour law notices visible", { photo_rule: "always" }),
      ],
    },
  },
  {
    key: "monthly",
    template: {
      name: "Monthly supervisor checks",
      category: "Monthly",
      cadence: "monthly",
      due_by: null,
      roles: ["supervisor"],
      items: [
        unconfirmed("Review monthly sales, COGS, outlet margins: sales", "R", "CONFIRM: typed in, or taken from the till system."),
        unconfirmed("Review monthly sales, COGS, outlet margins: cost of goods", "R", "CONFIRM: typed in, or taken from the till system."),
        unconfirmed("Review monthly sales, COGS, outlet margins: margin", "%", "CONFIRM: typed in, or taken from the till system."),
        unconfirmed("Check utility bills for spikes", "R", "Rand value. The spec flags this against the previous month; that comparison is not built yet.", { photo_rule: "on_exception" }),
        unconfirmed("Review payroll and overtime hours", "hours", "Overtime hours. CONFIRM the monthly limit."),
        note("Analyse promotions and marketing effectiveness"),
        tick("Hold staff meetings"),
        { label: "Staff meeting: date held", answer_type: "date" },
        note("Staff meeting notes"),
        note("Review staff performance"),
        note("Identify training needs"),
        tick("Inspect equipment for maintenance or repairs", { photo_rule: "on_exception" }),
        note("Equipment maintenance notes"),
        { label: "Schedule preventative maintenance: next service date", answer_type: "date", date_mode: "expiry", date_warn_days: 30 },
        tick("Review pest control reports", { photo_rule: "always" }),
        { label: "Pest control: date of last service", answer_type: "date", date_mode: "max_age", date_warn_days: 90 },
        {
          label: "Ensure licences and permits are valid: earliest expiry date", answer_type: "date", date_mode: "expiry", date_warn_days: 60,
          photo_rule: "always", help_text: "CONFIRM the list of licences, then add one task per licence.",
        },
        tick("File monthly health and safety compliance", { photo_rule: "always" }),
      ],
    },
  },
  {
    key: "long_term",
    template: {
      name: "Long-term reviews",
      category: "Long-term",
      cadence: "as_needed",
      due_by: null,
      roles: ["supervisor"],
      items: [
        note("Review expansion opportunities or renovations"),
        note("Assess long-term staff performance and promotions"),
        { label: "Evaluate supplier contracts: contract end date", answer_type: "date", date_mode: "expiry", date_warn_days: 90 },
        note("Supplier contract notes"),
        unconfirmed("Review customer satisfaction and online reviews: star rating", null, "The spec flags a drop from last time; that comparison is not built yet."),
        unconfirmed("Review customer satisfaction and online reviews: number of reviews", null, "Number of reviews."),
      ],
    },
  },
];
