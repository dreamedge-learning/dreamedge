"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Copy,
  Archive,
  Trash2,
  Eye,
  EyeOff,
  Users,
  Calendar,
  Star,
  FolderTree,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR } from "@/lib/format";
import { deleteCourse, duplicateCourse, toggleCourseStatus } from "@/app/admin/(panel)/content/actions";
import { toast } from "sonner";
import type { CourseWithCategory } from "@/types/course";

const statusConfig = {
  draft: { label: "Draft", className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
  published: { label: "Published", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  archived: { label: "Archived", className: "bg-red-500/10 text-red-500 border-red-500/20" },
} as const;

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

export function CourseCard({ course }: { course: CourseWithCategory }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const statusKey = course.is_published ? "published" : "draft";
  const status = statusConfig[statusKey];

  async function handleDuplicate() {
    setLoading(true);
    const result = await duplicateCourse(course.id);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Course duplicated");
    }
  }

  async function handleStatusToggle() {
    const newStatus = course.is_published ? "draft" : "published";
    setLoading(true);
    const result = await toggleCourseStatus(course.id, newStatus);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(newStatus === "published" ? "Course published" : "Course unpublished");
    }
  }

  async function handleArchive() {
    setLoading(true);
    const result = await toggleCourseStatus(course.id, "archived");
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Course archived");
    }
  }

  async function handleDelete() {
    setLoading(true);
    const result = await deleteCourse(course.id);
    setLoading(false);
    setDeleteOpen(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Course deleted");
    }
  }

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-muted">
          {course.thumbnail_url ? (
            <Image
              src={course.thumbnail_url}
              alt={course.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-3xl font-bold text-muted-foreground/30">
                {course.title.charAt(0)}
              </span>
            </div>
          )}
          {course.is_featured && (
            <div className="absolute top-2 left-2">
              <Badge className="gap-1 bg-amber-500/90 text-white hover:bg-amber-500">
                <Star className="h-3 w-3" />
                Featured
              </Badge>
            </div>
          )}
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold leading-tight">
                {course.title}
              </h3>
              {course.course_categories && (
                <Badge variant="secondary" className="mt-1.5 text-xs font-normal">
                  {course.course_categories.name}
                </Badge>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={loading}
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  render={<Link href={`/admin/content/manager?course=${course.id}`} />}
                >
                  <FolderTree className="mr-2 h-4 w-4" />
                  Manage content
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`/admin/content/courses/${course.id}/edit`} />}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleStatusToggle}>
                  {course.is_published ? (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Publish
                    </>
                  )}
                </DropdownMenuItem>
                {!course.is_published && (
                  <DropdownMenuItem onClick={handleArchive}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500 focus:text-red-500"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Stats */}
          <div className="mt-auto flex items-center gap-4 pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {course.enrollment_count}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {course.created_at ? formatDate(course.created_at) : "—"}
            </span>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-2 border-t border-border pt-3 mt-1">
            {course.original_price !== null && course.original_price > course.price ? (
              <>
                <span className="text-sm font-bold text-brand-orange">
                  {formatINR(course.price)}
                </span>
                <span className="text-xs text-muted-foreground line-through">
                  {formatINR(course.original_price)}
                </span>
              </>
            ) : (
              <span className="text-sm font-bold">
                {course.price === 0 ? "Free" : formatINR(course.price)}
              </span>
            )}
          </div>

          {/* The course's folders and lessons. This was reachable only through
              Content Manager and a dropdown, so from the course itself there
              was no visible way in. */}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            render={<Link href={`/admin/content/manager?course=${course.id}`} />}
          >
            <FolderTree className="mr-1.5 h-3.5 w-3.5" />
            Manage content
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete course?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{course.title}&rdquo;. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
