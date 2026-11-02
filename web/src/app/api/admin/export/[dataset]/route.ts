import { PassThrough, Readable } from "node:stream";

import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import { isMultiSheetExport } from "@/lib/export/access";
import { EXPORT_DATASETS, exportFileStem } from "@/lib/export/datasets";
import {
  buildCsv,
  streamMultiSheetWorkbook,
  streamWorkbook,
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

// Explicit wall for Vercel. Hobby's hard cap is 60 s and defaults to 10 s;
// Pro honours up to 300 s. A full progress export walks student_progress
// through 50 windows of 1000 rows plus a few seconds for ExcelJS to lay
// them out, so 10 s is not enough and the default was closing the door
// mid-serialisation. Set to Hobby's ceiling here; a Pro deployment can
// override through its own layout file if more is actually needed.
export const maxDuration = 60;

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

  // Logged before the body is handed off, so an export that never finishes
  // streaming still leaves one row recording that the rows were read. The
  // alternative (log after `write` resolves) hid an abandoned download from
  // the audit log and would hide a hijacked session that drops the TLS
  // channel the moment it has the rows.
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
    // Records about children: fail closed on the audit row. A download
    // without one is a data-exfiltration event this panel cannot see,
    // which is the whole thing the audit log existed to prevent.
    console.error(`[export:${key}] audit row failed`, auditError);
    return NextResponse.json(
      { error: "Could not record the export. Please try again." },
      { status: 500 }
    );
  }

  const fileName = `${exportFileStem(key)}.${format}`;

  if (format === "csv") {
    const csv = buildCsv({
      columns: primary.columns,
      rows: primary.rows,
      title: dataset.label,
      filters: loaded.filters,
      generatedBy: admin.adminUser.full_name,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // The .xlsx path. ExcelJS serialises straight into the response body,
  // which saves a full in-memory copy of the workbook and gets the
  // download bar moving before serialisation finishes.
  const pass = new PassThrough();

  const writer = isMultiSheetExport(key)
    ? streamMultiSheetWorkbook(
        {
          title: dataset.label,
          sheets: loaded.sheets,
          filters: loaded.filters,
          generatedBy: admin.adminUser.full_name,
          summary: loaded.summary,
        },
        pass
      )
    : streamWorkbook(
        {
          sheetName: primary.sheetName,
          title: dataset.label,
          columns: primary.columns,
          rows: primary.rows,
          filters: loaded.filters,
          generatedBy: admin.adminUser.full_name,
          summary: loaded.summary,
        },
        pass
      );

  // Any failure after the response starts has to tear down the stream so the
  // client sees a truncated download instead of a complete-looking one. The
  // caller cannot see this error through the normal response path, so it is
  // logged as well.
  writer.catch((error) => {
    console.error(`[export:${key}] stream failed mid-serialisation`, error);
    pass.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  const webStream = Readable.toWeb(pass) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
