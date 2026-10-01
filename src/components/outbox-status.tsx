"use client";

import { useEffect, useState } from "react";
import { Notice } from "./ui";
import { flushOutbox, pendingAnswers } from "@/lib/outbox";

/** Says plainly what is waiting on this phone, and sends it the moment signal returns. */
export function OutboxStatus({ onSent }: { onSent?: () => void }) {
  const [waiting, setWaiting] = useState(0);
  const [report, setReport] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const before = (await pendingAnswers().catch(() => [])).length;
      if (!before) { if (alive) setWaiting(0); return; }
      const r = await flushOutbox();
      if (!alive) return;
      setWaiting(r.stillWaiting);
      if (r.sent) { setReport(`${r.sent} saved answer${r.sent === 1 ? "" : "s"} sent.`); onSent?.(); }
      if (r.failed.length) setFailed(r.failed.map((f) => f.message));
    };
    run();
    window.addEventListener("online", run);
    const t = setInterval(run, 30000);
    return () => { alive = false; window.removeEventListener("online", run); clearInterval(t); };
  }, [onSent]);

  if (!waiting && !report && !failed.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {waiting > 0 && <Notice kind="warn">{waiting} answer{waiting === 1 ? " is" : "s are"} saved on this phone, waiting for signal. Do not clear your browser.</Notice>}
      {report && <Notice kind="ok">{report}</Notice>}
      {failed.length > 0 && <Notice kind="bad">Not accepted by the server: {failed.join("; ")}. Please answer these again.</Notice>}
    </div>
  );
}
