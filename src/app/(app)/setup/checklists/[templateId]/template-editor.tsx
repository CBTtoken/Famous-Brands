"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

type AnswerType = "tick" | "number" | "photo" | "date" | "time" | "text";
type Item = {
  id?: string; label: string; help_text: string; answer_type: AnswerType; tier: "" | "critical" | "urgent" | "important" | "be_aware";
  unit: string; min_value: string; max_value: string; range_unconfirmed: boolean; photo_rule: "never" | "always" | "on_exception";
  date_mode: "expiry" | "max_age"; date_warn_days: string; latest_time: string;
};
type Initial = {
  id: string; name: string; category: string; cadence: string; due_by: string | null; roles: string[]; status: string; store_ids: string[];
  items: { id: string; label: string; help_text: string | null; answer_type: AnswerType; tier: Item["tier"] | null; unit: string | null; min_value: string | null; max_value: string | null; range_unconfirmed: boolean; photo_rule: Item["photo_rule"]; date_mode: Item["date_mode"]; date_warn_days: number | null; latest_time: string | null; retired: boolean }[];
};

const typeText: Record<AnswerType, string> = { tick: "Done or not done", number: "A number (with allowed range)", photo: "A photo", date: "A date", time: "A time", text: "A short note" };
const blank = (): Item => ({ label: "", help_text: "", answer_type: "tick", tier: "", unit: "", min_value: "", max_value: "", range_unconfirmed: false, photo_rule: "never", date_mode: "expiry", date_warn_days: "", latest_time: "" });

