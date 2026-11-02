import type { Metadata } from "next";
import { ProfileContent } from "@/components/student/profile/profile-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";


export const metadata: Metadata = {
  title: "My Profile",
};

export default async function ProfilePage() {
  const student = await requireCompleteStudentProfile("/dashboard/profile");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ProfileContent student={student} signInEmail={user?.email ?? null} />;
}
