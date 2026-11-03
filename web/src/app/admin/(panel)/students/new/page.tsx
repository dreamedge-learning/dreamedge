import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OfflineRegistrationForm } from "@/components/admin/students/offline-registration-form";
import { getAdminSession } from "@/lib/admin";
import { fetchCoursesForRegistration } from "./actions";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Register a student",
};

/**
 * Counter registration. Support staff and the super admin only — a content
 * creator or a teacher has no business creating student accounts, and the
 * action re-checks, so this is just the courtesy of not showing them a form
 * they cannot submit.
 */
export default async function NewStudentPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const canRegister =
    admin.role_name === "super_admin" || admin.role_name === "support_staff";
  if (!canRegister) redirect("/admin/students");

  const [courses, settings] = await Promise.all([
    fetchCoursesForRegistration(),
    getSiteSettings(),
  ]);

  return (
    <OfflineRegistrationForm
      courses={courses.data}
      // The cash block is for whoever handles money. A support staffer
      // registers the student; an accountant or the super admin records
      // what was paid.
      canRecordPayment={admin.role_name === "super_admin"}
      adminName={admin.full_name}
      supportPhone={settings.support_phone}
    />
  );
}
