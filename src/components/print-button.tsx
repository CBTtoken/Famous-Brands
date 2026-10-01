"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 font-medium hover:bg-brand-light">
      <Printer size={18} /> Print or save as PDF
    </button>
  );
}
