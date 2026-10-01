"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberedChoices } from "@/components/numbered-choices";
import { Notice } from "@/components/ui";
import { apiFetch, getFix } from "@/lib/client";

type Item = { templateId: string; runId: string | null; name: string; hint: string; status: "in_progress" | "submitted" | null };

export function VisitActions({ checklists, visitId }: { checklists: Item[]; visitId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extra = [
    { value: "walk", label: "Walk the shop", hint: "Check every item: fine, broken, stolen or worn." },
    { value: "report", label: "Report a broken or missing item", hint: "One item, right now." },
    { value: "checkout", label: "Check out", hint: "When you leave the store." },
  ];
  const choices = [
    ...checklists.map((c) => ({ value: `t:${c.templateId}`, label: c.name, hint: c.hint, tone: c.status === "submitted" ? ("ok" as const) : undefined })),
    ...extra,
  ];

  const go = async (v: string) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (v.startsWith("t:")) {
        const c = checklists.find((x) => x.templateId === v.slice(2))!;
        if (c.status === "submitted" && c.runId) return router.push(`/reports/runs/${c.runId}`);
        const r = await apiFetch<{ run_id: string }>("/api/v1/runs", { method: "POST", json: { template_id: c.templateId } });
        return router.push(`/shift/run/${r.run_id}`);
      }
      if (v === "walk") {
        const r = await apiFetch<{ walk_id: string }>("/api/v1/walks", { method: "POST" });
        return router.push(`/shift/walk/${r.walk_id}`);
      }
      if (v === "report") return router.push("/shift/report-item");
      if (v === "checkout") {
        if (!confirm("Check out of this store now?")) return setBusy(false);
        const fix = await getFix();
        await apiFetch(`/api/v1/visits/${visitId}/checkout`, { method: "POST", json: { geo: fix, client_time: new Date().toISOString() } });
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <NumberedChoices name="What next" choices={choices} value={null} onChange={go} disabled={busy} />
      {error && <Notice kind="bad">{error}</Notice>}
      {busy && <p className="text-sm text-muted">Opening...</p>}
    </div>
  );
}
