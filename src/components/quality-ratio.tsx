import type { sos } from "@/lib/services/reports";
import { Stat } from "@/components/ui";

function pct(v: number | null) {
  return v == null ? "No data" : `${v}%`;
}

/**
 * Dewald, 1 October 2026: no formula yet, so the two raw rates are shown side
 * by side and never combined. Each shows what it was counted from.
 */
export function QualityRatio({ qr }: { qr: Awaited<ReturnType<typeof sos>>["quality_ratio"] }) {
  const c = qr.checklist_pass_rate;
  const k = qr.stock_condition_rate;
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Stat label="Checklist pass rate" value={pct(c.pct)}
          hint={c.answers ? `${c.passed} of ${c.answers} answers had no problem` : "No checklist answers in these dates"} />
        <Stat label="Stock condition rate" value={pct(k.pct)}
          hint={k.items ? `${k.fine} of ${k.items} items fine today` : "No item list set up yet"} />
      </div>
      <p className="mt-2 text-sm text-muted">
        Formula to be confirmed. These are the two raw rates, shown separately. They are not combined into one score until the weighting is agreed.
      </p>
    </>
  );
}
