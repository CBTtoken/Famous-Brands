"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { money } from "@/lib/client-format";

type Item = { id: string; catalogue_item_id: string; code: string | null; name: string; category: string; area: string; par_qty: number; supplier_id: string | null; supplier_name: string | null; unit_price_cents: number | null; next_service_date: string | null; broken: number; stolen: number; worn: number; open_reports: number; open_orders: number };
type Report = { id: string; item_name: string; condition: string; qty: number; note: string | null; photo_id: string | null; reported_by: string; created_at: string };
type Reorder = { id: string; item_name: string; qty: number; unit_price_cents: number | null; reason: string; supplier_name: string | null; created_by: string | null; created_at: string; franchise_locked: string };
type Cat = { id: string; name: string; category: string; code: string | null };
type Supplier = { id: string; name: string };

const reasonText: Record<string, string> = { starter: "Starter list", broken: "Broken", stolen: "Stolen or missing", worn: "Worn out", top_up: "Top up" };
const areaText: Record<string, string> = { front: "Front of shop", kitchen: "Kitchen", back: "Back of shop", outside: "Outside" };

export function StockView({ store, canManage, canOrder, data }: {
  store: { id: string; name: string }; canManage: boolean; canOrder: boolean;
  data: { items: Item[]; reports: Report[]; reorders: Reorder[]; catalogue: Cat[]; suppliers: Supplier[] };
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState<{ catalogue_item_id: string; par_qty: string; area: string; supplier_id: string }>({ catalogue_item_id: "", par_qty: "1", area: "kitchen", supplier_id: "" });

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ kind: "ok", text: await fn() }); router.refresh(); }
    catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "That did not work." }); }
    finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? data.items.filter((i) => i.name.toLowerCase().includes(f) || i.category.toLowerCase().includes(f)) : data.items;
  }, [data.items, filter]);
  const reorderTotal = data.reorders.reduce((t, r) => t + r.qty * (r.unit_price_cents ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Card title={`Waiting to be ordered (${data.reorders.length})`} aside={reorderTotal ? <span className="text-sm text-muted">{money(reorderTotal)} excl. VAT</span> : undefined}>
        {!canOrder && data.reorders.length > 0 && <div className="mb-2"><Notice>You can see these, but ordering for {store.name} needs ordering authority. Your admin can give it.</Notice></div>}
        {data.reorders.length === 0 ? <Empty>Nothing waiting.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="py-1 pr-2">Item</th><th className="pr-2">Why</th><th className="pr-2">Qty</th><th className="pr-2">Supplier</th><th className="pr-2">Value</th><th /></tr></thead>
              <tbody>
                {data.reorders.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top">
                    <td className="py-2 pr-2">{r.item_name}{r.franchise_locked === "unknown" && <div className="text-xs text-muted">Franchise-locked? Not confirmed yet.</div>}</td>
                    <td className="pr-2">{reasonText[r.reason] ?? r.reason}</td>
                    <td className="pr-2">{r.qty}</td>
                    <td className="pr-2">{r.supplier_name ?? <span className="text-muted">No supplier set</span>}</td>
                    <td className="pr-2">{r.unit_price_cents == null ? <span className="text-muted">No price</span> : money(r.qty * r.unit_price_cents)}</td>
                    <td className="whitespace-nowrap">
                      {canOrder && (
                        <span className="flex gap-1">
                          <button disabled={busy} className="rounded border border-line px-2 py-1 hover:bg-ok-light" onClick={() => act(async () => { await apiFetch(`/api/v1/reorders/${r.id}`, { method: "POST", json: { decision: "ordered" } }); return `${r.item_name} marked as ordered.`; })}>Ordered</button>
                          <button disabled={busy} className="rounded border border-line px-2 py-1 hover:bg-bad-light" onClick={() => act(async () => { await apiFetch(`/api/v1/reorders/${r.id}`, { method: "POST", json: { decision: "dismissed" } }); return `${r.item_name} removed from the list.`; })}>Not needed</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Placing the order with the supplier happens outside this system for now. Mark it here once it is placed.</p>
          </div>
        )}
      </Card>

      <Card title={`Items with a problem (${data.reports.length})`}>
        {data.reports.length === 0 ? <Empty>No open problems.</Empty> : (
          <ul className="divide-y divide-line">
            {data.reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.photo_id && <img src={`/api/v1/photos/${r.photo_id}`} alt={r.item_name} className="h-14 w-14 rounded border border-line object-cover" />}
                <div className="flex-1">
                  <div className="font-medium">{r.item_name} <Badge kind="bad">{r.qty} {reasonText[r.condition]?.toLowerCase()}</Badge></div>
                  <div className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-ZA")} by {r.reported_by}{r.note ? `. "${r.note}"` : ""}</div>
                </div>
                {canManage && (
                  <button disabled={busy} className="rounded border border-line px-2 py-1 text-sm hover:bg-ok-light"
                    onClick={() => { const note = prompt("What was done? (for example: replaced, found, repaired)"); if (note === null) return; act(async () => { await apiFetch(`/api/v1/condition-reports/${r.id}/resolve`, { method: "POST", json: { note } }); return `${r.item_name} marked as dealt with.`; }); }}>
                    Dealt with
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`${store.name}: item list (${data.items.length})`}>
        {data.items.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Empty>This shop has no item list yet.</Empty>
            {canManage && (data.catalogue.length ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => act(async () => { const r = await apiFetch<{ added: number; skipped: number; suggested: number }>(`/api/v1/stores/${store.id}/starter-list`, { method: "POST", json: { suggest_order: true } }); return `New shop: added ${r.added} items and put ${r.suggested} on the order list as the opening order.${r.skipped ? ` ${r.skipped} were already on the list.` : ""}`; })}>
                  1. New shop: add the standard list and its opening order
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => act(async () => { const r = await apiFetch<{ added: number; skipped: number }>(`/api/v1/stores/${store.id}/starter-list`, { method: "POST", json: { suggest_order: false } }); return `Existing shop: added ${r.added} items. Nothing was put on the order list.${r.skipped ? ` ${r.skipped} were already on the list.` : ""}`; })}>
                  2. Existing shop: add the standard list only
                </Button>
              </div>
            ) : <Notice>The catalogue is empty. An admin can load the standard smalls list under Setup, Catalogue.</Notice>)}
          </div>
        ) : (
          <>
            <input className={`${inputClass} mb-3`} placeholder="Find an item" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="py-1 pr-2">Item</th><th className="pr-2">Where</th><th className="pr-2">Should have</th><th className="pr-2">Condition</th><th className="pr-2">Supplier</th><th>Service due</th></tr></thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id} className="border-b border-line">
                      <td className="py-1.5 pr-2">{i.name}<div className="text-xs text-muted">{i.category}</div></td>
                      <td className="pr-2">{areaText[i.area] ?? i.area}</td>
                      <td className="pr-2">{i.par_qty}</td>
                      <td className="pr-2">
                        {i.open_reports ? (
                          <span className="flex flex-wrap gap-1">
                            {i.broken > 0 && <Badge kind="bad">{i.broken} broken</Badge>}
                            {i.stolen > 0 && <Badge kind="bad">{i.stolen} stolen</Badge>}
                            {i.worn > 0 && <Badge kind="warn">{i.worn} worn</Badge>}
                          </span>
                        ) : <Badge kind="ok">Fine</Badge>}
                      </td>
                      <td className="pr-2">{i.supplier_name ?? <span className="text-muted">Not set</span>}</td>
                      <td className={i.next_service_date && i.next_service_date < today ? "font-medium text-bad" : ""}>{i.next_service_date ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {canManage && data.catalogue.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-brand">Add or change an item for this shop</summary>
            <form className="mt-3 grid gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); act(async () => {
              await apiFetch(`/api/v1/stores/${store.id}/items`, { method: "POST", json: { catalogue_item_id: adding.catalogue_item_id, par_qty: Number(adding.par_qty) || 0, area: adding.area, supplier_id: adding.supplier_id || null } });
              return "Saved to this shop's list.";
            }); }}>
              <select required className={`${inputClass} sm:col-span-2`} value={adding.catalogue_item_id} onChange={(e) => setAdding({ ...adding, catalogue_item_id: e.target.value })}>
                <option value="">Choose an item</option>
                {data.catalogue.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className={inputClass} inputMode="numeric" aria-label="Should have" value={adding.par_qty} onChange={(e) => setAdding({ ...adding, par_qty: e.target.value.replace(/\D/g, "") })} />
              <select className={inputClass} value={adding.area} onChange={(e) => setAdding({ ...adding, area: e.target.value })}>
                {Object.entries(areaText).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className={inputClass} value={adding.supplier_id} onChange={(e) => setAdding({ ...adding, supplier_id: e.target.value })}>
                <option value="">Catalogue default supplier</option>
                {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Button className="sm:col-span-5" disabled={busy || !adding.catalogue_item_id}>Save</Button>
            </form>
          </details>
        )}
      </Card>
    </div>
  );
}
