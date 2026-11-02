import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getStudent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return student;
}

export async function requireStudent() {
  const student = await getStudent();
  if (!student) redirect("/login");
  return student;
}

/**
 * The profile gate.
 *
 * Every authed student page calls this rather than `requireStudent`, because
 * a student record without a class, a board or a parent's number is of no use
 * to anyone: not to Rahul Sir deciding which batch they belong in, not to the
 * centre when a payment needs chasing, and not to the student, whose course
 * recommendations have nothing to go on. A Google sign-in supplies a name and
 * an address and stops there, so the form has to be a wall rather than a
 * banner.
 *
 * `/onboarding` itself must keep calling plain `requireStudent`, or it
 * redirects to itself forever.
 *
 * `next` carries where the student was trying to go, so finishing the form
 * puts them there instead of on the dashboard.
 */
export async function requireCompleteStudentProfile(next?: string) {
  const student = await requireStudent();

  if (!student.profile_completed) {
    redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding");
  }

  return student;
}
