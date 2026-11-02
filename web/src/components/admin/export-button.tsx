"use client";

import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAdminRole } from "@/components/admin/admin-role-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canExport, isMultiSheetExport } from "@/lib/export/access";

/**
 * The panel's one download control.
 *
 * It hands the route the same filters the list is showing, so the file covers
 * what the admin is looking at rather than the page they happen to be on, and
 * it fetches rather than following a plain link: a link that fails leaves the
 * admin staring at a page of JSON, where a fetch can put the reason in a
 * toast and leave them on the list.
 */

export type ExportFilters = Record<
  string,
  string | number | boolean | null | undefined
>;

interface ExportButtonProps {
  /** Key in the export registry, e.g. `students`. */
  dataset: string;
  /** The list's live filter state. Blank and "all" values are dropped. */
  filters?: ExportFilters;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
}

function buildQuery(filters: ExportFilters | undefined, format: string): string {
  const params = new URLSearchParams({ format });

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null) continue;

    const text = String(value).trim();
    if (text.length === 0 || text === "all") continue;

    params.set(key, text);
  }

  return params.toString();
}

/** The server names the file; this is only the fallback if the header is absent. */
function fileNameFrom(disposition: string | null, dataset: string, format: string): string {
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? `dream-edge-${dataset}.${format}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // A non-JSON body means the failure happened before the route ran.
  }

  return "Could not generate the export. Please try again.";
}

export function ExportButton({
  dataset,
  filters,
  label = "Export",
  size = "sm",
  variant = "outline",
}: ExportButtonProps) {
  const role = useAdminRole();
  const [busy, setBusy] = useState<string | null>(null);

  if (!canExport(role, dataset)) return null;

  const excelOnly = isMultiSheetExport(dataset);

  const download = async (format: "xlsx" | "csv") => {
    setBusy(format);

    try {
      const response = await fetch(
        `/api/admin/export/${dataset}?${buildQuery(filters, format)}`
      );

      if (!response.ok) {
        toast.error(await readError(response));
        return;
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = href;
      link.download = fileNameFrom(
        response.headers.get("Content-Disposition"),
        dataset,
        format
      );
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Revoked on a delay: Safari starts reading the blob after the click
      // returns, and tearing the URL down synchronously cancels the download.
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const busyIcon = <Loader2 className="h-4 w-4 animate-spin" />;

  if (excelOnly) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled={busy !== null}
        onClick={() => void download("xlsx")}
        aria-label={`${label} as Excel`}
      >
        {busy ? busyIcon : <Download className="h-4 w-4" />}
        <span className="ml-1.5">{busy ? "Preparing…" : label}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={variant} size={size} disabled={busy !== null} />}
      >
        {busy ? busyIcon : <Download className="h-4 w-4" />}
        <span className="mx-1.5">{busy ? "Preparing…" : label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void download("xlsx")}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void download("csv")}>
          <FileText className="h-4 w-4 mr-2" />
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
