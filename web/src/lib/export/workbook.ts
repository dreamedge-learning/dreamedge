import ExcelJS from "exceljs";

/**
 * Builds the .xlsx and .csv files the admin panel hands out.
 *
 * Every list in the panel exports through here, which is the point: before
 * this module each table carried its own `escapeCSV` and its own column list,
 * so a fix to one (the formula-injection guard, say) reached only that table.
 *
 * Generation is deliberately server-side. An export has to cover every row
 * the filters match, not the page the admin happens to be looking at, and the
 * fetch for that belongs next to the query the table already runs rather than
 * duplicated in the browser.
 */

/** Brand tokens, in the AARRGGBB form ExcelJS wants. */
const DARK_BLUE = "FF16223B";
const ORANGE = "FFF26A21";
const WHITE = "FFFFFFFF";
const ZEBRA = "FFF7F8FA";
const FOOTER_GRAY = "FF8892A0";
const RULE_GRAY = "FFE2E5EA";

const IST_OFFSET_MINUTES = 330;

export type ExportCellFormat =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "percent"
  | "boolean";

export interface ExportColumn {
  /** Matches the property name the fetcher put on each row. */
  key: string;
  header: string;
  format?: ExportCellFormat;
  /** Characters, not pixels. Overrides the width measured from the content. */
  width?: number;
}

export interface ExportSummaryEntry {
  label: string;
  value: string | number | null;
  format?: ExportCellFormat;
}

export type ExportRow = Record<string, unknown>;

