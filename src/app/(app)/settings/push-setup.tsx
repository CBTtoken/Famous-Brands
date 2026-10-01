"use client";

import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { apiFetch } from "@/lib/client";

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "checking" | "unsupported" | "needs_install" | "off" | "on" | "blocked";

export function PushSetup({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(ios && !standalone ? "needs_install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  if (!publicKey) return <Notice kind="warn">Alerts are not set up on the server yet. Your admin has been told.</Notice>;

  const turnOn = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        setMsg({ kind: "bad", text: "Alerts were not allowed on this phone." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
      await apiFetch("/api/v1/push/subscriptions", { method: "POST", json: sub.toJSON() });
      setState("on");
      setMsg({ kind: "ok", text: "Alerts are on for this phone. Send a test to be sure." });
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Could not turn alerts on." });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch("/api/v1/push/subscriptions", { method: "DELETE", json: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg({ kind: "info", text: "Alerts are off for this phone." });
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Could not turn alerts off." });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { results } = await apiFetch<{ results: { device: string; ok: boolean; statusCode: number | null; error?: string }[] }>("/api/v1/push/test", { method: "POST" });
      if (!results.length) setMsg({ kind: "bad", text: "No phone has alerts turned on for you yet." });
      else {
        const ok = results.filter((r) => r.ok).length;
        setMsg({
          kind: ok === results.length ? "ok" : "bad",
          text: `Sent to ${ok} of ${results.length} phone${results.length === 1 ? "" : "s"}.${ok < results.length ? " One or more phones did not accept it." : " It should appear within a few seconds."}`,
        });
      }
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Test failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {state === "checking" && <p className="text-muted">Checking this phone...</p>}
      {state === "unsupported" && <Notice kind="warn">This browser cannot receive alerts. On Android use Chrome. On iPhone, add this app to your Home Screen first.</Notice>}
      {state === "needs_install" && (
        <Notice kind="info">
          On iPhone, alerts only work once the app is on your Home Screen. Tap the Share button, then Add to Home Screen, then open S.O.S from there.
        </Notice>
      )}
      {state === "blocked" && <Notice kind="bad">Alerts are blocked for this site in your phone settings. Allow notifications for this site, then come back.</Notice>}
      {state === "off" && (
        <>
          <p>Turn on alerts so you hear about problems the moment they are recorded.</p>
          <Button onClick={turnOn} disabled={busy}>Turn on alerts</Button>
        </>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={test} disabled={busy}>Send me a test alert</Button>
          <Button variant="secondary" onClick={turnOff} disabled={busy}>Turn off on this phone</Button>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
