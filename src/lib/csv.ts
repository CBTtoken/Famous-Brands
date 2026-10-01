import { answerText, type checklistReport } from "./services/reports";
import { formatDateTime } from "./core/time";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas in anything a person typed.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per answer: the form Famous Brands can open in Excel. */
export function reportCsv(r: Awaited<ReturnType<typeof checklistReport>>) {
  const rows: unknown[][] = [[
    "Store", "Checklist", "Period", "Status", "Started", "Submitted", "Task", "Answer", "Unit", "Problem", "Reason", "Note",
    "Photo", "Answered by", "Answered at (server)", "Captured on phone at", "Latitude", "Longitude", "Accuracy (m)",
  ]];
  for (const run of r.runs) {
    for (const a of run.answers) {
      rows.push([
        r.store.name, run.template_name, run.period_key, run.status === "submitted" ? "Submitted" : "Not finished",
        formatDateTime(run.started_at), formatDateTime(run.submitted_at), a.label, answerText(a), a.unit ?? "",
        a.is_exception ? "Yes" : "", a.exception_reason ?? "", a.note ?? "", a.photo_id ? "Yes" : "",
        a.answered_by ?? "", formatDateTime(a.received_at), formatDateTime(a.client_captured_at), a.lat ?? "", a.lng ?? "", a.accuracy_m ?? "",
      ]);
    }
  }
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
