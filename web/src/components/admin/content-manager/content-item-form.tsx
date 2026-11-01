"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateContentItem } from "@/app/admin/(panel)/content/manager/actions";
import { ContentFilesPanel } from "@/components/admin/content-manager/content-files-panel";
import { useContentTree } from "@/stores/content-tree";
import type { ContentItem } from "@/types/database";

export function ContentItemForm({ item }: { item: ContentItem }) {
  const [isPending, startTransition] = useTransition();
  const updateContentInTree = useContentTree((s) => s.updateContentItem);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const fields: Record<string, unknown> = {
      title: (fd.get("title") as string).trim(),
      type: fd.get("type") as string,
      description: (fd.get("description") as string) || null,
      is_paid: fd.get("is_paid") === "on",
      is_downloadable: fd.get("is_downloadable") === "on",
      is_printable: fd.get("is_printable") === "on",
      status: fd.get("status") as string,
    };

    const playLimit = fd.get("play_limit") as string;
    fields.play_limit = playLimit ? parseInt(playLimit) : null;

    const videoUrl = fd.get("video_url") as string;
    if (videoUrl) fields.file_url = videoUrl;

    const duration = fd.get("duration_seconds") as string;
    fields.duration_seconds = duration ? parseInt(duration) * 60 : null;

    if (!fields.title) return;

    startTransition(async () => {
      const result = await updateContentItem(item.id, fields);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.data) {
        updateContentInTree(result.data);
      }
      toast.success("Content updated");
    });
  }

  const isVideo = item.type === "video";
  // Everything but a quiz can carry files. A video lesson routinely ships with
  // the worked examples as a PDF alongside it.
  const showFiles = item.type !== "quiz";
  const hasReadingControls = ["pdf", "pyp", "note", "ebook"].includes(item.type);

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Edit Content Item</h2>
        <p className="text-xs text-muted-foreground">
          Configure the content item details and settings
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ci-title">Title</Label>
          <Input
            id="ci-title"
            name="title"
            defaultValue={item.title}
            placeholder="e.g. Introduction to Numbers"
          />
        </div>

        <div className="space-y-2">
          <Label>Type</Label>
          <Select name="type" defaultValue={item.type}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="quiz">Test / Quiz</SelectItem>
              <SelectItem value="ebook">Ebook</SelectItem>
              <SelectItem value="pyp">PYP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ci-desc">Description</Label>
        <Textarea
          id="ci-desc"
          name="description"
          defaultValue={item.description || ""}
          placeholder="Brief description of this content"
          rows={2}
        />
      </div>

      {/* Video-specific fields */}
      {isVideo && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Video Settings
          </p>
          <div className="space-y-2">
            <Label htmlFor="ci-video-url">Video URL</Label>
            <Input
              id="ci-video-url"
              name="video_url"
              defaultValue={item.file_url || ""}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-duration">Duration (minutes)</Label>
            <Input
              id="ci-duration"
              name="duration_seconds"
              type="number"
              min={0}
              defaultValue={
                item.duration_seconds
                  ? Math.round(item.duration_seconds / 60)
                  : ""
              }
              placeholder="e.g. 45"
            />
          </div>
        </div>
      )}

      {/* Files */}
      {showFiles && (
        <div className="space-y-4">
          <ContentFilesPanel contentId={item.id} />

          {hasReadingControls && (
            <div className="flex gap-6 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="ci-downloadable"
                  name="is_downloadable"
                  defaultChecked={item.is_downloadable}
                />
                <Label htmlFor="ci-downloadable" className="text-xs cursor-pointer">
                  Downloadable
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="ci-printable"
                  name="is_printable"
                  defaultChecked={item.is_printable}
                />
                <Label htmlFor="ci-printable" className="text-xs cursor-pointer">
                  Printable
                </Label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Common settings */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Settings
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select name="status" defaultValue={item.status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-play-limit">
              Play Limit{" "}
              <span className="text-muted-foreground font-normal">
                (empty = unlimited)
              </span>
            </Label>
            <Input
              id="ci-play-limit"
              name="play_limit"
              type="number"
              min={0}
              defaultValue={item.play_limit ?? ""}
              placeholder="Unlimited"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="ci-paid"
            name="is_paid"
            defaultChecked={item.is_paid}
          />
          <Label htmlFor="ci-paid" className="cursor-pointer">
            Paid content (requires enrollment)
          </Label>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="bg-brand-orange hover:bg-brand-orange-dark text-white"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Changes
      </Button>
    </form>
  );
}
