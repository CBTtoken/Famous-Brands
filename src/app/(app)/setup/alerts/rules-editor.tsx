"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

type Tier = "critical" | "urgent" | "important" | "be_aware";
type Rule = { tier: Tier; recipient_role: string | null; recipient_user_id: string | null; push: boolean };
const tiers: [Tier, string][] = [["critical", "Critical"], ["urgent", "Urgent"], ["important", "Important"], ["be_aware", "Be aware"]];
const roles: [string, string][] = [["admin", "Admins"], ["area_manager", "Area managers"], ["shop_manager", "Shop managers"], ["supervisor", "Supervisors"]];
const autoAlerts: [string, string][] = [
  ["checkin_mismatch_tier", "A check-in that could not be confirmed at the store"],
  ["stock_broken_tier", "An item reported broken"],
  ["stock_stolen_tier", "An item reported stolen or missing"],
  ["stock_worn_tier", "An item reported worn out"],
];

export function RulesEditor({ orgId, rules: initial, people, tiers: initialTiers }: {
  orgId: string; rules: Rule[]; people: { id: string; name: string }[]; tiers: Record<string, string | null>;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initial.map((r) => ({ tier: r.tier, recipient_role: r.recipient_role, recipient_user_id: r.recipient_user_id, push: r.push })));
  const [auto, setAuto] = useState(initialTiers);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const has = (tier: Tier, role: string) => rules.some((r) => r.tier === tier && r.recipient_role === role);
  const toggleRole = (tier: Tier, role: string) =>
    setRules((rs) => has(tier, role) ? rs.filter((r) => !(r.tier === tier && r.recipient_role === role)) : [...rs, { tier, recipient_role: role, recipient_user_id: null, push: true }]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/api/v1/organisations/${orgId}/notification-rules`, { method: "PUT", json: { rules } });
      await apiFetch(`/api/v1/organisations/${orgId}/alert-tiers`, { method: "PUT", json: Object.fromEntries(Object.entries(auto).map(([k, v]) => [k, v || null])) });
      setMsg({ kind: "ok", text: `Saved ${rules.length} rule${rules.length === 1 ? "" : "s"}. New alerts follow these straight away.` });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Card title="Who hears about each tier">
        <p className="mb-3 text-sm text-muted">People in a role only hear about the stores they cover. Admins hear about every store. Each person also needs to turn on alerts on their phone, under Settings.</p>
        <div className="grid gap-4">
          {tiers.map(([tier, label]) => (
            <div key={tier} className="rounded-lg border border-line p-3">
              <h3 className="mb-2 font-semibold">{label}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {roles.map(([role, rl]) => (
                  <label key={role} className="flex items-center gap-2"><input type="checkbox" checked={has(tier, role)} onChange={() => toggleRole(tier, role)} /> {rl}</label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {rules.filter((r) => r.tier === tier && r.recipient_user_id).map((r) => (
                  <span key={r.recipient_user_id} className="flex items-center gap-1 rounded-full bg-brand-light px-2 py-0.5">
                    {people.find((p) => p.id === r.recipient_user_id)?.name ?? "Someone"}
                    <button aria-label="Remove" onClick={() => setRules((rs) => rs.filter((x) => !(x.tier === tier && x.recipient_user_id === r.recipient_user_id)))}>×</button>
                  </span>
                ))}
                <select className="rounded border border-line px-2 py-1" value="" onChange={(e) => e.target.value && setRules((rs) => [...rs, { tier, recipient_role: null, recipient_user_id: e.target.value, push: true }])}>
                  <option value="">Add a named person...</option>
                  {people.filter((p) => !rules.some((r) => r.tier === tier && r.recipient_user_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Automatic alerts">
        <p className="mb-3 text-sm text-muted">Checklist tasks get their tier on the checklist itself. These are the other things that raise an alert.</p>
        <div className="grid gap-3">
          {autoAlerts.map(([k, label]) => (
            <label key={k} className="grid gap-1 sm:grid-cols-[1fr,200px] sm:items-center">
              <span>{label}</span>
              <select className={inputClass} value={auto[k] ?? ""} onChange={(e) => setAuto({ ...auto, [k]: e.target.value || null })}>
                <option value="">Record it, no alert</option>
                {tiers.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Button disabled={busy} onClick={save}>Save</Button>
    </div>
  );
}