export interface WorkbookSheetSpec {
  /** Tab name. Excel rejects []:*?/\ and anything over 31 characters. */
  sheetName: string;
  /** Dataset label for the banner, e.g. "Students". */
  title: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export interface WorkbookOptions extends WorkbookSheetSpec {
  /** The applied filters, spelled out in words. */
  filters?: string;
  /** Full name of the admin who asked for the file. */
  generatedBy?: string;
  summary?: ExportSummaryEntry[];
}

export interface MultiSheetWorkbookOptions {
  /** Banner title shared by every sheet, e.g. "Full student export". */
  title: string;
  sheets: WorkbookSheetSpec[];
  filters?: string;
  generatedBy?: string;
  summary?: ExportSummaryEntry[];
}

const NUMBER_FORMATS: Record<ExportCellFormat, string | undefined> = {
  text: undefined,
  boolean: undefined,
  number: "#,##0",
  currency: '"₹"#,##0.00',
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
  percent: "0.0%",
};

const RIGHT_ALIGNED: ExportCellFormat[] = ["number", "currency", "percent"];

/**
 * Neutralises a value that a spreadsheet would read as a formula.
 *
 * A cell beginning with =, +, - or @ is a live formula, so a student whose
 * name or remark starts with one of those turns into executable content in
 * the reader's spreadsheet. Prefixing an apostrophe pins it as text.
 *
 * Applied to xlsx as well as csv. An inline string in a sheet is not itself
 * evaluated, but exports get re-saved as CSV and pasted between files, and a
 * guard that only covers one of the two formats is the guard nobody can rely
 * on.
 */
function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One escapeCSV, shared by every export in the panel. */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = guardFormula(formatForCsv(value));

  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function formatForCsv(value: unknown): string {
  if (value instanceof Date) return formatIstTimestamp(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Shifts a timestamp so Excel's wall clock reads as IST.
 *
 * Excel stores a date as a serial number with no zone, and ExcelJS derives
 * that serial from UTC. Writing the instant unchanged therefore shows an
 * admin in Kalmeshwar a time five and a half hours behind the one the panel
 * showed them. Shifting the instant before it is written makes the sheet
 * agree with the screen; nothing downstream treats these cells as instants.
 */
function toIstWallClock(value: Date): Date {
  return new Date(value.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** "02-Nov-2026, 6:40 pm IST" — the footer and CSV timestamp form. */
export function formatIstTimestamp(value: Date): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);

  return `${formatted} IST`;
}

/** The value as ExcelJS should store it, given the column's declared format. */
function cellValue(raw: unknown, format: ExportCellFormat): ExcelJS.CellValue {
  if (raw === null || raw === undefined || raw === "") return null;

  switch (format) {
    case "date":
    case "datetime": {
      const parsed = parseDate(raw);
      return parsed ? toIstWallClock(parsed) : guardFormula(String(raw));
    }
    case "number":
    case "currency":
    case "percent": {
      const parsed = parseNumber(raw);
      return parsed ?? guardFormula(String(raw));
    }
    case "boolean":
      return raw ? "Yes" : "No";
    default:
      return guardFormula(String(raw));
  }
}

/** Characters wide enough for the header and the longest value it covers. */
function measureWidth(column: ExportColumn, rows: ExportRow[]): number {
  if (column.width) return column.width;

  let widest = column.header.length;

  for (const row of rows) {
    const raw = row[column.key];
    if (raw === null || raw === undefined) continue;

    const text =
      column.format === "date"
        ? "dd-mmm-yyyy"
        : column.format === "datetime"
          ? "dd-mmm-yyyy hh:mm"
          : String(raw);

    if (text.length > widest) widest = text.length;
  }

  return Math.min(Math.max(widest + 3, 11), 48);
}

function writeBanner(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
  title: string,
  filters: string | undefined
): number {
  const span = Math.max(columnCount, 1);

  const brand = sheet.addRow([`Dream Edge — ${title}`]);
  sheet.mergeCells(brand.number, 1, brand.number, span);
  brand.height = 26;
  brand.getCell(1).font = { bold: true, size: 14, color: { argb: WHITE } };
  brand.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: DARK_BLUE },
  };
  brand.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

  const filterRow = sheet.addRow([filters?.trim() || "No filters applied"]);
  sheet.mergeCells(filterRow.number, 1, filterRow.number, span);
  filterRow.height = 18;
  filterRow.getCell(1).font = { size: 10, italic: true, color: { argb: ORANGE } };
  filterRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

  sheet.addRow([]);

  return filterRow.number + 1;
}

function writeFooter(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
  rowCount: number,
  generatedBy: string | undefined
): void {
  sheet.addRow([]);

  const parts = [
    `Generated ${formatIstTimestamp(new Date())}`,
    generatedBy ? `by ${generatedBy}` : null,
    `${rowCount} ${rowCount === 1 ? "row" : "rows"}`,
  ].filter(Boolean);

  const footer = sheet.addRow([parts.join("  ·  ")]);
  sheet.mergeCells(footer.number, 1, footer.number, Math.max(columnCount, 1));
  footer.getCell(1).font = { size: 9, color: { argb: FOOTER_GRAY } };
  footer.getCell(1).border = {
    top: { style: "thin", color: { argb: RULE_GRAY } },
  };
}

function writeSheet(
  workbook: ExcelJS.Workbook,
  spec: WorkbookSheetSpec,
  filters: string | undefined,
  generatedBy: string | undefined
): void {
  const { columns, rows } = spec;
  const sheet = workbook.addWorksheet(safeSheetName(spec.sheetName));

  sheet.columns = columns.map((column) => ({
    key: column.key,
    width: measureWidth(column, rows),
  }));

  writeBanner(sheet, columns.length, spec.title, filters);

  const header = sheet.addRow(columns.map((column) => column.header));
  header.height = 20;
  header.eachCell((cell, index) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BLUE } };
    cell.alignment = {
      vertical: "middle",
      horizontal: RIGHT_ALIGNED.includes(columns[index - 1]?.format ?? "text")
        ? "right"
        : "left",
    };
  });

  // Freezing below the header keeps the column names on screen while an admin
  // scrolls a few thousand students; the autofilter needs the same row.
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: Math.max(columns.length, 1) },
  };

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.addRow(
      columns.map((column) => cellValue(row[column.key], column.format ?? "text"))
    );

    excelRow.eachCell({ includeEmpty: true }, (cell, index) => {
      const format = columns[index - 1]?.format ?? "text";
      const numberFormat = NUMBER_FORMATS[format];

      if (numberFormat) cell.numFmt = numberFormat;

      cell.alignment = {
        vertical: "middle",
        horizontal: RIGHT_ALIGNED.includes(format) ? "right" : "left",
        wrapText: false,
      };

      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
  });

  if (rows.length === 0) {
    const empty = sheet.addRow(["No rows matched these filters."]);
    sheet.mergeCells(empty.number, 1, empty.number, Math.max(columns.length, 1));
    empty.getCell(1).font = { italic: true, color: { argb: FOOTER_GRAY } };
  }

  writeFooter(sheet, columns.length, rows.length, generatedBy);
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  title: string,
  entries: ExportSummaryEntry[],
  filters: string | undefined,
  generatedBy: string | undefined
): void {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { key: "label", width: 34 },
    { key: "value", width: 22 },
  ];

  writeBanner(sheet, 2, title, filters);

  const header = sheet.addRow(["Measure", "Value"]);
  header.height = 20;
  header.eachCell((cell, index) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BLUE } };
    cell.alignment = { vertical: "middle", horizontal: index === 2 ? "right" : "left" };
  });

  entries.forEach((entry, index) => {
    const format = entry.format ?? "text";
    const row = sheet.addRow([entry.label, cellValue(entry.value, format)]);
    const numberFormat = NUMBER_FORMATS[format];

    if (numberFormat) row.getCell(2).numFmt = numberFormat;
    row.getCell(2).alignment = {
      horizontal: RIGHT_ALIGNED.includes(format) ? "right" : "left",
    };

    if (index % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    }
  });

  writeFooter(sheet, 2, entries.length, generatedBy);
}

