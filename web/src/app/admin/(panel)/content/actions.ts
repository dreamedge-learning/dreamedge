"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import { courseSchema, categorySchema } from "@/lib/validations/course";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCourse(formData: FormData) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const raw = Object.fromEntries(formData.entries());
    const parsed = courseSchema.safeParse({
      ...raw,
      is_featured: raw.is_featured === "true",
      discount_price: raw.discount_price || undefined,
      category_id: raw.category_id || undefined,
      difficulty: raw.difficulty || undefined,
      meta_title: raw.meta_title || undefined,
      meta_description: raw.meta_description || undefined,
      preview_video_url: raw.preview_video_url || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const values = parsed.data;
    let slug = values.slug || toSlug(values.name);

    const row = {
      title: values.name,
      slug,
      description: values.description || null,
      long_description: values.short_description || null,
      category_id: values.category_id ?? null,
      price: values.price,
      original_price: values.discount_price != null ? values.discount_price : null,
      is_featured: values.is_featured,
      difficulty: values.difficulty || null,
      is_published: values.status === "published",
      meta_title: values.meta_title || null,
      meta_description: values.meta_description || null,
      preview_video_url: values.preview_video_url || null,
    };

    let { data, error } = await supabase
      .from("courses")
      .insert(row)
      .select("id")
      .single();

    if (error?.code === "23505") {
      slug = `${slug}-${Date.now().toString(36)}`;
      ({ data, error } = await supabase
        .from("courses")
        .insert({ ...row, slug })
        .select("id")
        .single());
    }

    if (error) {
      console.error("createCourse failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/admin/content/manager");
    revalidatePath("/courses");
    revalidatePath(`/courses/${slug}`);
    return { success: true, id: data!.id };
  } catch (err) {
    console.error("createCourse failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function updateCourse(id: string, formData: FormData) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const raw = Object.fromEntries(formData.entries());
    const parsed = courseSchema.safeParse({
      ...raw,
      is_featured: raw.is_featured === "true",
      discount_price: raw.discount_price || undefined,
      category_id: raw.category_id || undefined,
      difficulty: raw.difficulty || undefined,
      meta_title: raw.meta_title || undefined,
      meta_description: raw.meta_description || undefined,
      preview_video_url: raw.preview_video_url || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const values = parsed.data;

    const { error } = await supabase
      .from("courses")
      .update({
        title: values.name,
        slug: values.slug,
        description: values.description || null,
        long_description: values.short_description || null,
        category_id: values.category_id ?? null,
        price: values.price,
        original_price: values.discount_price != null ? values.discount_price : null,
        is_featured: values.is_featured,
        difficulty: values.difficulty || null,
        is_published: values.status === "published",
        meta_title: values.meta_title || null,
        meta_description: values.meta_description || null,
        preview_video_url: values.preview_video_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return { error: "This slug is already taken by another course" };
      }
      console.error("updateCourse failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/admin/content/manager");
    revalidatePath("/courses");
    if (values.slug) revalidatePath(`/courses/${values.slug}`);
    return { success: true };
  } catch (err) {
    console.error("updateCourse failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function deleteCourse(id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const { count } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", id);

    if (count && count > 0) {
      return { error: "Cannot delete a course with active enrollments" };
    }

    const { data: course } = await supabase
      .from("courses")
      .select("slug")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("courses").delete().eq("id", id);

    if (error) {
      console.error("deleteCourse failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/admin/content/manager");
    revalidatePath("/courses");
    if (course?.slug) revalidatePath(`/courses/${course.slug}`);
    return { success: true };
  } catch (err) {
    console.error("deleteCourse failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function duplicateCourse(id: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const { data: original, error: fetchError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !original) {
      return { error: "Course not found" };
    }

    const newSlug = `${original.slug}-copy-${Date.now().toString(36)}`;

    const { data, error } = await supabase
      .from("courses")
      .insert({
        title: `${original.title} (Copy)`,
        slug: newSlug,
        description: original.description,
        long_description: original.long_description,
        price: original.price,
        original_price: original.original_price,
        is_featured: false,
        difficulty: original.difficulty,
        is_published: false,
        thumbnail_url: original.thumbnail_url,
        class: original.class,
        subject: original.subject,
        teacher_name: original.teacher_name,
      })
      .select("id")
      .single();

    if (error) {
      console.error("duplicateCourse failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/admin/content/manager");
    revalidatePath("/courses");
    return { success: true, id: data.id };
  } catch (err) {
    console.error("duplicateCourse failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function toggleCourseStatus(
  id: string,
  newStatus: "draft" | "published" | "archived"
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const { data: course } = await supabase
      .from("courses")
      .select("slug")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("courses")
      .update({
        is_published: newStatus === "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("toggleCourseStatus failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/admin/content/manager");
    revalidatePath("/courses");
    if (course?.slug) revalidatePath(`/courses/${course.slug}`);
    return { success: true };
  } catch (err) {
    console.error("toggleCourseStatus failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

const ALLOWED_THUMBNAIL_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

const ALLOWED_THUMBNAIL_EXTS = ["jpg", "jpeg", "png", "webp", "avif"];

export async function uploadCourseThumbnail(courseId: string, formData: FormData) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const file = formData.get("thumbnail") as File;
    if (!file || file.size === 0) {
      return { error: "No file provided" };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { error: "File must be under 2MB" };
    }

    if (!(ALLOWED_THUMBNAIL_TYPES as readonly string[]).includes(file.type)) {
      return { error: "Only JPEG, PNG, WebP and AVIF images are allowed." };
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_THUMBNAIL_EXTS.includes(ext)) {
      return { error: "Invalid file extension." };
    }

    const path = `courses/${courseId}/thumbnail.${ext}`;

    const staleExts = ALLOWED_THUMBNAIL_EXTS.filter((e) => e !== ext);
    await supabase.storage
      .from("course-thumbnails")
      .remove(staleExts.map((e) => `courses/${courseId}/thumbnail.${e}`));

    const { error: uploadError } = await supabase.storage
      .from("course-thumbnails")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      console.error("uploadCourseThumbnail failed:", uploadError);
      return { error: "Something went wrong. Please try again." };
    }

    const { data: urlData } = supabase.storage
      .from("course-thumbnails")
      .getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("courses")
      .update({ thumbnail_url: urlData.publicUrl })
      .eq("id", courseId);

    if (updateError) {
      console.error("uploadCourseThumbnail failed:", updateError);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/admin/content/manager");
    revalidatePath("/courses");
    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    console.error("uploadCourseThumbnail failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function createCategory(formData: FormData) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const raw = Object.fromEntries(formData.entries());
    const parsed = categorySchema.safeParse(raw);

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const { count } = await supabase
      .from("course_categories")
      .select("id", { count: "exact", head: true });

    const catSlug = toSlug(parsed.data.name);
    const { error } = await supabase.from("course_categories").insert({
      name: parsed.data.name,
      slug: catSlug,
      weight: (count ?? 0) + 1,
    });

    if (error) {
      console.error("createCategory failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/courses");
    return { success: true };
  } catch (err) {
    console.error("createCategory failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function updateCategory(id: string, formData: FormData) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const raw = Object.fromEntries(formData.entries());
    const parsed = categorySchema.safeParse(raw);

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const { error } = await supabase
      .from("course_categories")
      .update({ name: parsed.data.name })
      .eq("id", id);

    if (error) {
      console.error("updateCategory failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/courses");
    return { success: true };
  } catch (err) {
    console.error("updateCategory failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function deleteCategory(id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const { error } = await supabase.from("course_categories").delete().eq("id", id);

    if (error) {
      console.error("deleteCategory failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/courses");
    return { success: true };
  } catch (err) {
    console.error("deleteCategory failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}

export async function reorderCategories(orderedIds: string[]) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const updates = orderedIds.map((id, index) =>
      supabase
        .from("course_categories")
        .update({ weight: index + 1 })
        .eq("id", id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);

    if (failed?.error) {
      console.error("reorderCategories failed:", failed.error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content");
    revalidatePath("/courses");
    return { success: true };
  } catch (err) {
    console.error("reorderCategories failed:", err);
    return { error: "You don't have permission to perform this action." };
  }
}
