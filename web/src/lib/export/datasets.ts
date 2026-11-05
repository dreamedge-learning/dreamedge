import { z } from "zod";

import type { AdminRole } from "@/lib/auth-guard";
import {
  CERTIFICATE_STATUS_LABELS,
  certificateUrl,
  type CertificateStatus,
} from "@/lib/certificates";
import { rangeEnd, rangeStart } from "@/lib/date-range";
import {
  getDashboardKpis,
  getEnrollmentTrend,
  getRevenueTrend,
  getTopCourses,
} from "@/lib/dashboard";
import { sanitizeSearch } from "@/lib/search";
import {
  isSyntheticEmail,
  registrationSourceLabel,
} from "@/lib/students/identity";
import type { createClient } from "@/lib/supabase/server";
import {
  contentStatusSchema,
  contentTypeSchema,
  difficultyLevelSchema,
  liveClassStatusSchema,
  notificationChannelSchema,
  questionTypeSchema,
} from "@/lib/validations/db-enums";
import { orderFilterSchema, refundFilterSchema } from "@/lib/validations/revenue";
import {
  leadListFilterSchema,
  studentListFilterSchema,
} from "@/lib/validations/student";
import { CONTACT_ROLES, EXPORT_ROLES } from "./access";
import { fetchAllRows } from "./fetch-all";
import type {
  ExportColumn,
  ExportRow,
  ExportSummaryEntry,
  WorkbookSheetSpec,
} from "./workbook";

/**
 * Every export the admin panel offers, in one place.
 *
 * Adding a list to the export menu should be one entry here — a label, the
 * roles allowed to run it, the columns, and the query. Before this registry
 * each export was its own component with its own column list and its own
 * notion of which admin could see what, which is how the student CSV ended up
 * silently truncated at a thousand rows without anyone noticing.
 *
 * Two rules the registry enforces for every dataset:
 *
 *   - the query runs through the signed-in admin's own client, so RLS applies
 *     and an export can never return rows the panel would not show them;
 *   - columns carrying a minor's personal details are declared `sensitive` and
 *     dropped outright for any role but super admin and support staff. Dropped,
 *     not blanked: a blank column still tells the reader the field exists and
 *     invites a request for "the full version".
 */

type AdminClient = Awaited<ReturnType<typeof createClient>>;

export interface LoadedExport {
  /** The applied filters, spelled out for the banner row. */
  filters: string;
  sheets: WorkbookSheetSpec[];
  summary?: ExportSummaryEntry[];
}

export interface ExportDataset {
  label: string;
  requiredRoles: AdminRole[];
  /** Column keys withheld from roles outside `CONTACT_ROLES`. */
  sensitiveKeys: string[];
  columns: ExportColumn[];
  load: (context: {
    search: URLSearchParams;
    supabase: AdminClient;
    role: AdminRole;
  }) => Promise<LoadedExport>;
}

interface DatasetSpec<S extends z.ZodType> {
  label: string;
  requiredRoles: AdminRole[];
  sensitiveKeys?: string[];
  columns: ExportColumn[];
  filters: S;
  describe?: (filters: z.output<S>, supabase: AdminClient) => Promise<string>;
  fetcher: (filters: z.output<S>, supabase: AdminClient) => Promise<ExportRow[]>;
  summary?: (rows: ExportRow[], filters: z.output<S>) => ExportSummaryEntry[];
  /** Sheets that follow the primary one, for the multi-sheet exports. */
  extraSheets?: (context: {
    rows: ExportRow[];
    filters: z.output<S>;
    supabase: AdminClient;
    hidden: Set<string>;
  }) => Promise<WorkbookSheetSpec[]>;
}

function defineDataset<S extends z.ZodType>(spec: DatasetSpec<S>): ExportDataset {
  const sensitiveKeys = spec.sensitiveKeys ?? [];

  return {
    label: spec.label,
    requiredRoles: spec.requiredRoles,
    sensitiveKeys,
    columns: spec.columns,
    async load({ search, supabase, role }) {
      const filters = spec.filters.parse(searchParamsToObject(search)) as z.output<S>;
      const hidden = new Set(CONTACT_ROLES.includes(role) ? [] : sensitiveKeys);
      const columns = spec.columns.filter((column) => !hidden.has(column.key));

      const rows = await spec.fetcher(filters, supabase);

      const sheets: WorkbookSheetSpec[] = [
        { sheetName: spec.label, title: spec.label, columns, rows },
      ];

      if (spec.extraSheets) {
        sheets.push(...(await spec.extraSheets({ rows, filters, supabase, hidden })));
      }

      return {
        filters: spec.describe ? await spec.describe(filters, supabase) : "",
        sheets,
        summary: spec.summary?.(rows, filters),
      };
    },
  };
}

/**
 * Query string to plain object.
 *
 * Blank values are dropped so an untouched filter input (`?city=`) reads as
 * "not filtered" rather than "city equal to the empty string", which is what
 * the table itself does when it builds its query.
 */
function searchParamsToObject(search: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of search.entries()) {
    const trimmed = value.trim();
    if (trimmed.length > 0) result[key] = trimmed;
  }

  delete result.format;

  return result;
}

// ---------------------------------------------------------------------------
// Shared filter pieces
// ---------------------------------------------------------------------------

const searchFilter = z.string().max(120, "Search term is too long.").optional();
const dateFilter = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Date filter is invalid.")
  .optional();

const dateRangeFilters = { dateFrom: dateFilter, dateTo: dateFilter };

const allOr = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal("all"), schema]).optional();

/** A filter value that actually narrows the result set. */
function isApplied(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && value !== "all";
}

function describeParts(parts: Array<[string, unknown]>): string {
  return parts
    .filter(([, value]) => isApplied(value))
    .map(([label, value]) => `${label}: ${String(value)}`)
    .join(", ");
}

/** Course filters arrive as a uuid; the banner needs the title. */
async function courseLabel(
  supabase: AdminClient,
  courseId: string | undefined
): Promise<string | undefined> {
  if (!isApplied(courseId)) return undefined;

  const { data } = await supabase
    .from("courses")
    .select("title")
    .eq("id", courseId as string)
    .maybeSingle();

  return data?.title ?? "unknown course";
}

/** Audit-log filters arrive as an auth user id; the banner needs the name. */
async function adminLabel(
  supabase: AdminClient,
  userId: string | undefined
): Promise<string | undefined> {
  if (!isApplied(userId)) return undefined;

  const { data } = await supabase
    .from("admin_users")
    .select("full_name")
    .eq("user_id", userId as string)
    .maybeSingle();

  return data?.full_name ?? "unknown admin";
}

function describeDates(filters: { dateFrom?: string; dateTo?: string }): Array<[string, unknown]> {
  return [
    ["from", filters.dateFrom ? formatFilterDate(filters.dateFrom) : undefined],
    ["to", filters.dateTo ? formatFilterDate(filters.dateTo) : undefined],
  ];
}

function formatFilterDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

// ---------------------------------------------------------------------------
// Embedded-row helpers
// ---------------------------------------------------------------------------

/**
 * PostgREST returns an embedded parent as an object or a single-element array
 * depending on how it resolves the relationship, and the generated types are
 * not always on the same side of that. Reading it through here keeps the
 * fetchers from caring which shape arrived.
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const studentExportFilters = studentListFilterSchema
  .omit({ page: true, pageSize: true })
  .extend({
    search: searchFilter,
    city: z.string().max(80, "City filter is too long.").optional(),
    ...dateRangeFilters,
  });

type StudentExportFilters = z.output<typeof studentExportFilters>;

const STUDENT_COLUMNS: ExportColumn[] = [
  { key: "student_code", header: "Student code" },
  { key: "full_name", header: "Name" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "date_of_birth", header: "Date of birth", format: "date" },
  { key: "gender", header: "Gender" },
  { key: "class", header: "Class" },
  { key: "board", header: "Board" },
  { key: "school_name", header: "School" },
  { key: "parent_name", header: "Parent or guardian" },
  { key: "parent_phone", header: "Parent phone" },
  { key: "city", header: "City" },
  { key: "state", header: "State" },
  { key: "pincode", header: "PIN code" },
  { key: "address_line", header: "Address" },
  { key: "status", header: "Status" },
  { key: "registered_via", header: "Registered via" },
  { key: "profile_completed", header: "Profile complete", format: "boolean" },
  { key: "enrollment_count", header: "Courses", format: "number" },
  { key: "referral_code", header: "Referral code" },
  { key: "created_at", header: "Joined", format: "date" },
];

/*
 * Personal details about a minor, dropped for any role but super admin and
 * support staff. The parent's name and number are in here for the same reason
 * the student's are: between them they identify a child and say where to
 * reach them.
 */
const STUDENT_SENSITIVE_KEYS = [
  "email",
  "phone",
  "parent_name",
  "parent_phone",
  "date_of_birth",
  "address_line",
];

interface StudentQueryRow {
  id: string;
  student_code: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  class: string | null;
  board: string | null;
  school_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address_line: string | null;
  status: string;
  registration_source: string;
  profile_completed: boolean;
  referral_code: string | null;
  created_at: string | null;
  enrollments: { id: string }[] | null;
}

/**
 * Student rows matching the list's own filters.
 *
 * The course filter resolves to a set of student ids first, the same way the
 * table does it, because `enrollments` is a many-to-one embed and filtering on
 * an embedded table would drop students rather than narrow them.
 */
