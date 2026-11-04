"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  removeLessonPoster,
  uploadLessonPoster,
} from "@/app/admin/(panel)/content/manager/video-actions";
import type { ContentItem } from "@/types/database";

/**
 * The poster a student sees before pressing play.
 *
 * Bunny picks a frame on its own and picks badly, so this replaces it. It is
 * also what a student who has not paid is shown in place of the player, which
 * is why it is required before a video can be published -- a paywalled lesson
 * advertising itself with a black frame sells nothing.
 *
 * The requirement is enforced by a database trigger rather than here, because
 * the scheduled-publishing cron never runs this code. This panel's job is to
 * say so before the admin finds out by being refused.
 */
export function PosterPanel({
  item,
  bunnyThumbnailUrl,
  onItemChange,
}: {
  item: ContentItem;
  /** Bunny's auto-picked frame, shown as the fallback while no poster is set. */
  bunnyThumbnailUrl: string | null;
  onItemChange?: (item: ContentItem) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const poster = item.poster_url;
  const blocksPublish = item.type === "video" && !poster;

  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Poster must be under 2 MB.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("poster", file);

      const result = await uploadLessonPoster(item.id, formData);

      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not upload that poster.");
        return;
      }

      onItemChange?.(result.data as ContentItem);
      toast.success("Poster saved");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await removeLessonPoster(item.id);

      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not remove that poster.");
        return;
      }

      onItemChange?.(result.data as ContentItem);
      toast.success("Poster removed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Poster
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown before play, and instead of the player for students who have
            not enrolled.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="h-24 w-44 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {poster ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : bunnyThumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={bunnyThumbnailUrl}
              alt=""
              className="h-full w-full object-cover opacity-60"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageUp className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">
            {poster
              ? "Your poster. Replacing it updates every surface at once."
              : bunnyThumbnailUrl
                ? "No poster set — Bunny's auto-picked frame is standing in."
                : "No poster set."}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageUp className="mr-1.5 h-3.5 w-3.5" />
              )}
              {poster ? "Replace poster" : "Upload poster"}
            </Button>

            {poster && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-red-600"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP or AVIF, up to 2 MB. 16:9 looks best.
          </p>
        </div>
      </div>

      {blocksPublish && (
        <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This video cannot be published until a poster is set. A lesson
          scheduled to go live will wait, not publish without one.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (picked) void upload(picked);
        }}
      />
    </div>
  );
}
