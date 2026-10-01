"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { NumberedChoices } from "@/components/numbered-choices";
import { apiFetch } from "@/lib/client";

type Role = "admin" | "area_manager" | "shop_manager" | "supervisor";
type Person = { id: string; full_name: string; email: string | null; phone: string | null; role: Role; active: boolean; must_change_password: boolean; stores: { store_id: string; name: string; can_order: boolean }[] };
const roleText: Record<Role, string> = { admin: "Admin", area_manager: "Area manager", shop_manager: "Shop manager", supervisor: "Shop floor supervisor" };
const roleHint: Record<Role, string> = {
  supervisor: "Checks in, does checklists, reports broken items. Sees only their own stores.",
  shop_manager: "Everything a supervisor does, plus reports, alerts and the stock list for their stores.",
  area_manager: "Same as a shop manager, across several stores.",
  admin: "Everything, in every store, including this setup.",
};

function pretty(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : phone;
}

export function PeopleEditor({ orgId, me, people, stores }: { orgId: string; me: string; people: Person[]; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<"form" | "readback">("form");
  const [f, setF] = useState({ full_name: "", email: "", phone: "", role: "supervisor" as Role, password: "" });
  const [assigning, setAssigning] = useState<Person | null>(null);
  const [assign, setAssign] = useState<Record<string, { on: boolean; can_order: boolean }>>({});

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ kind: "ok", text: await fn() }); router.refresh(); return true; }
    catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not saved." }); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title={`People (${people.length})`} aside={<Button variant="secondary" onClick={() => { setAdding(true); setStep("form"); }}>Add a person</Button>}>
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div>
                <div className="font-medium">{p.full_name} <Badge kind="brand">{roleText[p.role]}</Badge> {!p.active && <Badge kind="warn">Cannot sign in</Badge>} {p.must_change_password && p.active && <Badge>Has not signed in yet</Badge>}</div>
                <div className="text-xs text-muted">{[p.email, p.phone && pretty(p.phone)].filter(Boolean).join(", ")}</div>
                <div className="text-xs">{p.role === "admin" ? "All stores" : p.stores.length ? p.stores.map((s) => s.name + (s.can_order ? " (can order)" : "")).join(", ") : <span className="text-bad">No stores yet</span>}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.role !== "admin" && (
                  <Button variant="ghost" onClick={() => { setAssigning(p); setAssign(Object.fromEntries(stores.map((s) => { const a = p.stores.find((x) => x.store_id === s.id); return [s.id, { on: !!a, can_order: a?.can_order ?? false }]; }))); }}>Stores</Button>
                )}
                <select aria-label="Role" className="rounded border border-line px-2 py-1 text-sm" value={p.role} disabled={busy || p.id === me}
                  onChange={(e) => run(async () => { await apiFetch(`/api/v1/organisations/${orgId}/people/${p.id}`, { method: "PATCH", json: { role: e.target.value } }); return `${p.full_name} is now ${roleText[e.target.value as Role].toLowerCase()}.`; })}>
                  {Object.entries(roleText).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <Button variant="ghost" disabled={busy} onClick={() => {
                  const pw = prompt(`New password for ${p.full_name} (at least 8 characters). They will be asked to change it.`);
                  if (pw) run(async () => { await apiFetch(`/api/v1/organisations/${orgId}/people/${p.id}/password`, { method: "POST", json: { password: pw } }); return `New password set for ${p.full_name}. Give it to them in person or by phone.`; });
                }}>New password</Button>
                {p.id !== me && (
                  <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await apiFetch(`/api/v1/organisations/${orgId}/people/${p.id}`, { method: "PATCH", json: { active: !p.active } }); return p.active ? `${p.full_name} can no longer sign in. Their records stay.` : `${p.full_name} can sign in again.`; })}>
                    {p.active ? "Stop access" : "Allow access"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {assigning && (
        <Card title={`Stores for ${assigning.full_name}`}>
          {stores.length === 0 ? <p className="text-muted">Add a store first.</p> : (
            <ul className="flex flex-col gap-2">
              {stores.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={assign[s.id]?.on ?? false} onChange={(e) => setAssign({ ...assign, [s.id]: { on: e.target.checked, can_order: assign[s.id]?.can_order ?? false } })} /> {s.name}</label>
                  {assign[s.id]?.on && assigning.role !== "supervisor" && (
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assign[s.id]?.can_order ?? false} onChange={(e) => setAssign({ ...assign, [s.id]: { on: true, can_order: e.target.checked } })} /> Can approve orders</label>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button disabled={busy} onClick={async () => {
              const ok = await run(async () => {
                const list = Object.entries(assign).filter(([, v]) => v.on).map(([store_id, v]) => ({ store_id, can_order: v.can_order }));
                await apiFetch(`/api/v1/organisations/${orgId}/people/${assigning.id}/assignments`, { method: "PUT", json: { assignments: list } });
                return `${assigning.full_name} now covers ${list.length} store${list.length === 1 ? "" : "s"}.`;
              });
              if (ok) setAssigning(null);
            }}>Save</Button>
            <Button variant="secondary" onClick={() => setAssigning(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {adding && (
        <Card title="Add a person">
          {step === "form" ? (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (!f.email && !f.phone) return setMsg({ kind: "bad", text: "Give an email address or a phone number." }); setStep("readback"); }}>
              <Field label="Full name"><input required className={inputClass} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
              <Field label="Phone number" hint="They can sign in with this."><input className={inputClass} type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Email address" hint="Or with this."><input className={inputClass} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <div>
                <span className="text-sm font-medium">What do they do?</span>
                <div className="mt-1"><NumberedChoices name="Role" autoFocusKeys={false} value={f.role} onChange={(r) => setF({ ...f, role: r })}
                  choices={(["supervisor", "shop_manager", "area_manager", "admin"] as Role[]).map((r) => ({ value: r, label: roleText[r], hint: roleHint[r] }))} /></div>
              </div>
              <Field label="First password" hint="At least 8 characters. They choose their own the first time they sign in."><input required minLength={8} className={inputClass} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
              <div className="flex gap-2"><Button type="submit">Next</Button><Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button></div>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p>Please check these carefully. A wrong number or email means they cannot sign in.</p>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-lg bg-background p-3 text-lg">
                <dt className="text-sm text-muted">Name</dt><dd>{f.full_name}</dd>
                {f.phone && <><dt className="text-sm text-muted">Phone</dt><dd className="font-mono tracking-wider">{pretty(f.phone)}</dd></>}
                {f.email && <><dt className="text-sm text-muted">Email</dt><dd className="font-mono">{f.email.trim().toLowerCase()}</dd></>}
                <dt className="text-sm text-muted">Role</dt><dd>{roleText[f.role]}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={async () => {
                  const ok = await run(async () => {
                    await apiFetch(`/api/v1/organisations/${orgId}/people`, { method: "POST", json: { ...f, email: f.email || null, phone: f.phone || null } });
                    return `${f.full_name} added. Now choose which stores they cover.`;
                  });
                  if (ok) { setAdding(false); setF({ full_name: "", email: "", phone: "", role: "supervisor", password: "" }); }
                }}>1. Yes, that is right</Button>
                <Button variant="secondary" onClick={() => setStep("form")}>2. No, let me fix it</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
