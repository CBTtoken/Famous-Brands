"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import { apiFetch } from "@/lib/client";

/** Loads starter content and reports exactly what it added and skipped. */
export function LibraryButton({ orgId, what, label }: { orgId: string; what: "checklists" | "catalogue" | "suppliers"; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await apiFetch<Record<string, unknown>>(`/api/v1/organisations/${orgId}/library`, { method: "POST", json: { what } });
          let text = "";
          if (what === "checklists") {
            const a = r.added as string[], s = r.skipped as string[];
            text = `Added ${a.length} draft checklist${a.length === 1 ? "" : "s"}${a.length ? `: ${a.join(", ")}` : ""}.${s.length ? ` Skipped ${s.length} that already exist: ${s.join(", ")}.` : ""}`;
          } else if (what === "catalogue") {
            text = `Added ${r.added} of ${r.total} items${r.skipped ? `, skipped ${r.skipped} already in the catalogue` : ""}.${r.supplierAdded ? " Catercare Equipment added as their supplier." : ""}`;
          } else {
            text = `Added ${r.added} supplier${r.added === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} already there` : ""}.`;
          }
          setMsg({ kind: "ok", text });
          router.refresh();
        } catch (e) {
          setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not loaded." });
        } finally {
          setBusy(false);
        }
      }}>{busy ? "Loading..." : label}</Button>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
