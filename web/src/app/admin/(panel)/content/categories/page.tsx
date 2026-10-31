import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import { CategoryTable } from "@/components/admin/content/category-table";

async function getCategoriesWithCounts() {
  const supabase = await createClient();

  // courses.category_id does exist (uuid, nullable) -- the previous comment
  // claiming otherwise was wrong, which is why every count rendered as 0.
  // PostgREST returns an embedded aggregate as courses: [{ count: n }].
  const { data: categories } = await supabase
    .from("course_categories")
    .select("id, name, thumbnail_url, weight, courses(count)")
    .order("weight");

  if (!categories || categories.length === 0) {
    return [];
  }

  type Row = (typeof categories)[number] & {
    courses?: { count: number }[] | { count: number } | null;
  };

  return (categories as Row[]).map((cat) => {
    const embedded = Array.isArray(cat.courses) ? cat.courses[0] : cat.courses;
    const { courses: _courses, ...rest } = cat;
    void _courses;
    return { ...rest, course_count: embedded?.count ?? 0 };
  });
}

export default async function CategoriesPage() {
  // This page had no server-side role check at all: role-based navigation is
  // UI-only, so any signed-in admin could reach it by typing the URL.
  await assertAdmin(["super_admin", "content_creator"]);

  const categories = await getCategoriesWithCounts();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Organize courses into categories. Drag to reorder.
        </p>
      </div>

      <CategoryTable categories={categories} />
    </div>
  );
}