async function fetchStudentRows(
  filters: StudentExportFilters,
  supabase: AdminClient
): Promise<StudentQueryRow[]> {
  let enrolledIds: string[] | null = null;

  if (isApplied(filters.courseId)) {
    // Stable order: fetchAllRows walks pages by range(from, to), and
    // unordered pages are not stable -- Postgres is free to return the
    // same window in a different order each call, so a course with more
    // than one window of enrolments could drop or duplicate student ids
    // between pages. `id` is a uuid, so this gives a snapshot ordering.
    const enrolled = await fetchAllRows("enrolment", (from, to) =>
      supabase
        .from("enrollments")
        .select("student_id", { count: "exact" })
        .eq("course_id", filters.courseId as string)
        .order("id", { ascending: true })
        .range(from, to)
    );

    enrolledIds = Array.from(new Set(enrolled.map((row) => row.student_id)));
    if (enrolledIds.length === 0) return [];
  }

  return fetchAllRows<StudentQueryRow>("student", (from, to) => {
    let query = supabase
      .from("students")
      .select(
        `id, student_code, full_name, email, phone, date_of_birth, gender, class,
         board, school_name, parent_name, parent_phone, city, state, pincode,
         address_line, status, registration_source, profile_completed,
         referral_code, created_at, enrollments(id)`,
        { count: "exact" }
      );

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe.length > 0) {
        query = query.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
        );
      }
    }

    if (isApplied(filters.status)) {
      query = query.eq("status", filters.status as "active" | "inactive" | "blocked");
    }

    if (isApplied(filters.source)) {
      query = query.eq("registration_source", filters.source as string);
    }

    if (filters.city) {
      const safeCity = sanitizeSearch(filters.city);
      if (safeCity.length > 0) query = query.ilike("city", `%${safeCity}%`);
    }

    if (filters.dateFrom) query = query.gte("created_at", rangeStart(filters.dateFrom));
    if (filters.dateTo) query = query.lte("created_at", rangeEnd(filters.dateTo));
    if (enrolledIds) query = query.in("id", enrolledIds);

    // `created_at` is not unique and new registrations keep arriving while
    // the walk runs, so a tiebreaker on `id` keeps pages aligned -- without
    // it two rows sharing a second could flip order between pages and the
    // range() split would drop one and duplicate the other.
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
  });
}

function toStudentExportRow(row: StudentQueryRow): ExportRow {
  return {
    id: row.id,
    student_code: row.student_code,
    full_name: row.full_name,
    // A synthetic address is one we invented for a student who has none; it
    // would read as a real contact in a spreadsheet nobody can interrogate.
    email: isSyntheticEmail(row.email) ? null : row.email,
    phone: row.phone,
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    class: row.class,
    board: row.board === "State" ? "State Board" : row.board,
    school_name: row.school_name,
    parent_name: row.parent_name,
    parent_phone: row.parent_phone,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    address_line: row.address_line,
    status: row.status,
    registered_via: registrationSourceLabel(row.registration_source),
    profile_completed: row.profile_completed,
    enrollment_count: count(row.enrollments),
    referral_code: row.referral_code,
    created_at: row.created_at,
  };
}

async function describeStudentFilters(
  filters: StudentExportFilters,
  supabase: AdminClient
): Promise<string> {
  return describeParts([
    ["search", filters.search],
    ["status", filters.status],
    ["registered via", isApplied(filters.source) ? registrationSourceLabel(filters.source) : undefined],
    ["city", filters.city],
    ["course", await courseLabel(supabase, filters.courseId)],
    ...describeDates(filters),
  ]);
}

/**
 * The students an export covers, as ids, so the companion sheets of the full
 * export can be narrowed to the same people.
 *
 * The earlier shape dropped the `.in()` filter above 200 ids and read every
 * row in the companion table, then filtered in memory. For an export of 250
 * students that meant reading every enrolment, order and progress row on the
 * platform; past a few thousand students it timed out while the admin was
 * still waiting on a sheet that was supposed to be about their 300 people.
 *
 * `.in()` on an id list of a few thousand uuids is well below the PostgREST
 * URL cap, so page the ids in `CHUNK_SIZE` groups and concatenate the
 * results. The ceiling here is chosen for the URL budget, not the server.
 */
const STUDENT_ID_CHUNK = 200;

