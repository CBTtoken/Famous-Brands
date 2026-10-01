"use client";

import { useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

export function PlatformTools({ orgs }: { orgs: { id: string; name: string; stores: number; people: number }[] }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const pick = async (id: string) => {
    try {
      await apiFetch("/api/v1/session/org", { method: "POST", json: { org_id: id } });
      window.location.assign("/setup");
    } catch (err) {
      setMsg({ kind: "bad", text: err instanceof Error ? err.message : "Failed" });
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1">
        {orgs.map((o, i) => (
          <li key={o.id}><button onClick={() => pick(o.id)} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-brand-light">
            <span className="text-muted">{i + 1}.</span><span className="flex-1 font-medium">{o.name}</span><span className="text-xs text-muted">{o.stores} stores, {o.people} people</span>
          </button></li>
        ))}
      </ol>
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
        e.preventDefault();
        try { const r = await apiFetch<{ id: string }>("/api/v1/organisations", { method: "POST", json: { name } }); pick(r.id); }
        catch (err) { setMsg({ kind: "bad", text: err instanceof Error ? err.message : "Failed" }); }
      }}>
        <Field label="New shop group"><input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Owner or company name" /></Field>
        <Button>Add group</Button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
