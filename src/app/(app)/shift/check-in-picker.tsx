"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberedChoices } from "@/components/numbered-choices";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch, getFix, type Fix } from "@/lib/client";

type Store = { id: string; name: string; brand: string | null };
type Result =
  | { status: "checked_in"; visit_id: string }
  | { status: "needs_reason"; store_name: string; checks: { location: string; distance_m: number | null; ip: string } };

export function CheckInPicker({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [storeId, setStoreId] = useState<string | null>(stores.length === 1 ? stores[0].id : null);
  const [phase, setPhase] = useState<"pick" | "locating" | "reason">("pick");
  const [fix, setFix] = useState<Fix>(null);
  const [mismatch, setMismatch] = useState<Extract<Result, { status: "needs_reason" }> | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = async (withReason?: string) => {
    if (!storeId) return;
    setError(null);
    let f = fix;
    if (!withReason) {
      setPhase("locating");
      f = await getFix();
      setFix(f);
    }
    try {
      const r = await apiFetch<Result>("/api/v1/visits", {
        method: "POST",
        json: { store_id: storeId, geo: f, client_time: new Date().toISOString(), reason: withReason },
      });
      if (r.status === "needs_reason") {
        setMismatch(r);
        setPhase("reason");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check in.");
      setPhase(withReason ? "reason" : "pick");
    }
  };

  if (phase === "reason" && mismatch) {
    const why: string[] = [];
    if (mismatch.checks.location === "outside") why.push(`your phone is ${mismatch.checks.distance_m ?? "some"} m from the store`);
    if (mismatch.checks.location === "no_fix") why.push("your phone did not share its location");
    if (mismatch.checks.ip === "mismatch") why.push("you are not on the store's internet");
    return (
      <div className="flex flex-col gap-3">
        <Notice kind="warn">
          We cannot confirm you are at {mismatch.store_name}: {why.join(", and ")}.
        </Notice>
        <Field label="Check in anyway? Say why, in your own words.">
          <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the router is off, I am on my phone data" />
        </Field>
        {error && <Notice kind="bad">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={reason.trim().length < 3} onClick={() => send(reason.trim())}>1. Check in anyway</Button>
          <Button variant="secondary" onClick={() => { setPhase("pick"); setMismatch(null); }}>2. Go back</Button>
        </div>
        <p className="text-xs text-muted">Your manager will see this reason straight away.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <NumberedChoices
        name="Store"
        choices={stores.map((s) => ({ value: s.id, label: s.name, hint: s.brand ?? undefined }))}
        value={storeId}
        onChange={setStoreId}
        disabled={phase === "locating"}
      />
      {error && <Notice kind="bad">{error}</Notice>}
      <Button disabled={!storeId || phase === "locating"} onClick={() => send()}>
        {phase === "locating" ? "Finding your location..." : "Check in"}
      </Button>
      <p className="text-xs text-muted">Checking in records the time and where your phone is. Allow location when your phone asks.</p>
    </div>
  );
}
