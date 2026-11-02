import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegistrationSheet } from "@/components/admin/students/registration-sheet";
import { getAdminSession } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Printable registration form",
};

/**
 * The blank sheet for the counter. Same audience as the entry screen next to
 * it: whoever registers students.
 */
export default async function RegistrationFormPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const canRegister =
    admin.role_name === "super_admin" || admin.role_name === "support_staff";
  if (!canRegister) redirect("/admin/students");

  return <RegistrationSheet />;
}
