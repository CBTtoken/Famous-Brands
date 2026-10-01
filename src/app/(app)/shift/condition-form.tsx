"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { NumberedChoices } from "@/components/numbered-choices";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch, getFix, shrinkPhoto, uploadPhoto } from "@/lib/client";

export type Condition = "fine" | "broken" | "stolen" | "worn";

/** One item's condition: the same screen on a shop walk and for a one-off report. */
export function ConditionForm({
  storeId, storeItemId, walkId, parQty, allowFine = true, submitLabel, onSaved,
}: {
  storeId: string; storeItemId: string; walkId?: string; parQty: number; allowFine?: boolean; submitLabel: string;
  onSaved: (r: { report_id: string; reorder_suggestion_id: string | null }, condition: Condition) => void;
}) {
  const [condition, setCondition] = useState<Condition | null>(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const choices = [
    ...(allowFine ? [{ value: "fine" as const, label: "Fine", tone: "ok" as const }] : []),
    { value: "broken" as const, label: "Broken", tone: "bad" as const },
    { value: "stolen" as const, label: "Stolen or missing", tone: "bad" as const },
    { value: "worn" as const, label: "Worn out", tone: "warn" as const },
  ];
  const needsPhoto = condition === "broken" || condition === "worn";

  const save = async () => {
    if (!condition) return setError("Choose how the item is.");
    if (needsPhoto && !photo) return setError("Take a photo of the item.");
    setBusy(true);
    setError(null);
    try {
      const fix = await getFix(5000);
      let photoId: string | null = null;
      if (photo) photoId = (await uploadPhoto(storeId, photo.blob, fix)).id;
      const r = await apiFetch<{ report_id: string; reorder_suggestion_id: string | null }>("/api/v1/condition-reports", {
        method: "POST",
        json: { store_item_id: storeItemId, condition, qty: condition === "fine" ? 0 : Number(qty) || 1, note: note || null, photo_id: photoId, walk_id: walkId ?? null, geo: fix, client_time: new Date().toISOString() },
      });
      onSaved(r, condition);
      setCondition(null); setQty("1"); setNote(""); setPhoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not saved. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <NumberedChoices name="Condition" choices={choices} value={condition} onChange={setCondition} />
      {condition && condition !== "fine" && (
        <>
          <Field label="How many?" hint={`This shop should have ${parQty}.`}>
            <input className={inputClass} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const b = await shrinkPhoto(f);
                setPhoto({ blob: b, url: URL.createObjectURL(b) });
              }} />
            {photo && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="The item" className="max-h-64 w-full rounded-xl border border-line object-contain" />
                <button type="button" className="absolute right-2 top-2 rounded-full bg-surface p-1" aria-label="Remove photo" onClick={() => setPhoto(null)}><X size={18} /></button>
              </div>
            )}
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Camera size={20} /> {photo ? "Take it again" : needsPhoto ? "Take a photo (needed)" : "Take a photo"}
            </Button>
          </div>
          <Field label="Note">
            <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
          </Field>
        </>
      )}
      {error && <Notice kind="bad">{error}</Notice>}
      <Button type="submit" disabled={busy || !condition}>{busy ? "Saving..." : submitLabel}</Button>
    </form>
  );
}
