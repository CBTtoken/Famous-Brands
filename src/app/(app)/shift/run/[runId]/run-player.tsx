"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, List, X } from "lucide-react";
import { NumberedChoices } from "@/components/numbered-choices";
import { Badge, Button, Notice, Progress, inputClass } from "@/components/ui";
import { OutboxStatus } from "@/components/outbox-status";
import { apiFetch, ApiError, getFix, shrinkPhoto, type Fix } from "@/lib/client";
import { evaluateAnswer, rangeText } from "@/lib/core/evaluate";
import { queueAnswer, sendAnswer } from "@/lib/outbox";
import { tierLabel, type Tier } from "@/lib/core/tiers";

type Answer = {
  value_bool: boolean | null; value_number: string | number | null; value_text: string | null; value_date: string | null; value_time: string | null;
  note: string | null; photo_id: string | null;
};
type Item = {
  id: string; position: number; label: string; help_text: string | null; answer_type: "tick" | "number" | "photo" | "date" | "time" | "text";
  tier: Tier | null; unit: string | null; min_value: string | null; max_value: string | null; range_unconfirmed: boolean;
  photo_rule: "never" | "always" | "on_exception"; date_mode: "expiry" | "max_age"; date_warn_days: number | null; latest_time: string | null;
  answer: Answer | null; complete: boolean;
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

type Draft = { value_bool: boolean | null; value_number: string; value_text: string; value_date: string; value_time: string; note: string; photo_id: string | null; photoBlob: Blob | null; photoUrl: string | null };

function draftFrom(a: Answer | null): Draft {
  return {
    value_bool: a?.value_bool ?? null,
    value_number: a?.value_number == null ? "" : String(Number(a.value_number)),
    value_text: a?.value_text ?? "",
    value_date: a?.value_date ?? "",
    value_time: a?.value_time ?? "",
    note: a?.note ?? "",
    photo_id: a?.photo_id ?? null,
    photoBlob: null,
    photoUrl: a?.photo_id ? `/api/v1/photos/${a.photo_id}` : null,
  };
}

export function RunPlayer({ run, items: initial, startIndex }: { run: { id: string; name: string; storeId: string; storeName: string }; items: Item[]; startIndex: number | null }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [index, setIndex] = useState<number | "review" | "list">(startIndex ?? "review");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(startIndex == null ? null : initial[startIndex].answer));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "warn" | "info"; text: string } | null>(null);
  const [submitted, setSubmitted] = useState<null | { items: number; exceptions: number; at: string }>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const done = items.filter((i) => i.complete || queued.has(i.id)).length;
  const item = typeof index === "number" ? items[index] : null;

  const ev = useMemo(() => {
    if (!item) return null;
    return evaluateAnswer(item, {
      value_bool: draft.value_bool,
      value_number: draft.value_number === "" ? null : Number(draft.value_number.replace(",", ".")),
      value_text: draft.value_text,
      value_date: draft.value_date || null,
      value_time: draft.value_time || null,
      note: draft.note,
      photo_id: draft.photo_id ?? (draft.photoBlob ? "pending" : null),
    }, today());
  }, [item, draft]);

  const open = useCallback((i: number | "review" | "list") => {
    setMsg(null);
    setIndex(i);
    if (typeof i === "number") setDraft(draftFrom(items[i].answer));
    window.scrollTo({ top: 0 });
  }, [items]);

  const nextOpen = (from: number) => {
    for (let k = from + 1; k < items.length; k++) if (!items[k].complete && !queued.has(items[k].id)) return k;
    for (let k = 0; k <= from; k++) if (!items[k].complete && !queued.has(items[k].id)) return k;
    return "review" as const;
  };

  const save = async () => {
    if (!item || !ev || typeof index !== "number") return;
    if (!ev.complete) return setMsg({ kind: "bad", text: ev.missing.join(". ") + "." });
    setBusy(true);
    setMsg(null);
    const fix: Fix = await getFix(5000);
    const body = {
      value_bool: draft.value_bool,
      value_number: draft.value_number === "" ? null : Number(draft.value_number.replace(",", ".")),
      value_text: draft.value_text || null,
      value_date: draft.value_date || null,
      value_time: draft.value_time || null,
      note: draft.note || null,
      photo_id: draft.photoBlob ? null : draft.photo_id,
      geo: fix,
      client_time: new Date().toISOString(),
    };
    const photo = draft.photoBlob ? { blob: draft.photoBlob, clientId: crypto.randomUUID(), fix } : undefined;
    try {
      const r = await sendAnswer({ runId: run.id, itemId: item.id, storeId: run.storeId, body, photo });
      const fresh = await apiFetch<{ items: Item[] }>(`/api/v1/runs/${run.id}`);
      setItems(fresh.items);
      if (r.alerted) setMsg({ kind: "warn", text: "Saved. Your manager has been alerted about this one." });
      const nxt = (() => {
        for (let k = index + 1; k < fresh.items.length; k++) if (!fresh.items[k].complete && !queued.has(fresh.items[k].id)) return k;
        for (let k = 0; k <= index; k++) if (!fresh.items[k].complete && !queued.has(fresh.items[k].id)) return k;
        return "review" as const;
      })();
      setIndex(nxt);
      if (typeof nxt === "number") setDraft(draftFrom(fresh.items[nxt].answer));
      if (!r.alerted) setMsg({ kind: "ok", text: `Saved: ${item.label}` });
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        // No signal: keep it on the phone and carry on.
        await queueAnswer({ key: `${run.id}:${item.id}`, runId: run.id, itemId: item.id, storeId: run.storeId, body, photo, savedAt: new Date().toISOString() });
        setQueued((q) => new Set(q).add(item.id));
        setMsg({ kind: "warn", text: "No signal. Saved on this phone, it will be sent when signal returns." });
        const nxt = nextOpen(index);
        setIndex(nxt);
        if (typeof nxt === "number") setDraft(draftFrom(items[nxt].answer));
      } else {
        setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not saved. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ items: number; exceptions: number }>(`/api/v1/runs/${run.id}/submit`, { method: "POST" });
      setSubmitted({ ...r, at: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) });
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not sent. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <main className="mx-auto max-w-xl px-4 pb-28 pt-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-light text-ok"><Check size={36} /></div>
        <h1 className="text-2xl font-semibold">Thank you</h1>
        <p className="mt-2">{run.name} is done and sent at {submitted.at}.</p>
        <p className="text-muted">{submitted.items} tasks{submitted.exceptions ? `, ${submitted.exceptions} with a problem recorded` : ", no problems"}.</p>
        <Button className="mt-6 w-full" onClick={() => router.push("/shift")}>Back to my shift</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button className="flex items-center text-sm text-brand" onClick={() => router.push("/shift")}><ChevronLeft size={18} /> My shift</button>
        <button className="flex items-center gap-1 text-sm text-brand" onClick={() => open("list")}><List size={18} /> All tasks</button>
      </div>
      <h1 className="text-lg font-semibold">{run.name}</h1>
      <p className="mb-2 text-sm text-muted">{run.storeName}</p>
      <Progress done={done} total={items.length} />
      <div className="my-3"><OutboxStatus /></div>
      {msg && <div className="mb-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

      {index === "list" && (
        <ol className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={it.id}>
              <button onClick={() => open(i)} className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${it.complete || queued.has(it.id) ? "bg-ok text-white" : "bg-background"}`}>
                  {it.complete || queued.has(it.id) ? <Check size={16} /> : i + 1}
                </span>
                <span className="flex-1">{it.label}</span>
                {it.answer && (it.answer as Answer & { is_exception?: boolean }).is_exception && <Badge kind="bad">Problem</Badge>}
              </button>
            </li>
          ))}
          <li className="mt-3"><Button className="w-full" onClick={() => open(nextOpen(-1))}>Carry on</Button></li>
        </ol>
      )}

      {index === "review" && (
        <div className="flex flex-col gap-3">
          {done < items.length ? (
            <Notice kind="warn">{items.length - done} task{items.length - done === 1 ? " is" : "s are"} not finished. Open All tasks to finish them.</Notice>
          ) : queued.size > 0 ? (
            <Notice kind="warn">Some answers are still on this phone waiting for signal. You can send the checklist once they have gone.</Notice>
          ) : (
            <Notice kind="ok">All {items.length} tasks are answered. Send it when you are ready. After this it cannot be changed.</Notice>
          )}
          <Button onClick={submit} disabled={busy || done < items.length || queued.size > 0}>Send the checklist</Button>
          <Button variant="secondary" onClick={() => open("list")}>Check my answers</Button>
        </div>
      )}

      {item && ev && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-1 flex items-center justify-between text-sm text-muted">
              <span>Task {item.position} of {items.length}</span>
              {item.tier && <Badge kind={item.tier === "critical" || item.tier === "urgent" ? "bad" : "warn"}>{tierLabel[item.tier]}</Badge>}
            </div>
            <h2 className="text-xl font-semibold">{item.label}</h2>
            {item.help_text && <p className="mt-1 text-sm text-muted">{item.help_text}</p>}
            {item.answer_type === "number" && rangeText(item) && <p className="mt-1 text-sm">Allowed: {rangeText(item)}</p>}
            {item.answer_type === "time" && item.latest_time && <p className="mt-1 text-sm">By {item.latest_time}</p>}
          </div>

          {item.answer_type === "tick" && (
            <NumberedChoices
              name={item.label}
              value={draft.value_bool == null ? null : draft.value_bool ? "yes" : "no"}
              onChange={(v) => setDraft((d) => ({ ...d, value_bool: v === "yes" }))}
              choices={[{ value: "yes", label: "Done", tone: "ok" }, { value: "no", label: "Not done", tone: "bad" }]}
            />
          )}
          {item.answer_type === "number" && (
            <label className="flex items-center gap-2">
              <input autoFocus className={`${inputClass} text-2xl`} inputMode="decimal" value={draft.value_number}
                onChange={(e) => setDraft((d) => ({ ...d, value_number: e.target.value.replace(/[^\d.,-]/g, "") }))} aria-label={item.label} />
              {item.unit && <span className="text-xl">{item.unit}</span>}
            </label>
          )}
          {item.answer_type === "date" && (
            <input className={`${inputClass} text-xl`} type="date" value={draft.value_date} onChange={(e) => setDraft((d) => ({ ...d, value_date: e.target.value }))} aria-label={item.label} />
          )}
          {item.answer_type === "time" && (
            <input className={`${inputClass} text-xl`} type="time" value={draft.value_time} onChange={(e) => setDraft((d) => ({ ...d, value_time: e.target.value }))} aria-label={item.label} />
          )}
          {item.answer_type === "text" && (
            <textarea className={inputClass} rows={4} value={draft.value_text} onChange={(e) => setDraft((d) => ({ ...d, value_text: e.target.value }))} aria-label={item.label} />
          )}

          {ev.isException && <Notice kind="bad">{ev.reason}. {ev.needsPhoto ? "Take a photo and say" : "Say"} what happened.</Notice>}

          {(item.answer_type === "photo" || ev.needsPhoto) && (
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const small = await shrinkPhoto(f);
                  setDraft((d) => ({ ...d, photoBlob: small, photo_id: null, photoUrl: URL.createObjectURL(small) }));
                }} />
              {draft.photoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.photoUrl} alt="Photo for this task" className="max-h-72 w-full rounded-xl border border-line object-contain" />
                  <button type="button" className="absolute right-2 top-2 rounded-full bg-surface p-1" aria-label="Remove photo"
                    onClick={() => setDraft((d) => ({ ...d, photoBlob: null, photo_id: null, photoUrl: null }))}><X size={18} /></button>
                </div>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                <Camera size={20} /> {draft.photoUrl ? "Take it again" : "Take a photo"}
              </Button>
            </div>
          )}

          {(ev.needsNote || item.answer_type !== "text") && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{ev.needsNote ? "What happened? (needed)" : "Note (if you want to add something)"}</span>
              <textarea className={inputClass} rows={2} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
            </label>
          )}

          <div className="sticky bottom-16 flex gap-2 bg-background py-2 sm:bottom-0">
            {typeof index === "number" && index > 0 && (
              <Button type="button" variant="secondary" onClick={() => open(index - 1)} aria-label="Previous task"><ChevronLeft size={20} /></Button>
            )}
            <Button type="submit" className="flex-1" disabled={busy}>{busy ? "Saving..." : "Save and next"}</Button>
          </div>
        </form>
      )}
    </main>
  );
}
