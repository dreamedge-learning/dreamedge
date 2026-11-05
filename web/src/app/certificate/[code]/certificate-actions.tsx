"use client";

import { Check, Link2, Printer, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

function subscribeNever() {
  return () => {};
}

/**
 * Read after hydration only: the server has no navigator, and a label that
 * differs between the server's HTML and the first client render is a
 * hydration error.
 */
function useCanShare(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => typeof navigator.share === "function",
    () => false
  );
}

/**
 * Print, and pass the link on.
 *
 * Printing goes through the browser's own dialog, which also offers "Save as
 * PDF" -- one route to a file on every platform, with no PDF library to keep
 * in step with the page. Sharing uses the phone's share sheet where there is
 * one, because that is how a parent sends it to a grandparent on WhatsApp;
 * a desktop browser gets the link copied instead.
 */
export function CertificateActions({
  url,
  title,
  printable,
}: {
  url: string;
  title: string;
  /** A revoked certificate can be viewed but is not offered for printing. */
  printable: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();

  async function share() {
    if (canShare) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the share sheet is not a failure worth a fallback.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : canShare ? (
          <Share2 className="h-4 w-4" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {copied ? "Link copied" : canShare ? "Share" : "Copy link"}
      </button>
      {printable && (
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
        >
          <Printer className="h-4 w-4" />
          Print or save as PDF
        </button>
      )}
    </div>
  );
}
