"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { money } from "@/lib/client-format";

type Item = { id: string; code: string | null; name: string; category: string; unit_price_cents: number | null; price_source: string | null; default_supplier_id: string | null; supplier_name: string | null; franchise_locked: "yes" | "no" | "unknown"; standard_qty: number | null; service_interval_days: number | null; notes: string | null; active: boolean };
type Supplier = { id: string; name: string; notes: string | null; items: number; contact_name: string | null; phone: string | null; email: string | null; website: string | null };

const lockText = { yes: "Franchise supplier only", no: "Open market", unknown: "Not confirmed" };

export function CatalogueEditor({ orgId, items, suppliers }: { orgId: string; items: Item[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState<Item | null>(null);
  const [sup, setSup] = useState<Partial<Supplier> | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => { const f = filter.toLowerCase(); return f ? items.filter((i) => `${i.name} ${i.code ?? ""} ${i.category}`.toLowerCase().includes(f)) : items; }, [items, filter]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ kind: "ok", text: await fn() }); router.refresh(); return true; }
    catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not saved." }); return false; }
    finally { setBusy(false); }
  };

  return (
    <>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title={`Suppliers (${suppliers.length})`} aside={<Button variant="secondary" onClick={() => setSup({ name: "" })}>Add a supplier</Button>}>
        <ul className="divide-y divide-line text-sm">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2 py-2">
              <div><span className="font-medium">{s.name}</span> <span className="text-muted">({s.items} item{s.items === 1 ? "" : "s"} by default)</span>{s.notes && <div className="text-xs text-muted">{s.notes}</div>}</div>
              <Button variant="ghost" onClick={() => setSup(s)}>Change</Button>
            </li>
          ))}
        </ul>
        {sup && (
          <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => {
            const body = { name: sup.name, contact_name: sup.contact_name || null, phone: sup.phone || null, email: sup.email || null, website: sup.website || null, notes: sup.notes || null };
            if (sup.id) await apiFetch(`/api/v1/organisations/${orgId}/suppliers/${sup.id}`, { method: "PUT", json: body });
            else await apiFetch(`/api/v1/organisations/${orgId}/suppliers`, { method: "POST", json: body });
            setSup(null);
            return `${body.name} saved.`;
          }); }}>
            <Field label="Name"><input required className={inputClass} value={sup.name ?? ""} onChange={(e) => setSup({ ...sup, name: e.target.value })} /></Field>
            <Field label="Contact person"><input className={inputClass} value={sup.contact_name ?? ""} onChange={(e) => setSup({ ...sup, contact_name: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputClass} value={sup.phone ?? ""} onChange={(e) => setSup({ ...sup, phone: e.target.value })} /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={sup.email ?? ""} onChange={(e) => setSup({ ...sup, email: e.target.value })} /></Field>
            <Field label="Website"><input className={inputClass} value={sup.website ?? ""} onChange={(e) => setSup({ ...sup, website: e.target.value })} /></Field>
            <Field label="Notes"><input className={inputClass} value={sup.notes ?? ""} onChange={(e) => setSup({ ...sup, notes: e.target.value })} /></Field>
            <div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>Save supplier</Button><Button type="button" variant="secondary" onClick={() => setSup(null)}>Cancel</Button></div>
          </form>
        )}
      </Card>

      <Card title={`Catalogue (${items.length} items)`} aside={<Button variant="secondary" onClick={() => setEdit({ id: "", code: null, name: "", category: "General", unit_price_cents: null, price_source: null, default_supplier_id: null, supplier_name: null, franchise_locked: "unknown", standard_qty: null, service_interval_days: null, notes: null, active: true })}>Add an item</Button>}>
        {edit && (
          <form className="mb-4 grid gap-2 rounded-lg border border-brand p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
            const body = { ...edit, id: undefined, supplier_name: undefined };
            if (edit.id) await apiFetch(`/api/v1/organisations/${orgId}/catalogue/${edit.id}`, { method: "PUT", json: body });
            else await apiFetch(`/api/v1/organisations/${orgId}/catalogue`, { method: "POST", json: body });
            setEdit(null);
            return `${edit.name} saved.`;
          }); }}>
            <Field label="Item name"><input required className={inputClass} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Code"><input className={inputClass} value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value || null })} /></Field>
            <Field label="Category"><input className={inputClass} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
            <Field label="Price per unit, excl. VAT (R)"><input className={inputClass} inputMode="decimal" value={edit.unit_price_cents == null ? "" : (edit.unit_price_cents / 100).toString()} onChange={(e) => setEdit({ ...edit, unit_price_cents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} /></Field>
            <Field label="Where the price came from"><input className={inputClass} value={edit.price_source ?? ""} onChange={(e) => setEdit({ ...edit, price_source: e.target.value || null })} /></Field>
            <Field label="Default supplier"><select className={inputClass} value={edit.default_supplier_id ?? ""} onChange={(e) => setEdit({ ...edit, default_supplier_id: e.target.value || null })}>
              <option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></Field>
            <Field label="Franchise-locked?"><select className={inputClass} value={edit.franchise_locked} onChange={(e) => setEdit({ ...edit, franchise_locked: e.target.value as Item["franchise_locked"] })}>
              <option value="unknown">Not confirmed</option><option value="yes">Yes, franchise supplier only</option><option value="no">No, open market</option>
            </select></Field>
            <Field label="Quantity on the starter list"><input className={inputClass} inputMode="numeric" value={edit.standard_qty ?? ""} onChange={(e) => setEdit({ ...edit, standard_qty: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} /></Field>
            <Field label="Service every (days)" hint="For fire extinguishers and similar."><input className={inputClass} inputMode="numeric" value={edit.service_interval_days ?? ""} onChange={(e) => setEdit({ ...edit, service_interval_days: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} /></Field>
            <Field label="Notes"><input className={inputClass} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value || null })} /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> In use</label>
            <div className="flex gap-2 sm:col-span-3"><Button disabled={busy}>Save item</Button><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button></div>
          </form>
        )}
        <input className={`${inputClass} mb-3`} placeholder="Find an item" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="py-1 pr-2">Item</th><th className="pr-2">Category</th><th className="pr-2">Price</th><th className="pr-2">Supplier</th><th className="pr-2">Starter qty</th><th className="pr-2">Franchise-locked</th><th /></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className={`border-b border-line ${i.active ? "" : "opacity-50"}`}>
                  <td className="py-1.5 pr-2">{i.name}{i.code && <div className="text-xs text-muted">{i.code}</div>}{i.notes && <div className="text-xs text-warn">{i.notes}</div>}</td>
                  <td className="pr-2">{i.category}</td>
                  <td className="pr-2">{i.unit_price_cents == null ? <span className="text-muted">None</span> : money(i.unit_price_cents)}</td>
                  <td className="pr-2">{i.supplier_name ?? <span className="text-muted">None</span>}</td>
                  <td className="pr-2">{i.standard_qty ?? ""}</td>
                  <td className="pr-2"><Badge kind={i.franchise_locked === "unknown" ? "warn" : "neutral"}>{lockText[i.franchise_locked]}</Badge></td>
                  <td><Button variant="ghost" onClick={() => setEdit(i)}>Change</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
