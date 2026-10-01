"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { Badge, Button, Notice, Progress } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { ConditionForm } from "../../condition-form";

type Data = {
  walk: { id: string; store_id: string; store_name: string };
  items: { store_item_id: string; name: string; code: string | null; area: string; category: string; par_qty: number; report: { condition: string } | null }[];
  done: number; total: number; nextIndex: number | null;
};

const areaLabel: Record<string, string> = { front: "Front of shop", kitchen: "Kitchen", back: "Back of shop", outside: "Outside" };

export function WalkPlayer({ data: initial }: { data: Data }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [index, setIndex] = useState<number | null>(initial.nextIndex);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const item = index == null ? null : data.items[index];

  const refresh = async () => {
    const d = await apiFetch<Data>(`/api/v1/walks/${data.walk.id}`);
    setData(d);
    setIndex(d.nextIndex);
  };

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-3">
      <button className="mb-2 flex items-center text-sm text-brand" onClick={() => router.push("/shift")}><ChevronLeft size={18} /> My shift</button>
      <h1 className="text-lg font-semibold">Shop walk</h1>
      <p className="mb-2 text-sm text-muted">{data.walk.store_name}. You can stop at any time and carry on later.</p>
      <Progress done={data.done} total={data.total} label={`${data.done} of ${data.total} items checked`} />
      {msg && <div className="mt-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

      {item ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-1 flex justify-between text-sm text-muted">
              <span>{areaLabel[item.area] ?? item.area}</span>
              <span>Should have {item.par_qty}</span>
            </div>
            <h2 className="text-xl font-semibold">{item.name}</h2>
            {item.code && <p className="text-xs text-muted">Code {item.code}</p>}
          </div>
          <ConditionForm
            key={item.store_item_id}
            storeId={data.walk.store_id}
            storeItemId={item.store_item_id}
            walkId={data.walk.id}
            parQty={item.par_qty}
            submitLabel="Save and next"
            onSaved={async (r, c) => {
              setMsg(c === "fine" ? { kind: "ok", text: `Saved: ${item.name}, fine.` } : { kind: "warn", text: `Saved: ${item.name}. A replacement has been suggested to your manager.` });
              await refresh();
            }}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <Notice kind="ok">Every item is checked. Send the walk to finish.</Notice>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await apiFetch(`/api/v1/walks/${data.walk.id}/submit`, { method: "POST" });
              router.push("/shift");
            } catch (e) {
              setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not sent." });
              setBusy(false);
            }
          }}>Finish the shop walk</Button>
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-brand">See all items</summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {data.items.map((it, i) => (
            <li key={it.store_item_id}>
              <button disabled={!!it.report} onClick={() => setIndex(i)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-brand-light disabled:hover:bg-transparent">
                {it.report ? <Check size={14} className="text-ok" /> : <span className="w-3.5" />}
                <span className="flex-1">{it.name}</span>
                {it.report && it.report.condition !== "fine" && <Badge kind="bad">{it.report.condition}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
