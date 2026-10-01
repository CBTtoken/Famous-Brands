"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, inputClass } from "@/components/ui";
import { ConditionForm } from "../condition-form";

type Item = { id: string; name: string; area: string; par: number; code: string | null };

export function ReportItem({ storeId, items }: { storeId: string; items: Item[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Item | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? items.filter((i) => i.name.toLowerCase().includes(s) || i.code?.toLowerCase().includes(s)) : items;
  }, [items, search]);

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <Notice kind="ok">{done}</Notice>
        <Button onClick={() => { setDone(null); setPicked(null); setSearch(""); }}>Report another item</Button>
        <Button variant="secondary" onClick={() => router.push("/shift")}>Back to my shift</Button>
      </div>
    );
  }
  if (picked) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-xl font-semibold">{picked.name}</h2>
          <button className="text-sm text-brand" onClick={() => setPicked(null)}>Choose a different item</button>
        </div>
        <ConditionForm storeId={storeId} storeItemId={picked.id} parQty={picked.par} allowFine={false} submitLabel="Send report"
          onSaved={() => setDone(`Thank you. ${picked.name} is reported and a replacement has been suggested to your manager.`)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <input className={inputClass} placeholder="Type to find the item, for example bin" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      {shown.length === 0 && <p className="text-muted">Nothing matches &ldquo;{search}&rdquo;. Try another word.</p>}
      <ul className="flex flex-col gap-1">
        {shown.slice(0, 60).map((i) => (
          <li key={i.id}>
            <button onClick={() => setPicked(i)} className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-left hover:bg-brand-light">{i.name}</button>
          </li>
        ))}
      </ul>
      {shown.length > 60 && <p className="text-sm text-muted">Showing 60 of {shown.length}. Type more of the name to narrow it down.</p>}
    </div>
  );
}
