"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, FolderTree, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { courseSchema, type CourseFormValues } from "@/lib/validations/course";
import {
  createCourse,
  updateCourse,
  uploadCourseThumbnail,
} from "@/app/admin/(panel)/content/actions";
import type { CourseCategory } from "@/types/course";
import type { Course } from "@/types/database";

type ActionResult = { error: string } | { success: boolean; id?: string };

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CourseFormProps {
  course?: Course;
  categories: CourseCategory[];
}

export function CourseForm({ course, categories }: CourseFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    course?.thumbnail_url || null
  );

  const isEditing = Boolean(course);

  const form = useForm<CourseFormValues>({
    // zod v4 + @hookform/resolvers has a known generic variance mismatch;
    // the runtime resolver is correct, so cast through unknown.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(courseSchema) as any,
    defaultValues: {
      name: course?.title || "",
      slug: course?.slug || "",
      description: course?.description || "",
      short_description: course?.long_description || "",
      category_id: course?.category_id || "",
      language: "hinglish" as "hindi" | "english" | "hinglish",
      price: course?.price || 0,
      discount_price: course?.original_price ?? undefined,
      validity_days: 365,
      is_featured: course?.is_featured || false,
      difficulty: (course?.difficulty as "easy" | "medium" | "hard" | null) || null,
      status: course?.is_published ? "published" : "draft",
      meta_title: course?.meta_title || "",
      meta_description: course?.meta_description || "",
      preview_video_url: course?.preview_video_url || "",
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;


  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setValue("name", name);
    if (!isEditing || !course?.slug) {
      setValue("slug", toSlug(name));
    }
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Thumbnail must be under 2MB");
      return;
    }
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
  }

  function onSubmit(values: CourseFormValues, targetStatus?: "draft" | "published") {
    const status = targetStatus || values.status;

    startTransition(async () => {
      const formData = new FormData();
      Object.entries({ ...values, status }).forEach(([key, val]) => {
        formData.set(key, String(val ?? ""));
      });

      const result: ActionResult = isEditing
        ? await updateCourse(course!.id, formData)
        : await createCourse(formData);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const courseId = isEditing ? course!.id : result.id!;

      if (thumbnailFile) {
        const thumbData = new FormData();
        thumbData.set("thumbnail", thumbnailFile);
        const thumbResult = await uploadCourseThumbnail(courseId, thumbData);
        if (thumbResult.error) {
          toast.error(`Saved, but thumbnail failed: ${thumbResult.error}`);
        }
      }

      toast.success(isEditing ? "Course updated" : "Course created");
      router.push("/admin/content");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/admin/content" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          {isEditing ? "Edit Course" : "New Course"}
        </h1>
        {isEditing && course && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            render={<Link href={`/admin/content/manager?course=${course.id}`} />}
          >
            <FolderTree className="mr-1.5 h-3.5 w-3.5" />
            Manage content
          </Button>
        )}
      </div>

      <form
        onSubmit={handleSubmit((v) => onSubmit(v as unknown as CourseFormValues))}
        className="space-y-8"
      >
        {/* Basic Info */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Basic Info
          </h2>

          <div className="space-y-2">
            <Label htmlFor="name">Title</Label>
            <Input
              id="name"
              placeholder="e.g. Class 8 Maths Foundation"
              {...register("name")}
              onChange={handleNameChange}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder="class-8-maths-foundation"
              {...register("slug")}
            />
            {errors.slug && (
              <p className="text-xs text-red-500">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="short_description">Short Description</Label>
            <Input
              id="short_description"
              placeholder="One-liner about the course"
              {...register("short_description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Full Description</Label>
            <Textarea
              id="description"
              placeholder="Detailed course description..."
              rows={5}
              {...register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={watch("category_id") || ""}
                onValueChange={(val) => setValue("category_id", val ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select
                value={watch("language")}
                onValueChange={(val) =>
                  setValue("language", (val ?? "hinglish") as "hindi" | "english" | "hinglish")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hindi">Hindi</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="hinglish">Hinglish</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pricing
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="price">MRP (₹)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                {...register("price")}
              />
              {errors.price && (
                <p className="text-xs text-red-500">{errors.price.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_price">Discounted Price (₹)</Label>
              <Input
                id="discount_price"
                type="number"
                min={0}
                placeholder="Leave empty for no discount"
                {...register("discount_price")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validity_days">Validity (days)</Label>
              <Input
                id="validity_days"
                type="number"
                min={1}
                {...register("validity_days")}
              />
              {errors.validity_days && (
                <p className="text-xs text-red-500">
                  {errors.validity_days.message}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Media */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Media
          </h2>

          <div className="space-y-2">
            <Label>Thumbnail</Label>
            <div className="flex items-center gap-4">
              {thumbnailPreview ? (
                <div className="relative h-24 w-40 overflow-hidden rounded-lg border">
                  <Image
                    src={thumbnailPreview}
                    alt="Thumbnail preview"
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                  No thumbnail
                </div>
              )}
              <div>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleThumbnailChange}
                  className="w-auto text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  JPEG, PNG or WebP, max 2MB
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preview_video_url">Preview Video URL</Label>
            <Input
              id="preview_video_url"
              placeholder="https://..."
              {...register("preview_video_url")}
            />
          </div>
        </section>

        {/* SEO */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            SEO
          </h2>
          <div className="space-y-2">
            <Label htmlFor="meta_title">Meta Title</Label>
            <Input
              id="meta_title"
              placeholder="Page title for search engines"
              maxLength={70}
              {...register("meta_title")}
            />
            <p className="text-xs text-muted-foreground">
              {(watch("meta_title") || "").length}/70
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meta_description">Meta Description</Label>
            <Textarea
              id="meta_description"
              placeholder="Short description for search results"
              maxLength={160}
              rows={2}
              {...register("meta_description")}
            />
            <p className="text-xs text-muted-foreground">
              {(watch("meta_description") || "").length}/160
            </p>
          </div>
        </section>

        {/* Settings */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select
                value={watch("difficulty") || ""}
                onValueChange={(val) => setValue("difficulty", (val || null) as "easy" | "medium" | "hard" | null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="is_featured"
                checked={watch("is_featured")}
                onCheckedChange={(checked) => setValue("is_featured", checked)}
              />
              <Label htmlFor="is_featured" className="cursor-pointer">
                Featured Course
              </Label>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              handleSubmit((v) => onSubmit(v as unknown as CourseFormValues, "draft"))()
            }
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save as Draft
          </Button>
          <Button
            type="button"
            disabled={isPending}
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            onClick={() =>
              handleSubmit((v) => onSubmit(v as unknown as CourseFormValues, "published"))()
            }
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Publish
          </Button>
        </div>
      </form>
    </div>
  );
}