async function rowsForStudents<T extends { student_id: string }>(
  label: string,
  studentIds: string[],
  query: (from: number, to: number, ids: string[] | null) => PromiseLike<{
    data: T[] | null;
    count: number | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  if (studentIds.length === 0) return [];

  const unique = Array.from(new Set(studentIds));
  const out: T[] = [];

  for (let i = 0; i < unique.length; i += STUDENT_ID_CHUNK) {
    const chunk = unique.slice(i, i + STUDENT_ID_CHUNK);
    const rows = await fetchAllRows<T>(label, (from, to) =>
      query(from, to, chunk)
    );
    out.push(...rows);
  }

  return out;
}

const studentsDataset = defineDataset({
  label: "Students",
  requiredRoles: EXPORT_ROLES.students,
  sensitiveKeys: STUDENT_SENSITIVE_KEYS,
  columns: STUDENT_COLUMNS,
  filters: studentExportFilters,
  describe: describeStudentFilters,
  async fetcher(filters, supabase) {
    const rows = await fetchStudentRows(filters, supabase);
    return rows.map(toStudentExportRow);
  },
  summary(rows) {
    const byStatus = (status: string) => rows.filter((row) => row.status === status).length;
    const byVia = (label: string) =>
      rows.filter((row) => row.registered_via === label).length;

    return [
      { label: "Students", value: rows.length, format: "number" },
      { label: "Active", value: byStatus("active"), format: "number" },
      { label: "Inactive", value: byStatus("inactive"), format: "number" },
      { label: "Blocked", value: byStatus("blocked"), format: "number" },
      { label: "Registered online", value: byVia("Online"), format: "number" },
      {
        label: "Registered at the centre",
        value: byVia("Offline centre"),
        format: "number",
      },
      {
        label: "Profile not finished",
        value: rows.filter((row) => row.profile_completed === false).length,
        format: "number",
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Full student export — one workbook Rahul Sir can open and filter
// ---------------------------------------------------------------------------

const ENROLLMENT_SHEET_COLUMNS: ExportColumn[] = [
  { key: "student_code", header: "Student code" },
  { key: "student_name", header: "Student" },
  { key: "email", header: "Email" },
  { key: "course", header: "Course" },
  { key: "status", header: "Status" },
  { key: "purchased_at", header: "Purchased", format: "date" },
  { key: "valid_until", header: "Valid until", format: "date" },
  { key: "payment_amount", header: "Paid", format: "currency" },
  { key: "payment_method", header: "Method" },
];

const PAYMENT_SHEET_COLUMNS: ExportColumn[] = [
  { key: "student_code", header: "Student code" },
  { key: "student_name", header: "Student" },
  { key: "email", header: "Email" },
  { key: "course", header: "Course" },
  { key: "invoice_number", header: "Invoice" },
  { key: "final_amount", header: "Amount", format: "currency" },
  { key: "payment_method", header: "Method" },
  { key: "status", header: "Status" },
  { key: "created_at", header: "Date", format: "datetime" },
];

const PROGRESS_SHEET_COLUMNS: ExportColumn[] = [
  { key: "student_code", header: "Student code" },
  { key: "student_name", header: "Student" },
  { key: "email", header: "Email" },
  { key: "course", header: "Course" },
  { key: "subject", header: "Subject" },
  { key: "topic", header: "Topic" },
  { key: "content_title", header: "Lesson" },
  { key: "content_type", header: "Type" },
  { key: "status", header: "Status" },
  { key: "progress_fraction", header: "Progress", format: "percent" },
  { key: "play_count", header: "Plays", format: "number" },
  { key: "completed_at", header: "Completed", format: "datetime" },
];

interface EnrollmentQueryRow {
  student_id: string;
  status: string;
  purchased_at: string | null;
  valid_until: string | null;
  payment_amount: number | null;
  payment_method: string | null;
  course: { title: string | null } | { title: string | null }[] | null;
}

interface OrderQueryRow {
  id: string;
  student_id: string;
  invoice_number: string | null;
  amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method: string;
  razorpay_payment_id: string | null;
  status: string;
  created_at: string;
  student:
    | { full_name: string | null; email: string | null; phone: string | null }
    | { full_name: string | null; email: string | null; phone: string | null }[]
    | null;
  course: { title: string | null } | { title: string | null }[] | null;
}

interface ProgressQueryRow {
  student_id: string;
  status: string;
  progress_percentage: number | null;
  play_count: number | null;
  last_position_seconds: number | null;
  completed_at: string | null;
  updated_at: string | null;
  student:
    | { full_name: string | null; email: string | null; class: string | null }
    | { full_name: string | null; email: string | null; class: string | null }[]
    | null;
  content_item: ContentItemEmbed | ContentItemEmbed[] | null;
}

interface ContentItemEmbed {
  title: string | null;
  type: string | null;
  topic:
    | {
        name: string | null;
        subject:
          | { name: string | null; course: { title: string | null } | { title: string | null }[] | null }
          | { name: string | null; course: { title: string | null } | { title: string | null }[] | null }[]
          | null;
      }
    | {
        name: string | null;
        subject:
          | { name: string | null; course: { title: string | null } | { title: string | null }[] | null }
          | { name: string | null; course: { title: string | null } | { title: string | null }[] | null }[]
          | null;
      }[]
    | null;
}

/** Course / subject / topic path for a content item, however the embed arrived. */
function contentPath(item: ContentItemEmbed | ContentItemEmbed[] | null): {
  course: string | null;
  subject: string | null;
  topic: string | null;
  title: string | null;
  type: string | null;
} {
  const content = one(item);
  const topic = one(content?.topic);
  const subject = one(topic?.subject);
  const course = one(subject?.course);

  return {
    course: course?.title ?? null,
    subject: subject?.name ?? null,
    topic: topic?.name ?? null,
    title: content?.title ?? null,
    type: content?.type ?? null,
  };
}

const PROGRESS_SELECT = `student_id, status, progress_percentage, play_count,
  last_position_seconds, completed_at, updated_at,
  student:students(full_name, email, class),
  content_item:content_items(
    title, type,
    topic:topics(name, subject:subjects(name, course:courses(title)))
  )`;

function toProgressExportRow(row: ProgressQueryRow): ExportRow {
  const student = one(row.student);
  const path = contentPath(row.content_item);

  return {
    student_name: student?.full_name ?? null,
    email: student?.email ?? null,
    class: student?.class ?? null,
    course: path.course,
    subject: path.subject,
    topic: path.topic,
    content_title: path.title,
    content_type: path.type,
    status: row.status,
    // Stored as 0-100; Excel's percent format wants the fraction.
    progress_fraction:
      row.progress_percentage === null ? null : Number(row.progress_percentage) / 100,
    play_count: row.play_count ?? 0,
    last_position_seconds: row.last_position_seconds ?? null,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
  };
}

const studentsFullDataset = defineDataset({
  label: "Students",
  requiredRoles: EXPORT_ROLES["students-full"],
  sensitiveKeys: STUDENT_SENSITIVE_KEYS,
  columns: STUDENT_COLUMNS,
  filters: studentExportFilters,
  describe: describeStudentFilters,
  async fetcher(filters, supabase) {
    const rows = await fetchStudentRows(filters, supabase);
    return rows.map(toStudentExportRow);
  },
  async extraSheets({ rows, supabase, hidden }) {
    const studentIds = rows.map((row) => String(row.id));
    const visible = (columns: ExportColumn[]) =>
      columns.filter((column) => !hidden.has(column.key));

    const [enrollments, orders, progress] = await Promise.all([
      rowsForStudents<EnrollmentQueryRow>("enrolment", studentIds, (from, to, ids) => {
        let query = supabase
          .from("enrollments")
          .select(
            `student_id, status, purchased_at, valid_until, payment_amount,
             payment_method, course:courses(title)`,
            { count: "exact" }
          )
          .order("purchased_at", { ascending: false })
          .order("id", { ascending: true });
        if (ids) query = query.in("student_id", ids);
        return query.range(from, to);
      }),
      rowsForStudents<OrderQueryRow>("order", studentIds, (from, to, ids) => {
        let query = supabase
          .from("orders")
          .select(
            `id, student_id, invoice_number, amount, discount_amount, final_amount,
             payment_method, razorpay_payment_id, status, created_at,
             student:students(full_name, email, phone), course:courses(title)`,
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });
        if (ids) query = query.in("student_id", ids);
        return query.range(from, to);
      }),
      rowsForStudents<ProgressQueryRow>("progress", studentIds, (from, to, ids) => {
        let query = supabase
          .from("student_progress")
          .select(PROGRESS_SELECT, { count: "exact" })
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true });
        if (ids) query = query.in("student_id", ids);
        return query.range(from, to);
      }),
    ]);

    const nameById = new Map(
      rows.map((row) => [String(row.id), String(row.full_name ?? "")])
    );
    const emailById = new Map(
      rows.map((row) => [String(row.id), row.email === undefined ? null : row.email])
    );
    const codeById = new Map(
      rows.map((row) => [String(row.id), row.student_code ?? null])
    );

    return [
      {
        sheetName: "Enrollments",
        title: "Enrollments",
        columns: visible(ENROLLMENT_SHEET_COLUMNS),
        rows: enrollments.map((row) => ({
          student_code: codeById.get(row.student_id) ?? null,
          student_name: nameById.get(row.student_id) ?? null,
          email: emailById.get(row.student_id) ?? null,
          course: one(row.course)?.title ?? null,
          status: row.status,
          purchased_at: row.purchased_at,
          valid_until: row.valid_until,
          payment_amount: row.payment_amount,
          payment_method: row.payment_method,
        })),
      },
      {
        sheetName: "Payments",
        title: "Payments",
        columns: visible(PAYMENT_SHEET_COLUMNS),
        rows: orders.map((row) => ({
          student_code: codeById.get(row.student_id) ?? null,
          student_name: one(row.student)?.full_name ?? nameById.get(row.student_id) ?? null,
          email: emailById.get(row.student_id) ?? null,
          course: one(row.course)?.title ?? null,
          invoice_number: row.invoice_number,
          final_amount: row.final_amount,
          payment_method: row.payment_method,
          status: row.status,
          created_at: row.created_at,
        })),
      },
      {
        sheetName: "Progress",
        title: "Progress",
        columns: visible(PROGRESS_SHEET_COLUMNS),
        rows: progress.map((row) => ({
          ...toProgressExportRow(row),
          student_code: codeById.get(row.student_id) ?? null,
        })),
      },
    ];
  },
  summary(rows) {
    return [
      { label: "Students", value: rows.length, format: "number" },
      {
        label: "With at least one course",
        value: rows.filter((row) => Number(row.enrollment_count ?? 0) > 0).length,
        format: "number",
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Student progress
// ---------------------------------------------------------------------------

const progressFilters = z.object({
  search: searchFilter,
  courseId: z.union([z.literal("all"), z.string().uuid("Course filter is invalid.")]).optional(),
  status: allOr(z.enum(["not_started", "in_progress", "completed"])),
});

const progressDataset = defineDataset({
  label: "Student progress",
  requiredRoles: EXPORT_ROLES["student-progress"],
  sensitiveKeys: ["email"],
  columns: [
    { key: "student_name", header: "Student" },
    { key: "email", header: "Email" },
    { key: "class", header: "Class" },
    { key: "course", header: "Course" },
    { key: "subject", header: "Subject" },
    { key: "topic", header: "Topic" },
    { key: "content_title", header: "Lesson" },
    { key: "content_type", header: "Type" },
    { key: "status", header: "Status" },
    { key: "progress_fraction", header: "Progress", format: "percent" },
    { key: "play_count", header: "Plays", format: "number" },
    { key: "completed_at", header: "Completed", format: "datetime" },
    { key: "updated_at", header: "Last activity", format: "datetime" },
  ],
  filters: progressFilters,
  async describe(filters, supabase) {
    return describeParts([
      ["search", filters.search],
      ["status", filters.status],
      ["course", await courseLabel(supabase, filters.courseId)],
    ]);
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<ProgressQueryRow>("progress", (from, to) => {
      let query = supabase
        .from("student_progress")
        .select(PROGRESS_SELECT, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.status)) {
        query = query.eq("status", filters.status as string);
      }

      return query.range(from, to);
    });

    const mapped = rows.map(toProgressExportRow);
    const search = filters.search ? filters.search.toLowerCase() : null;
    const courseFilter = isApplied(filters.courseId) ? filters.courseId : null;

    // Student name and course live behind embeds, which PostgREST cannot
    // filter on without turning the embed into an inner join and dropping
    // rows. Narrowing here keeps the sheet matching what the page shows.
    const courseTitle = courseFilter
      ? await courseLabel(supabase, courseFilter as string)
      : null;

    return mapped.filter((row) => {
      if (courseTitle && row.course !== courseTitle) return false;
      if (!search) return true;
      return [row.student_name, row.content_title, row.course]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(search));
    });
  },
  summary(rows) {
    const completed = rows.filter((row) => row.status === "completed").length;
    return [
      { label: "Progress records", value: rows.length, format: "number" },
      { label: "Completed lessons", value: completed, format: "number" },
      {
        label: "Completion rate",
        value: rows.length > 0 ? completed / rows.length : 0,
        format: "percent",
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Leads and testimonials
// ---------------------------------------------------------------------------

const leadFilters = leadListFilterSchema.extend({
  search: searchFilter,
  source: z.string().max(50, "Source filter is too long.").optional(),
});

const leadsDataset = defineDataset({
  label: "Leads",
  requiredRoles: EXPORT_ROLES.leads,
  columns: [
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    { key: "class", header: "Class" },
    { key: "source", header: "Source" },
    { key: "status", header: "Status" },
    { key: "remarks", header: "Remarks" },
    { key: "created_at", header: "Added", format: "datetime" },
  ],
  filters: leadFilters,
  async describe(filters) {
    return describeParts([
      ["search", filters.search],
      ["status", filters.status],
      ["source", filters.source],
    ]);
  },
  async fetcher(filters, supabase) {
    return fetchAllRows("lead", (from, to) => {
      let query = supabase
        .from("leads")
        .select("name, phone, email, class, source, status, remarks, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) {
          query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
        }
      }

      if (isApplied(filters.status)) {
        query = query.eq("status", filters.status as "new");
      }

      if (isApplied(filters.source)) {
        query = query.eq("source", filters.source as string);
      }

      return query.range(from, to);
    });
  },
});

const testimonialsDataset = defineDataset({
  label: "Testimonials",
  requiredRoles: EXPORT_ROLES.testimonials,
  columns: [
    { key: "student_name", header: "Student" },
    { key: "class", header: "Class" },
    { key: "year", header: "Year" },
    { key: "type", header: "Type" },
    { key: "rating", header: "Rating", format: "number" },
    { key: "content", header: "Testimonial" },
    { key: "video_url", header: "Video" },
    { key: "is_visible", header: "Visible", format: "boolean" },
    { key: "weight", header: "Order", format: "number" },
    { key: "created_at", header: "Added", format: "date" },
  ],
  filters: z.object({ visible: allOr(z.enum(["true", "false"])) }),
  async describe(filters) {
    return describeParts([["visible", filters.visible]]);
  },
  async fetcher(filters, supabase) {
    return fetchAllRows("testimonial", (from, to) => {
      let query = supabase
        .from("testimonials")
        .select(
          "student_name, class, year, type, rating, content, video_url, is_visible, weight, created_at",
          { count: "exact" }
        )
        .order("weight", { ascending: true })
        .order("id", { ascending: true });

      if (isApplied(filters.visible)) {
        query = query.eq("is_visible", filters.visible === "true");
      }

      return query.range(from, to);
    });
  },
});

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

interface CertificateQueryRow {
  status: string;
  certificate_number: string | null;
  verification_code: string;
  requested_at: string;
  issued_at: string | null;
  rejected_reason: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  student_name: string | null;
  course_title: string | null;
  student: { full_name: string; student_code: string | null; class: string | null } | { full_name: string; student_code: string | null; class: string | null }[] | null;
  course: { title: string } | { title: string }[] | null;
}

const certificatesDataset = defineDataset({
  label: "Certificates",
  requiredRoles: EXPORT_ROLES.certificates,
  columns: [
    { key: "certificate_number", header: "Certificate no." },
    { key: "student_name", header: "Student" },
    { key: "student_code", header: "Student ID" },
    { key: "class", header: "Class" },
    { key: "course", header: "Course" },
    { key: "status", header: "Status" },
    { key: "requested_at", header: "Completed", format: "date" },
    { key: "issued_at", header: "Issued", format: "date" },
    { key: "revoked_at", header: "Revoked", format: "date" },
    { key: "reason", header: "Reason" },
    { key: "verify_url", header: "Verification link" },
  ],
  filters: z.object({
    status: allOr(z.enum(["pending", "issued", "rejected", "revoked"])),
    courseId: allOr(z.string().uuid("Course filter is invalid.")),
    search: searchFilter,
  }),
  async describe(filters, supabase) {
    return describeParts([
      ["status", filters.status],
      ["course", await courseLabel(supabase, filters.courseId)],
      ["search", filters.search],
    ]);
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<CertificateQueryRow>("certificate", (from, to) => {
      let query = supabase
        .from("certificates")
        .select(
          `status, certificate_number, verification_code, requested_at, issued_at,
           rejected_reason, revoked_at, revoked_reason, student_name, course_title,
           student:students!inner(full_name, student_code, class),
           course:courses(title)`,
          { count: "exact" }
        )
        .order("requested_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.status)) {
        query = query.eq("status", filters.status as string);
      }

      if (isApplied(filters.courseId)) {
        query = query.eq("course_id", filters.courseId as string);
      }

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) {
          query = query.or(
            `full_name.ilike.%${safe}%,student_code.ilike.%${safe}%`,
            { referencedTable: "students" }
          );
        }
      }

      return query.range(from, to);
    });

    return rows.map((row) => {
      const student = one(row.student);
      const issued = row.status === "issued" || row.status === "revoked";
      return {
        certificate_number: row.certificate_number,
        student_name: row.student_name ?? student?.full_name ?? null,
        student_code: student?.student_code ?? null,
        class: student?.class ?? null,
        course: row.course_title ?? one(row.course)?.title ?? null,
        status: CERTIFICATE_STATUS_LABELS[row.status as CertificateStatus] ?? row.status,
        requested_at: row.requested_at,
        issued_at: row.issued_at,
        revoked_at: row.revoked_at,
        reason: row.status === "revoked" ? row.revoked_reason : row.rejected_reason,
        // Only an issued certificate has a public page to link to.
        verify_url: issued ? certificateUrl(row.verification_code) : null,
      };
    });
  },
  summary(rows) {
    return [
      { label: "Certificates", value: rows.length, format: "number" },
      {
        label: "Issued",
        value: rows.filter((row) => row.status === CERTIFICATE_STATUS_LABELS.issued).length,
        format: "number",
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Course reviews
// ---------------------------------------------------------------------------

/** The moderation function caps a page at this many rows. */
const REVIEW_EXPORT_WINDOW = 100;

const courseReviewsDataset = defineDataset({
  label: "Course reviews",
  requiredRoles: EXPORT_ROLES["course-reviews"],
  columns: [
    { key: "course", header: "Course" },
    { key: "student_name", header: "Student" },
    { key: "student_code", header: "Student ID" },
    { key: "class", header: "Class" },
    { key: "stars", header: "Stars", format: "number" },
    { key: "review", header: "Review" },
    { key: "status", header: "Status" },
    { key: "hidden_reason", header: "Hidden because" },
    { key: "hidden_by", header: "Hidden by" },
    { key: "created_at", header: "First rated", format: "date" },
    { key: "updated_at", header: "Last changed", format: "date" },
  ],
  filters: z.object({
    status: allOr(z.enum(["visible", "hidden"])),
    courseId: allOr(z.string().uuid("Course filter is invalid.")),
    stars: allOr(z.enum(["1", "2", "3", "4", "5"])),
    search: searchFilter,
  }),
  async describe(filters, supabase) {
    return describeParts([
      ["status", filters.status],
      ["course", await courseLabel(supabase, filters.courseId)],
      ["stars", filters.stars],
      ["search", filters.search],
    ]);
  },
  // Through the same function as the moderation screen, so the export holds
  // exactly what the screen would show for the same filters, review-text
  // search included.
  async fetcher(filters, supabase) {
    const out: ExportRow[] = [];
    for (let offset = 0; ; offset += REVIEW_EXPORT_WINDOW) {
      const { data, error } = await supabase.rpc("admin_list_course_ratings", {
        p_status: isApplied(filters.status) ? (filters.status as string) : undefined,
        p_course_id: isApplied(filters.courseId) ? (filters.courseId as string) : undefined,
        p_stars: isApplied(filters.stars) ? Number(filters.stars) : undefined,
        p_search: filters.search || undefined,
        p_limit: REVIEW_EXPORT_WINDOW,
        p_offset: offset,
      });

      if (error) {
        throw new Error(`Could not read every course review row: ${error.message}`);
      }

      for (const row of data ?? []) {
        out.push({
          course: row.course_title ?? null,
          student_name: row.student_name,
          student_code: row.student_code ?? null,
          class: row.student_class ?? null,
          stars: row.stars,
          review: row.review ?? null,
          status: row.is_hidden ? "Hidden" : "Visible",
          hidden_reason: row.hidden_reason ?? null,
          hidden_by: row.hidden_by_name ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }

      const total = Number(data?.[0]?.total_count ?? 0);
      if (!data || data.length < REVIEW_EXPORT_WINDOW || out.length >= total) break;
    }
    return out;
  },
  summary(rows) {
    const rated = rows.filter((row) => row.status === "Visible");
    const sum = rated.reduce((acc, row) => acc + Number(row.stars ?? 0), 0);
    return [
      { label: "Ratings", value: rows.length, format: "number" },
      { label: "Hidden", value: rows.length - rated.length, format: "number" },
      {
        label: "Average of visible",
        value: rated.length > 0 ? Math.round((sum / rated.length) * 10) / 10 : null,
        format: "number",
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

const orderExportFilters = orderFilterSchema.extend({
  search: searchFilter,
  ...dateRangeFilters,
});

type OrderExportFilters = z.output<typeof orderExportFilters>;

const ORDER_COLUMNS: ExportColumn[] = [
  { key: "invoice_number", header: "Invoice" },
  { key: "student_name", header: "Student" },
  { key: "student_email", header: "Student email" },
  { key: "student_phone", header: "Student phone" },
  { key: "course", header: "Course" },
  { key: "amount", header: "List price", format: "currency" },
  { key: "discount_amount", header: "Discount", format: "currency" },
  { key: "final_amount", header: "Paid", format: "currency" },
  { key: "payment_method", header: "Method" },
  { key: "razorpay_payment_id", header: "Gateway payment id" },
  { key: "status", header: "Status" },
  { key: "created_at", header: "Date", format: "datetime" },
];

const ORDER_SENSITIVE_KEYS = ["student_email", "student_phone"];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  razorpay: "Razorpay",
  manual_cash: "Cash",
  manual_upi: "UPI",
  manual_bank: "Bank transfer",
};

function toOrderExportRow(row: OrderQueryRow): ExportRow {
  const student = one(row.student);

  return {
    invoice_number: row.invoice_number,
    student_name: student?.full_name ?? null,
    student_email: student?.email ?? null,
    student_phone: student?.phone ?? null,
    course: one(row.course)?.title ?? null,
    amount: Number(row.amount),
    discount_amount: Number(row.discount_amount),
    final_amount: Number(row.final_amount),
    payment_method: PAYMENT_METHOD_LABELS[row.payment_method] ?? row.payment_method,
    razorpay_payment_id: row.razorpay_payment_id,
    status: row.status,
    created_at: row.created_at,
  };
}

const ORDER_SELECT = `id, student_id, invoice_number, amount, discount_amount,
  final_amount, payment_method, razorpay_payment_id, status, created_at,
  student:students(full_name, email, phone), course:courses(title)`;

function orderQuery(
  supabase: AdminClient,
  filters: OrderExportFilters,
  options: { manualOnly?: boolean; completedOnly?: boolean } = {}
) {
  return (from: number, to: number) => {
    let query = supabase
      .from("orders")
      .select(ORDER_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
        .order("id", { ascending: true });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe.length > 0) {
        query = query.or(
          `razorpay_payment_id.ilike.%${safe}%,razorpay_order_id.ilike.%${safe}%,invoice_number.ilike.%${safe}%`
        );
      }
    }

    if (isApplied(filters.status)) {
      query = query.eq("status", filters.status as "completed");
    }

    if (isApplied(filters.paymentMethod)) {
      query = query.eq("payment_method", filters.paymentMethod as "razorpay");
    }

    if (isApplied(filters.courseId)) {
      query = query.eq("course_id", filters.courseId as string);
    }

    if (filters.dateFrom) query = query.gte("created_at", rangeStart(filters.dateFrom));
    if (filters.dateTo) query = query.lte("created_at", rangeEnd(filters.dateTo));

    if (options.manualOnly) {
      query = query.in("payment_method", ["manual_cash", "manual_upi", "manual_bank"]);
    }

    // Matching the Invoices list, which shows completed orders — an invoice
    // number is minted by the webhook and may lag the order by a moment.
    if (options.completedOnly) {
      query = query.eq("status", "completed");
    }

    return query.range(from, to);
  };
}

async function describeOrderFilters(
  filters: OrderExportFilters,
  supabase: AdminClient
): Promise<string> {
  return describeParts([
    ["search", filters.search],
    ["status", filters.status],
    ["method", filters.paymentMethod],
    ["course", await courseLabel(supabase, filters.courseId)],
    ...describeDates(filters),
  ]);
}

function orderSummary(rows: ExportRow[]): ExportSummaryEntry[] {
  const completed = rows.filter((row) => row.status === "completed");
  const collected = completed.reduce((sum, row) => sum + Number(row.final_amount ?? 0), 0);
  const discounted = rows.reduce((sum, row) => sum + Number(row.discount_amount ?? 0), 0);

  return [
    { label: "Orders", value: rows.length, format: "number" },
    { label: "Completed orders", value: completed.length, format: "number" },
    { label: "Collected", value: collected, format: "currency" },
    {
      label: "Average order value",
      value: completed.length > 0 ? collected / completed.length : 0,
      format: "currency",
    },
    { label: "Discount given", value: discounted, format: "currency" },
  ];
}

const ordersDataset = defineDataset({
  label: "Orders",
  requiredRoles: EXPORT_ROLES.orders,
  sensitiveKeys: ORDER_SENSITIVE_KEYS,
  columns: ORDER_COLUMNS,
  filters: orderExportFilters,
  describe: describeOrderFilters,
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<OrderQueryRow>("order", orderQuery(supabase, filters));
    return rows.map(toOrderExportRow);
  },
  summary: orderSummary,
});

const manualPaymentsDataset = defineDataset({
  label: "Manual payments",
  requiredRoles: EXPORT_ROLES["manual-payments"],
  sensitiveKeys: ORDER_SENSITIVE_KEYS,
  columns: ORDER_COLUMNS,
  filters: orderExportFilters,
  describe: describeOrderFilters,
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<OrderQueryRow>(
      "manual payment",
      orderQuery(supabase, filters, { manualOnly: true })
    );
    return rows.map(toOrderExportRow);
  },
  summary: orderSummary,
});

const invoicesDataset = defineDataset({
  label: "Invoices",
  requiredRoles: EXPORT_ROLES.invoices,
  sensitiveKeys: ORDER_SENSITIVE_KEYS,
  columns: ORDER_COLUMNS.filter((column) => column.key !== "razorpay_payment_id"),
  filters: orderExportFilters,
  describe: describeOrderFilters,
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<OrderQueryRow>(
      "invoice",
      orderQuery(supabase, filters, { completedOnly: true })
    );
    return rows.map(toOrderExportRow);
  },
  summary(rows) {
    return [
      { label: "Invoices", value: rows.length, format: "number" },
      {
        label: "Invoiced total",
        value: rows.reduce((sum, row) => sum + Number(row.final_amount ?? 0), 0),
        format: "currency",
      },
    ];
  },
});

interface RefundQueryRow {
  amount: number;
  reason: string;
  status: string;
  razorpay_refund_id: string | null;
  processed_at: string | null;
  created_at: string;
  order:
    | { invoice_number: string | null; final_amount: number; student: { full_name: string | null } | { full_name: string | null }[] | null; course: { title: string | null } | { title: string | null }[] | null }
    | { invoice_number: string | null; final_amount: number; student: { full_name: string | null } | { full_name: string | null }[] | null; course: { title: string | null } | { title: string | null }[] | null }[]
    | null;
}

const refundsDataset = defineDataset({
  label: "Refunds",
  requiredRoles: EXPORT_ROLES.refunds,
  columns: [
    { key: "invoice_number", header: "Invoice" },
    { key: "student_name", header: "Student" },
    { key: "course", header: "Course" },
    { key: "order_amount", header: "Order total", format: "currency" },
    { key: "amount", header: "Refunded", format: "currency" },
    { key: "reason", header: "Reason" },
    { key: "status", header: "Status" },
    { key: "razorpay_refund_id", header: "Gateway refund id" },
    { key: "created_at", header: "Requested", format: "datetime" },
    { key: "processed_at", header: "Processed", format: "datetime" },
  ],
  filters: refundFilterSchema.extend(dateRangeFilters),
  async describe(filters) {
    return describeParts([["status", filters.status], ...describeDates(filters)]);
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<RefundQueryRow>("refund", (from, to) => {
      let query = supabase
        .from("refunds")
        .select(
          `amount, reason, status, razorpay_refund_id, processed_at, created_at,
           order:orders(invoice_number, final_amount, student:students(full_name),
           course:courses(title))`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.status)) {
        query = query.eq("status", filters.status as "requested");
      }

      if (filters.dateFrom) query = query.gte("created_at", rangeStart(filters.dateFrom));
      if (filters.dateTo) query = query.lte("created_at", rangeEnd(filters.dateTo));

      return query.range(from, to);
    });

    return rows.map((row) => {
      const order = one(row.order);
      return {
        invoice_number: order?.invoice_number ?? null,
        student_name: one(order?.student)?.full_name ?? null,
        course: one(order?.course)?.title ?? null,
        order_amount: order ? Number(order.final_amount) : null,
        amount: Number(row.amount),
        reason: row.reason,
        status: row.status,
        razorpay_refund_id: row.razorpay_refund_id,
        created_at: row.created_at,
        processed_at: row.processed_at,
      };
    });
  },
  summary(rows) {
    const processed = rows.filter((row) => row.status === "processed");
    return [
      { label: "Refund requests", value: rows.length, format: "number" },
      { label: "Processed", value: processed.length, format: "number" },
      {
        label: "Amount refunded",
        value: processed.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        format: "currency",
      },
    ];
  },
});

const referralCodesDataset = defineDataset({
  label: "Referral codes",
  requiredRoles: EXPORT_ROLES["referral-codes"],
  columns: [
    { key: "code", header: "Code" },
    { key: "owner", header: "Owner" },
    { key: "discount_type", header: "Discount type" },
    { key: "discount_value", header: "Discount value", format: "number" },
    { key: "usage_count", header: "Times used", format: "number" },
    { key: "max_uses", header: "Max uses", format: "number" },
    { key: "is_active", header: "Active", format: "boolean" },
    { key: "valid_until", header: "Valid until", format: "date" },
    { key: "created_at", header: "Created", format: "date" },
  ],
  filters: z.object({
    search: searchFilter,
    active: allOr(z.enum(["true", "false"])),
  }),
  async describe(filters) {
    return describeParts([
      ["search", filters.search],
      ["active", filters.active],
    ]);
  },
  async fetcher(filters, supabase) {
    interface ReferralQueryRow {
      code: string;
      discount_type: string;
      discount_value: number;
      usage_count: number;
      max_uses: number | null;
      is_active: boolean;
      valid_until: string | null;
      created_at: string;
      student: { full_name: string | null } | { full_name: string | null }[] | null;
    }

    const rows = await fetchAllRows<ReferralQueryRow>("referral code", (from, to) => {
      let query = supabase
        .from("referral_codes")
        .select(
          `code, discount_type, discount_value, usage_count, max_uses, is_active,
           valid_until, created_at, student:students(full_name)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        // The list's search box reads from code, so the export honours the
        // same column -- zod used to drop the field on the way in because
        // the schema did not list it, and the download then ignored what
        // the admin typed. Codes do not contain `%` or `_` under the
        // minting alphabet, but `sanitizeSearch` is cheap defence.
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) {
          query = query.ilike("code", `%${safe}%`);
        }
      }

      if (isApplied(filters.active)) {
        query = query.eq("is_active", filters.active === "true");
      }

      return query.range(from, to);
    });

    return rows.map((row) => ({
      code: row.code,
      owner: one(row.student)?.full_name ?? "Dream Edge",
      discount_type: row.discount_type,
      discount_value: Number(row.discount_value),
      usage_count: row.usage_count,
      max_uses: row.max_uses,
      is_active: row.is_active,
      valid_until: row.valid_until,
      created_at: row.created_at,
    }));
  },
});

const revenueAnalyticsDataset = defineDataset({
  label: "Revenue analytics",
  requiredRoles: EXPORT_ROLES["revenue-analytics"],
  columns: [
    { key: "month", header: "Month" },
    { key: "orders", header: "Orders", format: "number" },
    { key: "revenue", header: "Revenue", format: "currency" },
    { key: "average_order", header: "Average order", format: "currency" },
  ],
  filters: z.object(dateRangeFilters),
  async describe(filters) {
    return describeParts(describeDates(filters));
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<OrderQueryRow>("order", (from, to) => {
      let query = supabase
        .from("orders")
        .select(ORDER_SELECT, { count: "exact" })
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.dateFrom) query = query.gte("created_at", rangeStart(filters.dateFrom));
      if (filters.dateTo) query = query.lte("created_at", rangeEnd(filters.dateTo));

      return query.range(from, to);
    });

    // Bucketed in IST so a month boundary falls where the team's calendar
    // puts it, matching the charts on the analytics tab.
    const monthFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      year: "numeric",
    });

    const buckets = new Map<string, { label: string; orders: number; revenue: number }>();

    for (const row of rows) {
      const date = new Date(row.created_at);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const bucket = buckets.get(key) ?? {
        label: monthFormatter.format(date),
        orders: 0,
        revenue: 0,
      };
      bucket.orders += 1;
      bucket.revenue += Number(row.final_amount);
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, bucket]) => ({
        month: bucket.label,
        orders: bucket.orders,
        revenue: bucket.revenue,
        average_order: bucket.orders > 0 ? bucket.revenue / bucket.orders : 0,
      }));
  },
  summary(rows) {
    const revenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
    const orders = rows.reduce((sum, row) => sum + Number(row.orders ?? 0), 0);
    return [
      { label: "Revenue", value: revenue, format: "currency" },
      { label: "Completed orders", value: orders, format: "number" },
      {
        label: "Average order value",
        value: orders > 0 ? revenue / orders : 0,
        format: "currency",
      },
      { label: "Months covered", value: rows.length, format: "number" },
    ];
  },
});

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const coursesDataset = defineDataset({
  label: "Courses",
  requiredRoles: EXPORT_ROLES.courses,
  columns: [
    { key: "title", header: "Course" },
    { key: "class", header: "Class" },
    { key: "subject", header: "Subject" },
    { key: "teacher_name", header: "Teacher" },
    { key: "price", header: "Price", format: "currency" },
    { key: "original_price", header: "List price", format: "currency" },
    { key: "validity_days", header: "Validity (days)", format: "number" },
    { key: "is_published", header: "Published", format: "boolean" },
    { key: "is_featured", header: "Featured", format: "boolean" },
    { key: "student_count", header: "Students", format: "number" },
    { key: "total_lessons", header: "Lessons", format: "number" },
    { key: "duration_hours", header: "Hours", format: "number" },
    { key: "created_at", header: "Created", format: "date" },
  ],
  filters: z.object({
    search: searchFilter,
    published: allOr(z.enum(["true", "false"])),
  }),
  async describe(filters) {
    return describeParts([
      ["search", filters.search],
      ["published", filters.published],
    ]);
  },
  async fetcher(filters, supabase) {
    return fetchAllRows("course", (from, to) => {
      let query = supabase
        .from("courses")
        .select(
          `title, class, subject, teacher_name, price, original_price, validity_days,
           is_published, is_featured, student_count, total_lessons, duration_hours,
           created_at`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) query = query.ilike("title", `%${safe}%`);
      }

      if (isApplied(filters.published)) {
        query = query.eq("is_published", filters.published === "true");
      }

      return query.range(from, to);
    });
  },
});

interface ContentItemQueryRow {
  title: string | null;
  type: string;
  status: string;
  is_paid: boolean | null;
  is_downloadable: boolean | null;
  is_printable: boolean | null;
  offline_license_days: number | null;
  play_limit: number | null;
  video_provider: string | null;
  video_status: string | null;
  video_size_bytes: number | null;
  duration_seconds: number | null;
  weight: number | null;
  created_at: string | null;
  topic: ContentItemEmbed["topic"];
}

const contentItemsDataset = defineDataset({
  label: "Content items",
  requiredRoles: EXPORT_ROLES["content-items"],
  columns: [
    { key: "course", header: "Course" },
    { key: "subject", header: "Subject" },
    { key: "topic", header: "Topic" },
    { key: "title", header: "Item" },
    { key: "type", header: "Type" },
    { key: "status", header: "Status" },
    { key: "is_paid", header: "Paid", format: "boolean" },
    { key: "is_downloadable", header: "Offline", format: "boolean" },
    { key: "offline_license_days", header: "Licence (days)", format: "number" },
    { key: "is_printable", header: "Printable", format: "boolean" },
    { key: "play_limit", header: "Play limit", format: "number" },
    { key: "video_provider", header: "Video host" },
    { key: "video_status", header: "Transcode" },
    { key: "video_size_mb", header: "Size (MB)", format: "number" },
    { key: "duration_minutes", header: "Duration (min)", format: "number" },
    { key: "weight", header: "Order", format: "number" },
    { key: "created_at", header: "Created", format: "date" },
  ],
  filters: z.object({
    courseId: z.union([z.literal("all"), z.string().uuid("Course filter is invalid.")]).optional(),
    type: allOr(contentTypeSchema),
    status: allOr(contentStatusSchema),
  }),
  async describe(filters, supabase) {
    return describeParts([
      ["course", await courseLabel(supabase, filters.courseId)],
      ["type", filters.type],
      ["status", filters.status],
    ]);
  },
  async fetcher(filters, supabase) {
    // Filter by course_id server-side rather than by course title in memory
    // after fetching every content item on the platform. The earlier shape
    // did `fetch everything, then .filter((row) => row.course === title)`,
    // which was wrong twice: two courses sharing a title handed the admin
    // both of them (including drafts from the course they did not pick),
    // and a rename between the page load and the click returned "no rows"
    // against a correctly-selected course.
    //
    // PostgREST filters on an embedded column with the path:
    // `topic.subject.course_id`. The embeds are marked `!inner` so a
    // content item with no topic (unlikely but possible during authoring)
    // does not slip through unfiltered.
    const inner = isApplied(filters.courseId);
    const rows = await fetchAllRows<ContentItemQueryRow>("content item", (from, to) => {
      let query = supabase
        .from("content_items")
        .select(
          inner
            ? `title, type, status, is_paid, is_downloadable, is_printable,
               offline_license_days, play_limit, video_provider, video_status,
               video_size_bytes, duration_seconds, weight, created_at,
               topic:topics!inner(name, subject:subjects!inner(name, course:courses!inner(title, id)))`
            : `title, type, status, is_paid, is_downloadable, is_printable,
               offline_license_days, play_limit, video_provider, video_status,
               video_size_bytes, duration_seconds, weight, created_at,
               topic:topics(name, subject:subjects(name, course:courses(title)))`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.type)) query = query.eq("type", filters.type as "video");
      if (isApplied(filters.status)) query = query.eq("status", filters.status as "published");
      if (inner) {
        query = query.eq("topic.subject.course_id", filters.courseId as string);
      }

      return query.range(from, to);
    });

    return rows.map((row) => {
      const path = contentPath({ title: row.title, type: row.type, topic: row.topic });
      return {
        course: path.course,
        subject: path.subject,
        topic: path.topic,
        title: row.title,
        type: row.type,
        status: row.status,
        is_paid: row.is_paid,
        is_downloadable: row.is_downloadable,
        offline_license_days: row.offline_license_days,
        is_printable: row.is_printable,
        play_limit: row.play_limit,
        video_provider: row.video_provider,
        video_status: row.video_status,
        video_size_mb:
          row.video_size_bytes === null
            ? null
            : Math.round((row.video_size_bytes / (1024 * 1024)) * 10) / 10,
        duration_minutes:
          row.duration_seconds === null ? null : Math.round(row.duration_seconds / 60),
        weight: row.weight,
        created_at: row.created_at,
      };
    });
  },
  summary(rows) {
    return [
      { label: "Content items", value: rows.length, format: "number" },
      {
        label: "Published",
        value: rows.filter((row) => row.status === "published").length,
        format: "number",
      },
      {
        label: "Available offline",
        value: rows.filter((row) => row.is_downloadable === true).length,
        format: "number",
      },
      {
        label: "Videos awaiting transcode",
        value: rows.filter((row) => row.video_status === "processing").length,
        format: "number",
      },
    ];
  },
});

interface TestQueryRow {
  name: string;
  status: string;
  duration_minutes: number | null;
  total_marks: number | null;
  max_attempts: number | null;
  pass_percentage: number | null;
  certificate_enabled: boolean | null;
  shuffle_questions: boolean | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
  course: { title: string | null } | { title: string | null }[] | null;
  questions: { id: string }[] | null;
}

const testsDataset = defineDataset({
  label: "Test series",
  requiredRoles: EXPORT_ROLES.tests,
  columns: [
    { key: "name", header: "Test" },
    { key: "course", header: "Course" },
    { key: "status", header: "Status" },
    { key: "question_count", header: "Questions", format: "number" },
    { key: "total_marks", header: "Marks", format: "number" },
    { key: "duration_minutes", header: "Duration (min)", format: "number" },
    { key: "max_attempts", header: "Attempts", format: "number" },
    { key: "pass_fraction", header: "Pass mark", format: "percent" },
    { key: "certificate_enabled", header: "Certificate", format: "boolean" },
    { key: "shuffle_questions", header: "Shuffled", format: "boolean" },
    { key: "start_time", header: "Opens", format: "datetime" },
    { key: "end_time", header: "Closes", format: "datetime" },
    { key: "created_at", header: "Created", format: "date" },
  ],
  filters: z.object({
    search: searchFilter,
    courseId: z.union([z.literal("all"), z.string().uuid("Course filter is invalid.")]).optional(),
    status: allOr(contentStatusSchema),
  }),
  async describe(filters, supabase) {
    return describeParts([
      ["search", filters.search],
      ["course", await courseLabel(supabase, filters.courseId)],
      ["status", filters.status],
    ]);
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<TestQueryRow>("test", (from, to) => {
      let query = supabase
        .from("tests")
        .select(
          `name, status, duration_minutes, total_marks, max_attempts, pass_percentage,
           certificate_enabled, shuffle_questions, start_time, end_time, created_at,
           course:courses(title), questions(id)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) query = query.ilike("name", `%${safe}%`);
      }

      if (isApplied(filters.status)) query = query.eq("status", filters.status as "published");
      if (isApplied(filters.courseId)) query = query.eq("course_id", filters.courseId as string);

      return query.range(from, to);
    });

    return rows.map((row) => ({
      name: row.name,
      course: one(row.course)?.title ?? null,
      status: row.status,
      question_count: count(row.questions),
      total_marks: row.total_marks,
      duration_minutes: row.duration_minutes,
      max_attempts: row.max_attempts,
      pass_fraction: row.pass_percentage === null ? null : Number(row.pass_percentage) / 100,
      certificate_enabled: row.certificate_enabled,
      shuffle_questions: row.shuffle_questions,
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at,
    }));
  },
});

const questionBankDataset = defineDataset({
  label: "Question bank",
  requiredRoles: EXPORT_ROLES["question-bank"],
  columns: [
    { key: "content", header: "Question" },
    { key: "type", header: "Type" },
    { key: "difficulty", header: "Difficulty" },
    { key: "topic_tag", header: "Topic tag" },
    { key: "subject", header: "Subject" },
    { key: "topic", header: "Topic" },
    { key: "positive_marks", header: "Marks", format: "number" },
    { key: "negative_marks", header: "Negative", format: "number" },
    { key: "option_count", header: "Options", format: "number" },
    { key: "used_count", header: "Times used", format: "number" },
    { key: "created_at", header: "Added", format: "date" },
  ],
  filters: z.object({
    search: searchFilter,
    type: allOr(questionTypeSchema),
    difficulty: allOr(difficultyLevelSchema),
  }),
  async describe(filters) {
    return describeParts([
      ["search", filters.search],
      ["type", filters.type],
      ["difficulty", filters.difficulty],
    ]);
  },
  async fetcher(filters, supabase) {
    interface QuestionBankQueryRow {
      content: string;
      type: string;
      difficulty: string | null;
      topic_tag: string | null;
      positive_marks: number | null;
      negative_marks: number | null;
      options: unknown;
      used_count: number | null;
      created_at: string | null;
      subject: { name: string | null } | { name: string | null }[] | null;
      topic: { name: string | null } | { name: string | null }[] | null;
    }

    const rows = await fetchAllRows<QuestionBankQueryRow>("question", (from, to) => {
      let query = supabase
        .from("question_bank")
        .select(
          `content, type, difficulty, topic_tag, positive_marks, negative_marks,
           options, used_count, created_at,
           subject:subjects(name), topic:topics(name)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) query = query.ilike("content", `%${safe}%`);
      }

      if (isApplied(filters.type)) query = query.eq("type", filters.type as "mcq_single");
      if (isApplied(filters.difficulty)) {
        query = query.eq("difficulty", filters.difficulty as "easy");
      }

      return query.range(from, to);
    });

    return rows.map((row) => ({
      content: row.content,
      type: row.type,
      difficulty: row.difficulty,
      topic_tag: row.topic_tag,
      subject: one(row.subject)?.name ?? null,
      topic: one(row.topic)?.name ?? null,
      positive_marks: row.positive_marks,
      negative_marks: row.negative_marks,
      option_count: Array.isArray(row.options) ? row.options.length : 0,
      used_count: row.used_count ?? 0,
      created_at: row.created_at,
    }));
  },
});

// ---------------------------------------------------------------------------
// Live classes
// ---------------------------------------------------------------------------

interface LiveClassQueryRow {
  title: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number | null;
  platform: string | null;
  meeting_url: string | null;
  recording_url: string | null;
  rewatch_content_id: string | null;
  attendee_count: number | null;
  created_at: string | null;
  course: { title: string | null } | { title: string | null }[] | null;
  teacher: { full_name: string | null } | { full_name: string | null }[] | null;
}

const LIVE_CLASS_COLUMNS: ExportColumn[] = [
  { key: "title", header: "Class" },
  { key: "course", header: "Course" },
  { key: "teacher", header: "Teacher" },
  { key: "scheduled_at", header: "Scheduled", format: "datetime" },
  { key: "duration_minutes", header: "Duration (min)", format: "number" },
  { key: "status", header: "Status" },
  { key: "platform", header: "Platform" },
  { key: "attendee_count", header: "Attendees", format: "number" },
  { key: "has_recording", header: "Recording", format: "boolean" },
  { key: "rewatch_uploaded", header: "Rewatch uploaded", format: "boolean" },
];

const LIVE_CLASS_SELECT = `title, status, scheduled_at, duration_minutes, platform,
  meeting_url, recording_url, rewatch_content_id, attendee_count, created_at,
  course:courses(title), teacher:admin_users(full_name)`;

function toLiveClassRow(row: LiveClassQueryRow): ExportRow {
  return {
    title: row.title,
    course: one(row.course)?.title ?? null,
    teacher: one(row.teacher)?.full_name ?? null,
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes,
    status: row.status,
    platform: row.platform,
    attendee_count: row.attendee_count ?? 0,
    has_recording: Boolean(row.recording_url),
    rewatch_uploaded: Boolean(row.rewatch_content_id),
  };
}

const liveClassFilters = z.object({
  courseId: z.union([z.literal("all"), z.string().uuid("Course filter is invalid.")]).optional(),
  status: allOr(liveClassStatusSchema),
  ...dateRangeFilters,
});

const liveClassesDataset = defineDataset({
  label: "Live classes",
  requiredRoles: EXPORT_ROLES["live-classes"],
  columns: LIVE_CLASS_COLUMNS,
  filters: liveClassFilters,
  async describe(filters, supabase) {
    return describeParts([
      ["course", await courseLabel(supabase, filters.courseId)],
      ["status", filters.status],
      ...describeDates(filters),
    ]);
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<LiveClassQueryRow>("live class", (from, to) => {
      let query = supabase
        .from("live_classes")
        .select(LIVE_CLASS_SELECT, { count: "exact" })
        .order("scheduled_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.status)) query = query.eq("status", filters.status as "scheduled");
      if (isApplied(filters.courseId)) query = query.eq("course_id", filters.courseId as string);
      if (filters.dateFrom) query = query.gte("scheduled_at", rangeStart(filters.dateFrom));
      if (filters.dateTo) query = query.lte("scheduled_at", rangeEnd(filters.dateTo));

      return query.range(from, to);
    });

    return rows.map(toLiveClassRow);
  },
});

const recordingsDataset = defineDataset({
  label: "Recordings",
  requiredRoles: EXPORT_ROLES.recordings,
  columns: LIVE_CLASS_COLUMNS,
  filters: liveClassFilters,
  async describe(filters, supabase) {
    return describeParts([
      ["course", await courseLabel(supabase, filters.courseId)],
      ...describeDates(filters),
      ["scope", "classes that have ended"],
    ]);
  },
  async fetcher(filters, supabase) {
    const rows = await fetchAllRows<LiveClassQueryRow>("recording", (from, to) => {
      let query = supabase
        .from("live_classes")
        .select(LIVE_CLASS_SELECT, { count: "exact" })
        .eq("status", "ended")
        .order("scheduled_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.courseId)) query = query.eq("course_id", filters.courseId as string);
      if (filters.dateFrom) query = query.gte("scheduled_at", rangeStart(filters.dateFrom));
      if (filters.dateTo) query = query.lte("scheduled_at", rangeEnd(filters.dateTo));

      return query.range(from, to);
    });

    return rows.map(toLiveClassRow);
  },
  summary(rows) {
    return [
      { label: "Classes ended", value: rows.length, format: "number" },
      {
        label: "Awaiting rewatch upload",
        value: rows.filter((row) => row.rewatch_uploaded === false).length,
        format: "number",
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Engage
// ---------------------------------------------------------------------------

const notificationsDataset = defineDataset({
  label: "Notifications",
  requiredRoles: EXPORT_ROLES.notifications,
  columns: [
    { key: "title", header: "Title" },
    { key: "message", header: "Message" },
    { key: "channel", header: "Channel" },
    { key: "target_type", header: "Audience" },
    { key: "course", header: "Course" },
    { key: "recipients", header: "Recipients", format: "number" },
    { key: "read_count", header: "Read", format: "number" },
    { key: "sent_by", header: "Sent by" },
    { key: "sent_at", header: "Sent", format: "datetime" },
  ],
  filters: z.object({ channel: allOr(notificationChannelSchema) }),
  async describe(filters) {
    return describeParts([["channel", filters.channel]]);
  },
  async fetcher(filters, supabase) {
    interface NotificationQueryRow {
      id: string;
      title: string;
      message: string;
      channel: string;
      target_type: string;
      sent_at: string | null;
      course: { title: string | null } | { title: string | null }[] | null;
      sender: { full_name: string | null } | { full_name: string | null }[] | null;
      student_notifications: { is_read: boolean | null }[] | null;
    }

    const rows = await fetchAllRows<NotificationQueryRow>("notification", (from, to) => {
      let query = supabase
        .from("notifications")
        .select(
          `id, title, message, channel, target_type, sent_at,
           course:courses(title), sender:admin_users(full_name),
           student_notifications(is_read)`,
          { count: "exact" }
        )
        // Matches the Engage log: per-reply doubt notices are not broadcasts.
        .neq("target_type", "doubt")
        .order("sent_at", { ascending: false })
        .order("id", { ascending: true });

      if (isApplied(filters.channel)) query = query.eq("channel", filters.channel as "push");

      return query.range(from, to);
    });

    return rows.map((row) => {
      const deliveries = row.student_notifications ?? [];
      return {
        title: row.title,
        message: row.message,
        channel: row.channel,
        target_type: row.target_type,
        course: one(row.course)?.title ?? null,
        recipients: deliveries.length,
        read_count: deliveries.filter((delivery) => delivery.is_read === true).length,
        sent_by: one(row.sender)?.full_name ?? null,
        sent_at: row.sent_at,
      };
    });
  },
});

const bannersDataset = defineDataset({
  label: "Banners",
  requiredRoles: EXPORT_ROLES.banners,
  columns: [
    { key: "title", header: "Banner" },
    { key: "position", header: "Position" },
    { key: "action_url", header: "Links to" },
    { key: "is_active", header: "Active", format: "boolean" },
    { key: "weight", header: "Order", format: "number" },
    { key: "starts_at", header: "Starts", format: "datetime" },
    { key: "ends_at", header: "Ends", format: "datetime" },
    { key: "created_at", header: "Created", format: "date" },
  ],
  filters: z.object({ active: allOr(z.enum(["true", "false"])) }),
  async describe(filters) {
    return describeParts([["active", filters.active]]);
  },
  async fetcher(filters, supabase) {
    return fetchAllRows("banner", (from, to) => {
      let query = supabase
        .from("banners")
        .select(
          "title, position, action_url, is_active, weight, starts_at, ends_at, created_at",
          { count: "exact" }
        )
        .order("weight", { ascending: true })
        .order("id", { ascending: true });

      if (isApplied(filters.active)) {
        query = query.eq("is_active", filters.active === "true");
      }

      return query.range(from, to);
    });
  },
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const adminTeamDataset = defineDataset({
  label: "Team and roles",
  requiredRoles: EXPORT_ROLES["admin-team"],
  columns: [
    { key: "full_name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "phone", header: "Phone" },
    { key: "role", header: "Role" },
    { key: "is_active", header: "Active", format: "boolean" },
    { key: "last_login_at", header: "Last signed in", format: "datetime" },
    { key: "created_at", header: "Added", format: "date" },
  ],
  filters: z.object({
    search: searchFilter,
    role: z.string().max(40, "Role filter is too long.").optional(),
  }),
  async describe(filters) {
    return describeParts([
      ["search", filters.search],
      ["role", filters.role],
    ]);
  },
  async fetcher(filters, supabase) {
    interface AdminQueryRow {
      full_name: string;
      email: string;
      phone: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
      roles: { name: string } | { name: string }[] | null;
    }

    const rows = await fetchAllRows<AdminQueryRow>("admin", (from, to) => {
      let query = supabase
        .from("admin_users")
        .select(
          "full_name, email, phone, is_active, last_login_at, created_at, roles(name)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) {
          query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
        }
      }

      return query.range(from, to);
    });

    const roleFilter = isApplied(filters.role) ? filters.role : null;

    return rows
      .map((row) => ({
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        role: one(row.roles)?.name ?? null,
        is_active: row.is_active,
        last_login_at: row.last_login_at,
        created_at: row.created_at,
      }))
      .filter((row) => !roleFilter || row.role === roleFilter);
  },
});

const auditLogDataset = defineDataset({
  label: "Audit log",
  requiredRoles: EXPORT_ROLES["audit-log"],
  columns: [
    { key: "created_at", header: "When", format: "datetime" },
    { key: "actor", header: "Admin" },
    { key: "action", header: "Action" },
    { key: "entity_type", header: "Entity" },
    { key: "entity_id", header: "Entity id" },
    { key: "ip_address", header: "IP address" },
  ],
  filters: z.object({
    search: searchFilter,
    entityType: z.string().max(60, "Entity filter is too long.").optional(),
    userId: z.union([z.literal("all"), z.string().uuid("Admin filter is invalid.")]).optional(),
    ...dateRangeFilters,
  }),
  async describe(filters, supabase) {
    return describeParts([
      ["search", filters.search],
      ["entity", filters.entityType],
      ["admin", await adminLabel(supabase, filters.userId)],
      ...describeDates(filters),
    ]);
  },
  async fetcher(filters, supabase) {
    interface AuditQueryRow {
      user_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      ip_address: string | null;
      created_at: string;
    }

    const rows = await fetchAllRows<AuditQueryRow>("audit", (from, to) => {
      let query = supabase
        .from("audit_log")
        .select("user_id, action, entity_type, entity_id, ip_address, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (filters.search) {
        const safe = sanitizeSearch(filters.search);
        if (safe.length > 0) {
          query = query.or(
            `action.ilike.%${safe}%,entity_type.ilike.%${safe}%,entity_id.ilike.%${safe}%`
          );
        }
      }

      if (isApplied(filters.entityType)) {
        query = query.eq("entity_type", filters.entityType as string);
      }

      if (isApplied(filters.userId)) {
        query = query.eq("user_id", filters.userId as string);
      }
      if (filters.dateFrom) query = query.gte("created_at", rangeStart(filters.dateFrom));
      if (filters.dateTo) query = query.lte("created_at", rangeEnd(filters.dateTo));

      return query.range(from, to);
    });

    // The log stores the auth user id; the sheet should name the person.
    const { data: admins } = await supabase.from("admin_users").select("user_id, full_name");
    const nameByUserId = new Map(
      (admins ?? []).map((admin) => [admin.user_id, admin.full_name])
    );

    return rows.map((row) => ({
      created_at: row.created_at,
      actor: row.user_id ? (nameByUserId.get(row.user_id) ?? row.user_id) : "System",
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      ip_address: row.ip_address,
    }));
  },
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const dashboardDataset = defineDataset({
  label: "Dashboard",
  requiredRoles: EXPORT_ROLES.dashboard,
  columns: [
    { key: "month", header: "Month" },
    { key: "revenue", header: "Revenue", format: "currency" },
    { key: "enrollments", header: "Enrolments", format: "number" },
  ],
  filters: z.object({}),
  async describe() {
    return "the last six months, as shown on the dashboard";
  },
  async fetcher() {
    const [revenue, enrollments] = await Promise.all([
      getRevenueTrend(),
      getEnrollmentTrend(),
    ]);

    const enrollmentByMonth = new Map(enrollments.map((point) => [point.month, point.value]));

    return revenue.map((point) => ({
      month: point.month,
      revenue: point.value,
      enrollments: enrollmentByMonth.get(point.month) ?? 0,
    }));
  },
  async extraSheets() {
    const courses = await getTopCourses("super_admin", 20);

    return [
      {
        sheetName: "Course performance",
        title: "Course performance",
        columns: [
          { key: "name", header: "Course" },
          { key: "is_published", header: "Published", format: "boolean" },
          { key: "enrollments", header: "Enrolments", format: "number" },
          { key: "revenue", header: "Revenue", format: "currency" },
          { key: "completion", header: "Completion", format: "percent" },
        ],
        rows: courses.map((course) => ({
          name: course.name,
          is_published: course.is_published,
          enrollments: course.enrollments,
          revenue: course.revenue,
          completion:
            course.completionRate === null ? null : Number(course.completionRate) / 100,
        })),
      },
    ];
  },
});

/**
 * The dashboard KPI tiles, as the workbook's Summary sheet.
 *
 * Read separately from the trend rows because the tiles are figures rather
 * than a series, and a sheet of two columns reads better than a single row
 * forty columns wide.
 */
async function dashboardSummary(): Promise<ExportSummaryEntry[]> {
  const kpis = await getDashboardKpis("super_admin");

  return [
    { label: "Total students", value: kpis.totalStudents, format: "number" },
    { label: "New students this month", value: kpis.newStudentsThisMonth, format: "number" },
    {
      label: "Student growth",
      value: kpis.studentGrowth === null ? null : kpis.studentGrowth / 100,
      format: "percent",
    },
    { label: "Published courses", value: kpis.activeCourses, format: "number" },
    { label: "Draft courses", value: kpis.draftCourses, format: "number" },
    { label: "Revenue this month", value: kpis.revenueThisMonth, format: "currency" },
    {
      label: "Revenue growth",
      value: kpis.revenueGrowth === null ? null : kpis.revenueGrowth / 100,
      format: "percent",
    },
    { label: "Pending orders", value: kpis.pendingEnrollments, format: "number" },
  ];
}

const dashboardViewDataset: ExportDataset = {
  ...dashboardDataset,
  async load(context) {
    const loaded = await dashboardDataset.load(context);
    return { ...loaded, summary: await dashboardSummary() };
  },
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const EXPORT_DATASETS: Record<string, ExportDataset> = {
  students: studentsDataset,
  "students-full": {
    ...studentsFullDataset,
    label: "Full student export",
  },
  "student-progress": progressDataset,
  leads: leadsDataset,
  testimonials: testimonialsDataset,
  certificates: certificatesDataset,
  "course-reviews": courseReviewsDataset,
  orders: ordersDataset,
  "manual-payments": manualPaymentsDataset,
  refunds: refundsDataset,
  invoices: invoicesDataset,
  "referral-codes": referralCodesDataset,
  "revenue-analytics": revenueAnalyticsDataset,
  courses: coursesDataset,
  "content-items": contentItemsDataset,
  tests: testsDataset,
  "question-bank": questionBankDataset,
  "live-classes": liveClassesDataset,
  recordings: recordingsDataset,
  notifications: notificationsDataset,
  banners: bannersDataset,
  "admin-team": adminTeamDataset,
  "audit-log": auditLogDataset,
  dashboard: dashboardViewDataset,
};

/** Kebab-case file stem, e.g. `dream-edge-students-2026-11-02`. */
export function exportFileStem(key: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `dream-edge-${key}-${date}`;
}
