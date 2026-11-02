import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import { isMultiSheetExport } from "@/lib/export/access";
import { EXPORT_DATASETS, exportFileStem } from "@/lib/export/datasets";
import {
  buildCsv,
  buildMultiSheetWorkbook,
  buildWorkbook,
} from "@/lib/export/workbook";
import { createClient } from "@/lib/supabase/server";

/**
 * The one way out of the panel for bulk data.
 *
 * Everything an admin can download goes through here, which is what makes the
 * two guarantees below possible to state at all:
 *
 *   - the query runs as the signed-in admin, with the same filters the table
 *     is showing, so an export can never hand back rows the UI would hide;
 *   - every download writes an `audit_log` row. Exporting the student list is
 *     a data-exfiltration event on records about children, and the only
 *     version of that worth having is one that leaves a trace.
 *
 * Node runtime: the workbook writer uses Node streams and Buffer.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const formatSchema = z.enum(["xlsx", "csv"]).default("xlsx");

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset: key } = await params;
  const dataset = Object.prototype.hasOwnProperty.call(EXPORT_DATASETS, key)
    ? EXPORT_DATASETS[key]
    : undefined;

  if (!dataset) {
    return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }

  const url = new URL(request.url);

  const parsedFormat = formatSchema.safeParse(url.searchParams.get("format") ?? undefined);
  if (!parsedFormat.success) {
    return NextResponse.json(
      { error: "Choose either Excel or CSV." },
      { status: 400 }
    );
  }
  const format = parsedFormat.data;

  let admin;
  try {
    admin = await assertAdmin(dataset.requiredRoles);
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "Forbidden";
    return NextResponse.json(
      {
        error: forbidden
          ? "You don't have permission to export this."
          : "Please sign in again.",
      },
      { status: forbidden ? 403 : 401 }
    );
  }

  // A multi-sheet workbook cannot survive the trip to CSV, and writing only
  // its first sheet would hand the admin a file that looks complete and is
  // not. Refuse instead; the button offers Excel alone for these.
  if (format === "csv" && isMultiSheetExport(key)) {
    return NextResponse.json(
      { error: `${dataset.label} has several sheets — export it as Excel.` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const role = admin.adminUser.role_name;

  let loaded;
  try {
    loaded = await dataset.load({ search: url.searchParams, supabase, role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Those filters are not valid." },
        { status: 400 }
      );
    }

    console.error(`[export:${key}] failed to build`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not build the export. Please try again.",
      },
      { status: 500 }
    );
  }

  const primary = loaded.sheets[0];
  const rowCount = loaded.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);

  const body =
    format === "csv"
      ? buildCsv({
          columns: primary.columns,
          rows: primary.rows,
          title: dataset.label,
          filters: loaded.filters,
          generatedBy: admin.adminUser.full_name,
        })
      : isMultiSheetExport(key)
        ? await buildMultiSheetWorkbook({
            title: dataset.label,
            sheets: loaded.sheets,
            filters: loaded.filters,
            generatedBy: admin.adminUser.full_name,
            summary: loaded.summary,
          })
        : await buildWorkbook({
            sheetName: primary.sheetName,
            title: dataset.label,
            columns: primary.columns,
            rows: primary.rows,
            filters: loaded.filters,
            generatedBy: admin.adminUser.full_name,
            summary: loaded.summary,
          });

  // Logged after the file is built, so a failed export does not look like a
  // completed download, and awaited so the row is committed before the
  // response ends and the serverless invocation is frozen.
  const { error: auditError } = await supabase.from("audit_log").insert({
    user_id: admin.adminUser.user_id,
    action: "export",
    entity_type: key,
    metadata: {
      filters: loaded.filters || "none",
      row_count: rowCount,
      format,
      sheets: loaded.sheets.map((sheet) => sheet.sheetName),
    },
  });

  if (auditError) {
    console.error(`[export:${key}] audit row failed`, auditError);
  }

  const fileName = `${exportFileStem(key)}.${format}`;

  // A workbook comes back as a Node Buffer, whose backing store is typed
  // loosely enough (it may be a SharedArrayBuffer) that the Response
  // constructor will not take it. Copying into a plain Uint8Array is the
  // conversion, and it is the only one the web Response type accepts.
  const payload = typeof body === "string" ? body : new Uint8Array(body);

  return new NextResponse(payload, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
