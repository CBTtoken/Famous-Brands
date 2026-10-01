"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch, getFix } from "@/lib/client";

type Store = { id: string; name: string; brand: string | null; address: string | null; latitude: number | null; longitude: number | null; geofence_m: number; known_ips: string[]; checkin_mode: "flag" | "block"; active: boolean; people: number };
type Form = { name: string; brand: string; address: string; latitude: string; longitude: string; geofence_m: string; known_ips: string; checkin_mode: "flag" | "block"; active: boolean };

const empty: Form = { name: "", brand: "", address: "", latitude: "", longitude: "", geofence_m: "150", known_ips: "", checkin_mode: "flag", active: true };
const toForm = (s: Store): Form => ({ name: s.name, brand: s.brand ?? "", address: s.address ?? "", latitude: s.latitude?.toString() ?? "", longitude: s.longitude?.toString() ?? "", geofence_m: String(s.geofence_m), known_ips: s.known_ips.join(", "), checkin_mode: s.checkin_mode, active: s.active });

export function StoresEditor({ orgId, stores, myIp }: { orgId: string; stores: Store[]; myIp: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(stores.length ? null : "new");
  const [f, setF] = useState<Form>(empty);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (s: Store | null) => { setMsg(null); setEditing(s ? s.id : "new"); setF(s ? toForm(s) : empty); };
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        name: f.name, brand: f.brand || null, address: f.address || null,
        latitude: f.latitude ? Number(f.latitude) : null, longitude: f.longitude ? Number(f.longitude) : null,
        geofence_m: Number(f.geofence_m) || 150, known_ips: f.known_ips.split(/[\s,]+/).filter(Boolean), checkin_mode: f.checkin_mode, active: f.active,
      };
      if (editing === "new") await apiFetch(`/api/v1/organisations/${orgId}/stores`, { method: "POST", json: body });
      else await apiFetch(`/api/v1/stores/${editing}`, { method: "PUT", json: body });
      setMsg({ kind: "ok", text: `${f.name} saved.` });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Not saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title="Your stores" aside={<Button variant="secondary" onClick={() => open(null)}>Add a store</Button>}>
        {stores.length === 0 ? <p className="text-muted">No stores yet.</p> : (
          <ul className="divide-y divide-line">
            {stores.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{s.name}</span> {s.brand && <Badge>{s.brand}</Badge>} {!s.active && <Badge kind="warn">Not active</Badge>}
                  <div className="text-xs text-muted">
                    {s.latitude != null ? `Pinned, ${s.geofence_m} m fence` : "Location not set"}. {s.known_ips.length ? `${s.known_ips.length} internet address${s.known_ips.length === 1 ? "" : "es"}` : "Internet address not set"}.{" "}
                    {s.checkin_mode === "block" ? "Blocks check-in that does not match." : "Flags check-in that does not match."} {s.people} {s.people === 1 ? "person" : "people"}.
                  </div>
                </div>
                <Button variant="ghost" onClick={() => open(s)}>Change</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <Card title={editing === "new" ? "Add a store" : `Change ${f.name}`}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Store name"><input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Brand" hint="For example Debonairs, Steers."><input className={inputClass} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
            <Field label="Address"><input className={inputClass} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Field label="Latitude"><input className={inputClass} inputMode="decimal" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} /></Field>
              <Field label="Longitude"><input className={inputClass} inputMode="decimal" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="button" variant="secondary" onClick={async () => {
                const fix = await getFix(10000);
                if (!fix) return setMsg({ kind: "bad", text: "Your phone did not share its location. Allow location and try again." });
                setF({ ...f, latitude: fix.lat.toFixed(6), longitude: fix.lng.toFixed(6) });
                setMsg({ kind: "ok", text: `Location taken, accurate to about ${fix.accuracy_m} m. Do this standing inside the store.` });
              }}>Use where I am standing now</Button>
            </div>
            <Field label="How close counts as at the store (metres)" hint="150 m suits most shops. Malls may need more.">
              <input className={inputClass} inputMode="numeric" value={f.geofence_m} onChange={(e) => setF({ ...f, geofence_m: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="Store internet addresses" hint={<>Separate with commas. {myIp ? <>You are on <button type="button" className="text-brand underline" onClick={() => setF({ ...f, known_ips: [f.known_ips, myIp].filter(Boolean).join(", ") })}>{myIp}</button> right now: tap it to add it if you are on the store&apos;s Wi-Fi.</> : null}</>}>
              <input className={inputClass} value={f.known_ips} onChange={(e) => setF({ ...f, known_ips: e.target.value })} />
            </Field>
            <Field label="When check-in does not match">
              <select className={inputClass} value={f.checkin_mode} onChange={(e) => setF({ ...f, checkin_mode: e.target.value as "flag" | "block" })}>
                <option value="flag">1. Let them in, ask why, alert the manager (recommended)</option>
                <option value="block">2. Do not let them check in</option>
              </select>
            </Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Store is active</label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>Save store</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
