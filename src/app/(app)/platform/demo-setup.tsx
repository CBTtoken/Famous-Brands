"use client";

import { useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client";

type Login = { full_name: string; role: string; email: string };

/**
 * One button for the platform admin: a clearly labelled demo shop group for
 * showing the POC before the pilot shop is known.
 */
export function DemoSetup({ existing, logins }: { existing: { id: string; name: string } | null; logins: Login[] }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ orgId: string; items: number; checklists: { demo: string; drafts: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (id: string) => {
    await apiFetch("/api/v1/session/org", { method: "POST", json: { org_id: id } });
    window.location.assign("/setup");
  };

  if (existing || made) {
    return (
      <div className="flex flex-col gap-3">
        {made && (
          <Notice kind="ok">
            {`Demo group made. It has one demo shop, ${made.items} items on its list, the checklist "${made.checklists.demo}" ready to use, ` +
              `and ${made.checklists.drafts} draft checklists from the client's task list.`}
          </Notice>
        )}
        <p className="text-sm">Demo sign-ins. They all use the demo password you chose.</p>
        <ul className="flex flex-col gap-1 text-sm">
          {logins.map((l) => (
            <li key={l.email} className="rounded-lg border border-line px-3 py-2">
              <span className="font-medium">{l.full_name}</span> <span className="text-muted">({l.role.replace("_", " ")})</span>
              <br /><span className="font-mono">{l.email}</span>
            </li>
          ))}
        </ul>
        <div><Button variant="secondary" onClick={() => open(existing?.id ?? made!.orgId)}>Work in the demo group</Button></div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setMade(await apiFetch("/api/v1/platform/demo", { method: "POST", json: { password } }));
        } catch (err) {
          setError(err instanceof Error ? err.message : "The demo group was not made. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-muted">
        Makes a demo shop group for showing the app before the pilot shop is known. Every name in it says DEMO, and a banner shows on every screen
        inside it. It starts with no visits, answers or figures: everything you see comes from what testers do.
      </p>
      <Field label="Demo password" hint={password ? `You typed: ${password}. All four demo sign-ins will use it.` : "At least 12 characters. All four demo sign-ins share it."}>
        <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" spellCheck={false} minLength={12} required />
      </Field>
      <div><Button disabled={busy || password.length < 12}>{busy ? "Making the demo group..." : "Make the demo group"}</Button></div>
      {error && <Notice kind="bad">{error}</Notice>}
    </form>
  );
}
