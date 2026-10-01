"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

export function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await apiFetch("/api/v1/auth/login", { method: "POST", json: { login, password } });
          window.location.href = "/";
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not sign in.");
          setBusy(false);
        }
      }}
    >
      <Field label="Email or phone number">
        <input className={inputClass} autoComplete="username" inputMode="email" value={login} onChange={(e) => setLogin(e.target.value)} required />
      </Field>
      <Field label="Password">
        <div className="relative">
          <input className={`${inputClass} pr-11`} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-muted" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </Field>
      {error && <Notice kind="bad">{error}</Notice>}
      <Button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Button>
      <p className="text-center text-sm text-muted">Forgot your password? Ask your manager to set a new one.</p>
    </form>
  );
}
