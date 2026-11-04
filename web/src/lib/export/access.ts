import type { AdminRole } from "@/lib/auth-guard";

/**
 * Who may export what.
 *
 * Kept apart from the dataset registry on purpose: the registry imports the
 * Supabase server client and the dashboard queries, and the export button has
 * to know the same rules in the browser to decide whether to render at all.
 * One table, read from both sides, is the only way those two answers stay the
 * same.
 *
 * The route still calls `assertAdmin` with these roles — hiding a button is a
 * courtesy, not a permission check.
 */

/** Roles cleared to see a student's or parent's contact details. */
export const CONTACT_ROLES: AdminRole[] = ["super_admin", "support_staff"];

export const EXPORT_ROLES = {
  students: ["super_admin", "support_staff"],
  "students-full": ["super_admin", "support_staff"],
  "student-progress": ["super_admin", "support_staff"],
  leads: ["super_admin", "support_staff"],
  testimonials: ["super_admin", "support_staff"],

  orders: ["super_admin", "accountant"],
  "manual-payments": ["super_admin", "accountant"],
  refunds: ["super_admin", "accountant"],
  invoices: ["super_admin", "accountant"],
  "referral-codes": ["super_admin", "accountant"],
  "revenue-analytics": ["super_admin", "accountant"],

  courses: ["super_admin", "content_creator"],
  "content-items": ["super_admin", "content_creator"],
  tests: ["super_admin", "content_creator"],
  "question-bank": ["super_admin", "content_creator"],

  "live-classes": ["super_admin", "content_creator", "teacher"],
  recordings: ["super_admin", "content_creator", "teacher"],

  notifications: ["super_admin", "support_staff"],
  banners: ["super_admin", "support_staff"],
  feedback: ["super_admin", "support_staff"],

  "admin-team": ["super_admin"],
  "audit-log": ["super_admin"],
  dashboard: ["super_admin"],
} satisfies Record<string, AdminRole[]>;

export type ExportDatasetKey = keyof typeof EXPORT_ROLES;

/**
 * Exports that produce several sheets in one workbook.
 *
 * These have no CSV form — one flat file cannot hold four sheets, and writing
 * only the first would be a quietly incomplete download.
 */
export const MULTI_SHEET_EXPORTS: ExportDatasetKey[] = ["students-full", "dashboard"];

export function isMultiSheetExport(key: string): boolean {
  return (MULTI_SHEET_EXPORTS as string[]).includes(key);
}

export function canExport(role: AdminRole | null | undefined, key: string): boolean {
  if (!role) return false;

  const allowed = (EXPORT_ROLES as Record<string, AdminRole[]>)[key];
  return allowed ? allowed.includes(role) : false;
}
