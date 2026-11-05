"use client";

import { Printer } from "lucide-react";

/** The browser's own print dialog, which also offers "Save as PDF". */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
    >
      <Printer className="h-4 w-4" />
      Print or save as PDF
    </button>
  );
}
