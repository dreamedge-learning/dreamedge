"use client";

import { useState, useTransition } from "react";
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
import { VideoUploadPanel } from "@/components/admin/content-manager/video-upload-panel";
import { useContentTree } from "@/stores/content-tree";
import type { ContentItem } from "@/types/database";

export function ContentItemForm({ item }: { item: ContentItem }) {
  const [isPending, startTransition] = useTransition();
  const updateContentInTree = useContentTree((s) => s.updateContentItem);

  // The licence field only means anything while offline is on, so the switch
  // has to be state rather than an uncontrolled input.
  const [downloadable, setDownloadable] = useState(item.is_downloadable);

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

    const duration = fd.get("duration_seconds") as string;
    fields.duration_seconds = duration ? parseInt(duration) * 60 : null;

    const licenceDays = fd.get("offline_license_days") as string;
    if (licenceDays) fields.offline_license_days = parseInt(licenceDays);

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
  const isQuiz = item.type === "quiz";
  // Everything but a quiz can carry files. A video lesson routinely ships with
  // the worked examples as a PDF alongside it.
  const showFiles = !isQuiz;
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

      {/* Video */}
      {isVideo && (
        <div className="space-y-4">
          <VideoUploadPanel item={item} onItemChange={updateContentInTree} />

          <div className="space-y-2 rounded-lg border border-border p-4">
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
            <p className="text-xs text-muted-foreground">
              {item.video_provider === "bunny" && item.duration_seconds
                ? "Measured from the uploaded file. Editing it overrides what Bunny reported."
                : "Shown on the lesson tile before the video has been measured."}
            </p>
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

        {/*
          Offline applies to every kind of content a student can keep -- a
          video as much as a PDF. Quizzes are the exception: they are scored
          server-side, so a downloaded one could be re-attempted with nothing
          recording it, and the app keeps tests online-only.
        */}
        {!isQuiz && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <Switch
                id="ci-downloadable"
                name="is_downloadable"
                checked={downloadable}
                onCheckedChange={setDownloadable}
              />
              <div className="space-y-0.5">
                <Label htmlFor="ci-downloadable" className="cursor-pointer">
                  Available offline in app
                </Label>
                <p className="text-xs text-muted-foreground">
                  Students can save this to their device and open it without
                  internet.
                </p>
              </div>
            </div>

            {downloadable && (
              <div className="space-y-2 sm:max-w-xs">
                <Label htmlFor="ci-offline-licence">Offline licence</Label>
                <Input
                  id="ci-offline-licence"
                  name="offline_license_days"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={item.offline_license_days}
                  placeholder="30"
                />
                <p className="text-xs text-muted-foreground">
                  Days a downloaded copy keeps working before the student must
                  reconnect once.
                </p>
              </div>
            )}
          </div>
        )}
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