export function TemplateEditor({ orgId, stores, initial }: { orgId: string; stores: { id: string; name: string }[]; initial: Initial | null }) {
  const router = useRouter();
  const [meta, setMeta] = useState({
    name: initial?.name ?? "", category: initial?.category ?? "Opening checks", cadence: initial?.cadence ?? "daily", due_by: initial?.due_by ?? "",
    roles: initial?.roles ?? ["supervisor"], store_ids: initial?.store_ids ?? [],
  });
  const [items, setItems] = useState<Item[]>(
    initial ? initial.items.filter((i) => !i.retired).map((i) => ({
      id: i.id, label: i.label, help_text: i.help_text ?? "", answer_type: i.answer_type, tier: i.tier ?? "", unit: i.unit ?? "",
      min_value: i.min_value == null ? "" : String(Number(i.min_value)), max_value: i.max_value == null ? "" : String(Number(i.max_value)),
      range_unconfirmed: i.range_unconfirmed, photo_rule: i.photo_rule, date_mode: i.date_mode, date_warn_days: i.date_warn_days?.toString() ?? "", latest_time: i.latest_time ?? "",
    })) : [blank()],
  );
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const status = initial?.status ?? "draft";
  const unconfirmed = items.filter((i) => i.answer_type === "number" && i.range_unconfirmed).length;

  const upd = (k: number, p: Partial<Item>) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, ...p } : x)));
  const move = (k: number, d: -1 | 1) => setItems((xs) => { const n = [...xs]; const t = n[k + d]; if (!t) return xs; n[k + d] = n[k]; n[k] = t; return n; });

  const payload = () => ({
    ...meta, due_by: meta.due_by || null,
    items: items.map((i) => ({
      id: i.id, label: i.label, help_text: i.help_text || null, answer_type: i.answer_type, tier: i.tier || null, unit: i.unit || null,
      min_value: i.min_value === "" ? null : Number(i.min_value), max_value: i.max_value === "" ? null : Number(i.max_value),
      range_unconfirmed: i.range_unconfirmed, photo_rule: i.photo_rule, date_mode: i.date_mode,
      date_warn_days: i.date_warn_days === "" ? null : Number(i.date_warn_days), latest_time: i.latest_time || null,
    })),
  });

  const save = async (then?: "published" | "draft" | "retired") => {
    setBusy(true);
    setMsg(null);
    try {
      let id = initial?.id;
      if (id) await apiFetch(`/api/v1/checklists/${id}`, { method: "PUT", json: payload() });
      else id = (await apiFetch<{ id: string }>(`/api/v1/organisations/${orgId}/checklists`, { method: "POST", json: payload() })).id;
      if (then) await apiFetch(`/api/v1/checklists/${id}/status`, { method: "POST", json: { status: then } });
      setMsg({ kind: "ok", text: then === "published" ? "Saved and in use. Supervisors see it next time they open their shift." : then === "retired" ? "Retired. Past records are kept." : "Saved." });
      if (!initial) router.replace(`/setup/checklists/${id}`);
      else router.refresh();
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Card title="About this checklist" aside={<Badge kind={status === "published" ? "ok" : status === "draft" ? "warn" : "neutral"}>{status === "published" ? "In use" : status === "draft" ? "Draft" : "Retired"}</Badge>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={inputClass} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
          <Field label="What it checks" hint="For example Opening checks, Closing checks, Health and safety."><input className={inputClass} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} /></Field>
          <Field label="How often">
            <select className={inputClass} value={meta.cadence} onChange={(e) => setMeta({ ...meta, cadence: e.target.value })}>
              <option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
              <option value="quarterly">Every 3 months</option><option value="six_monthly">Every 6 months</option><option value="as_needed">When needed</option>
            </select>
          </Field>
          <Field label="Done by (time of day)" hint="Leave empty if there is no deadline."><input type="time" className={inputClass} value={meta.due_by} onChange={(e) => setMeta({ ...meta, due_by: e.target.value })} /></Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">Who does it</legend>
            {[["supervisor", "Shop floor supervisor"], ["shop_manager", "Shop manager"], ["area_manager", "Area manager"], ["admin", "Admin"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2"><input type="checkbox" checked={meta.roles.includes(v)} onChange={(e) => setMeta({ ...meta, roles: e.target.checked ? [...meta.roles, v] : meta.roles.filter((r) => r !== v) })} /> {l}</label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">Which stores</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={meta.store_ids.length === 0} onChange={() => setMeta({ ...meta, store_ids: [] })} /> All stores</label>
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={meta.store_ids.includes(s.id)} onChange={(e) => setMeta({ ...meta, store_ids: e.target.checked ? [...meta.store_ids, s.id] : meta.store_ids.filter((x) => x !== s.id) })} /> {s.name}</label>
            ))}
          </fieldset>
        </div>
      </Card>

      {unconfirmed > 0 && <Notice kind="warn">{unconfirmed} number task{unconfirmed === 1 ? " has" : "s have"} no confirmed range yet. They are recorded but never flagged until you set the range and untick &ldquo;not confirmed&rdquo;.</Notice>}

      {items.map((it, k) => (
        <Card key={it.id ?? `new-${k}`} title={`Task ${k + 1}`} aside={
          <span className="flex gap-1">
            <button type="button" aria-label="Move up" className="rounded p-1 hover:bg-brand-light" onClick={() => move(k, -1)}><ArrowUp size={18} /></button>
            <button type="button" aria-label="Move down" className="rounded p-1 hover:bg-brand-light" onClick={() => move(k, 1)}><ArrowDown size={18} /></button>
            <button type="button" aria-label="Remove task" className="rounded p-1 text-bad hover:bg-bad-light" onClick={() => setItems((xs) => xs.filter((_, i) => i !== k))}><Trash2 size={18} /></button>
          </span>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="The task, in the words your staff use"><input className={inputClass} value={it.label} onChange={(e) => upd(k, { label: e.target.value })} /></Field>
            <Field label="Answer"><select className={inputClass} value={it.answer_type} onChange={(e) => upd(k, { answer_type: e.target.value as AnswerType })}>
              {Object.entries(typeText).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></Field>
            <Field label="Extra help (optional)"><input className={inputClass} value={it.help_text} onChange={(e) => upd(k, { help_text: e.target.value })} /></Field>
            <Field label="If there is a problem, how serious" hint="Sets who gets a push alert, under Who gets alerts.">
              <select className={inputClass} value={it.tier} onChange={(e) => upd(k, { tier: e.target.value as Item["tier"] })}>
                <option value="">No alert</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="important">Important</option><option value="be_aware">Be aware</option>
              </select>
            </Field>
            {it.answer_type === "number" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Lowest allowed"><input className={inputClass} inputMode="decimal" disabled={it.range_unconfirmed} value={it.min_value} onChange={(e) => upd(k, { min_value: e.target.value })} /></Field>
                  <Field label="Highest allowed"><input className={inputClass} inputMode="decimal" disabled={it.range_unconfirmed} value={it.max_value} onChange={(e) => upd(k, { max_value: e.target.value })} /></Field>
                  <Field label="Unit"><input className={inputClass} placeholder="°C" value={it.unit} onChange={(e) => upd(k, { unit: e.target.value })} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={it.range_unconfirmed} onChange={(e) => upd(k, { range_unconfirmed: e.target.checked, ...(e.target.checked ? { min_value: "", max_value: "" } : {}) })} /> Range not confirmed yet</label>
              </>
            )}
            {it.answer_type === "date" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Flag when"><select className={inputClass} value={it.date_mode} onChange={(e) => upd(k, { date_mode: e.target.value as Item["date_mode"] })}>
                  <option value="expiry">The date is coming up (expiry, service due)</option><option value="max_age">The date is too long ago (last service)</option>
                </select></Field>
                <Field label="Days"><input className={inputClass} inputMode="numeric" value={it.date_warn_days} onChange={(e) => upd(k, { date_warn_days: e.target.value.replace(/\D/g, "") })} /></Field>
              </div>
            )}
            {it.answer_type === "time" && (
              <Field label="Latest allowed time"><input type="time" className={inputClass} value={it.latest_time} onChange={(e) => upd(k, { latest_time: e.target.value })} /></Field>
            )}
            {it.answer_type !== "photo" && (
              <Field label="Photo">
                <select className={inputClass} value={it.photo_rule} onChange={(e) => upd(k, { photo_rule: e.target.value as Item["photo_rule"] })}>
                  <option value="never">Not needed</option><option value="on_exception">Only when there is a problem</option><option value="always">Every time</option>
                </select>
              </Field>
            )}
          </div>
        </Card>
      ))}

      <Button variant="secondary" onClick={() => setItems((xs) => [...xs, blank()])}>Add a task</Button>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="sticky bottom-16 flex flex-wrap gap-2 bg-background py-2 sm:bottom-0">
        <Button disabled={busy} onClick={() => save()}>Save</Button>
        {status !== "published" && <Button disabled={busy} variant="secondary" onClick={() => save("published")}>Save and put in use</Button>}
        {status === "published" && <Button disabled={busy} variant="secondary" onClick={() => save("draft")}>Take out of use</Button>}
        {initial && status !== "retired" && <Button disabled={busy} variant="ghost" onClick={() => confirm("Retire this checklist? Past records stay.") && save("retired")}>Retire</Button>}
      </div>
      <p className="text-xs text-muted">Changing a checklist never changes records already made: each checklist keeps a copy of the tasks as they were when it was started.</p>
    </div>
  );
}
