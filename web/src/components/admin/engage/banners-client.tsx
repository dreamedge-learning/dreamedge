"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ImageIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExportButton } from "@/components/admin/export-button";
import { BannerFormDialog } from "./banner-form";
import { deleteBanner, toggleBannerActive } from "@/app/admin/(panel)/engage/actions";

export interface BannerRow {
  id: string;
  title: string;
  image_url: string;
  action_url: string | null;
  position: string;
  is_active: boolean;
  weight: number;
  starts_at: string | null;
  ends_at: string | null;
}

const POSITION_LABELS: Record<string, string> = {
  home_top: "Home — top",
  home_bottom: "Home — bottom",
  course_page: "Course page",
  dashboard: "Student dashboard",
};

/** A banner can be active yet outside its window, which is not the same thing. */
function scheduleNote(b: BannerRow): string | null {
  const now = Date.now();
  if (b.starts_at && new Date(b.starts_at).getTime() > now) {
    return `Scheduled for ${new Date(b.starts_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}`;
  }
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) {
    return "Expired";
  }
  if (b.ends_at) {
    return `Until ${new Date(b.ends_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}`;
  }
  return null;
}

export function BannersClient({ initialData }: { initialData: BannerRow[] }) {
  const router = useRouter();
  const banners = initialData;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BannerRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(banner: BannerRow, next: boolean) {
    startTransition(async () => {
      const result = await toggleBannerActive(banner.id, next);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Banner is live." : "Banner hidden.");
      router.refresh();
    });
  }

  function handleDelete() {
    const target = pendingDelete;
    if (!target) return;

    startTransition(async () => {
      const result = await deleteBanner(target.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setPendingDelete(null);
      toast.success("Banner deleted.");
      router.refresh();
    });
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banners</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Promotional artwork shown on the website and in the app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton dataset="banners" size="default" />
          <Button
            onClick={openNew}
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Banner
          </Button>
        </div>
      </div>

      {banners.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No banners yet"
          description="Add artwork to promote a course or an offer."
          action={
            <Button
              onClick={openNew}
              className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add the first banner
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banners.map((b) => {
            const note = scheduleNote(b);
            return (
              <div key={b.id} className="overflow-hidden rounded-lg border">
                <div className="relative aspect-[16/7] bg-muted">
                  <Image
                    src={b.image_url}
                    alt={b.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {POSITION_LABELS[b.position] ?? b.position}
                      </p>
                    </div>
                    <Switch
                      checked={b.is_active}
                      onCheckedChange={(next) => handleToggle(b, next)}
                      disabled={isPending}
                      aria-label={`${b.is_active ? "Hide" : "Show"} ${b.title}`}
                    />
                  </div>

                  {note && <Badge variant="secondary">{note}</Badge>}

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(b);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(b)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BannerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editData={editing}
        onSaved={() => router.refresh()}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this banner?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stop appearing immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
