"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

type Key = { id: string; name: string; key_prefix: string; role: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export function KeysEditor({ orgId, keys }: { orgId: string; keys: Key[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("shop_manager");
  const [fresh, setFresh] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  return (
    <Card title="Keys">
      {fresh && <div className="mb-3"><Notice kind="warn">Copy this key now. It is shown once and cannot be shown again:<br /><code className="break-all text-base">{fresh}</code></Notice></div>}
      {msg && <div className="mb-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <ul className="mb-4 divide-y divide-line text-sm">
        {keys.length === 0 && <li className="py-2 text-muted">No keys yet.</li>}
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{k.name} <code className="text-xs">{k.key_prefix}...</code> <Badge>{k.role.replace("_", " ")}</Badge> {k.revoked_at && <Badge kind="bad">Revoked</Badge>}
              <span className="block text-xs text-muted">{k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString("en-ZA")}` : "Never used"}</span></span>
            {!k.revoked_at && <Button variant="ghost" onClick={async () => {
              if (!confirm(`Revoke ${k.name}? Anything using it stops working at once.`)) return;
              try { await apiFetch(`/api/v1/organisations/${orgId}/api-keys/${k.id}`, { method: "DELETE" }); setMsg({ kind: "ok", text: `${k.name} revoked.` }); router.refresh(); }
              catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Failed" }); }
            }}>Revoke</Button>}
          </li>
        ))}
      </ul>
      <form className="grid gap-2 sm:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await apiFetch<{ key: string }>(`/api/v1/organisations/${orgId}/api-keys`, { method: "POST", json: { name, role } });
          setFresh(r.key); setName(""); setMsg(null); router.refresh();
        } catch (err) { setMsg({ kind: "bad", text: err instanceof Error ? err.message : "Failed" }); }
      }}>
        <Field label="Which system is it for"><input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Munch" /></Field>
        <Field label="Acts as"><select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="shop_manager">Shop manager (read reports, stock)</option><option value="area_manager">Area manager</option><option value="admin">Admin (everything, including the event feed)</option>
        </select></Field>
        <div className="flex items-end"><Button className="w-full">Create key</Button></div>
      </form>
    </Card>
  );
}
