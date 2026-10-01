"use client";

import { useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== again) return setMsg({ kind: "bad", text: "The two new passwords are not the same." });
        setBusy(true);
        try {
          await apiFetch("/api/v1/me/password", { method: "POST", json: { current, next } });
          setMsg({ kind: "ok", text: "Your password is changed." });
          window.location.href = "/";
        } catch (err) {
          setMsg({ kind: "bad", text: err instanceof Error ? err.message : "Could not change it." });
          setBusy(false);
        }
      }}
    >
      <Field label="Current password">
        <input className={inputClass} type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <input className={inputClass} type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
      </Field>
      <Field label="New password again">
        <input className={inputClass} type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show what I typed</label>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Button type="submit" disabled={busy}>Save my new password</Button>
    </form>
  );
}