/** Excel's own restrictions on a tab name, applied so a long label can't throw. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function newWorkbook(generatedBy: string | undefined): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = generatedBy ? `Dream Edge — ${generatedBy}` : "Dream Edge";
  workbook.created = new Date();
  return workbook;
}

export async function buildWorkbook(options: WorkbookOptions): Promise<Buffer> {
  const workbook = newWorkbook(options.generatedBy);

  if (options.summary && options.summary.length > 0) {
    writeSummarySheet(
      workbook,
      options.title,
      options.summary,
      options.filters,
      options.generatedBy
    );
  }

  writeSheet(workbook, options, options.filters, options.generatedBy);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** One workbook, several sheets — the full student export joins on student id. */
export async function buildMultiSheetWorkbook(
  options: MultiSheetWorkbookOptions
): Promise<Buffer> {
  const workbook = newWorkbook(options.generatedBy);

  if (options.summary && options.summary.length > 0) {
    writeSummarySheet(
      workbook,
      options.title,
      options.summary,
      options.filters,
      options.generatedBy
    );
  }

  for (const sheet of options.sheets) {
    writeSheet(workbook, sheet, options.filters, options.generatedBy);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * The CSV form of the same data.
 *
 * Kept so the existing "Export CSV" choice survives the move to xlsx — an
 * admin feeding the file to another tool wants the plain text, and a byte
 * order mark is what makes Excel open a UTF-8 CSV without mangling ₹ and
 * Devanagari names.
 */
export function buildCsv(options: {
  columns: ExportColumn[];
  rows: ExportRow[];
  title?: string;
  filters?: string;
  generatedBy?: string;
}): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(escapeCsvValue(`Dream Edge — ${options.title}`));
    lines.push(escapeCsvValue(options.filters?.trim() || "No filters applied"));
    lines.push("");
  }

  lines.push(options.columns.map((column) => escapeCsvValue(column.header)).join(","));

  for (const row of options.rows) {
    lines.push(
      options.columns
        .map((column) => escapeCsvValue(csvCell(row[column.key], column.format ?? "text")))
        .join(",")
    );
  }

  lines.push("");
  lines.push(
    escapeCsvValue(
      [
        `Generated ${formatIstTimestamp(new Date())}`,
        options.generatedBy ? `by ${options.generatedBy}` : null,
        `${options.rows.length} ${options.rows.length === 1 ? "row" : "rows"}`,
      ]
        .filter(Boolean)
        .join("  ·  ")
    )
  );

  return `﻿${lines.join("\r\n")}`;
}

/** Dates reach CSV as readable IST text; numbers stay unformatted for re-parsing. */
function csvCell(raw: unknown, format: ExportCellFormat): unknown {
  if (raw === null || raw === undefined) return "";

  if (format === "date" || format === "datetime") {
    const parsed = parseDate(raw);
    if (!parsed) return raw;
    return format === "date"
      ? new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(parsed)
      : formatIstTimestamp(parsed);
  }

  if (format === "boolean") return raw ? "Yes" : "No";

  return raw;
}
