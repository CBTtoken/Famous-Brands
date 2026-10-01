"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

export function AckButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button disabled={busy} className="rounded border border-line bg-surface px-2 py-1 text-foreground hover:bg-brand-light"
        onClick={async () => {
          setBusy(true);
          try { await apiFetch(`/api/v1/alerts/${id}/acknowledge`, { method: "POST" }); router.refresh(); }
          catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
        }}>Mark as dealt with</button>
      {err && <span className="ml-2 text-bad">{err}</span>}
    </span>
  );
}
