import { createClient } from "@/lib/supabase/server";
import { ContentManagerClient } from "@/components/admin/content-manager/content-manager-client";

async function getCourses() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, is_published")
    .order("created_at", { ascending: false });
  return data || [];
}

export default async function ContentManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const [courses, { course }] = await Promise.all([getCourses(), searchParams]);

  // Every course card links here with ?course=, so arriving from a course
  // opens that course rather than an empty picker.
  return <ContentManagerClient courses={courses} initialCourseId={course ?? null} />;
}
