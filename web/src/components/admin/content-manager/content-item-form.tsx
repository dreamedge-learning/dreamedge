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

/**
 * An ISO timestamp as a `datetime-local` value, in the admin's own timezone.
 *
 * `toISOString` would render the UTC instant, so an admin in IST setting 6 pm
 * would reopen the lesson and read 12:30 pm. The input has no timezone of its
 * own, so the conversion has to happen on both edges.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The chosen moment, written out in the admin's own timezone.
 *
 * An absolute date rather than "in 3 days": a relative string needs the
 * current time, and reading the clock while rendering is impure -- the React
 * compiler refuses it, and rightly, because the output would differ between
 * two renders with identical props. It also reads better on a paid lesson,
 * where "in 3 days" leaves the actual hour to be worked out.
 */
function describeMoment(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function ContentItemForm({ item }: { item: ContentItem }) {
  const [isPending, startTransition] = useTransition();
  const updateContentInTree = useContentTree((s) => s.updateContentItem);

  // Saving refreshes `item` from the tree, so a Select left uncontrolled would
  // see its defaultValue change after mount. Base UI warns about that, and the
  // trigger can fall out of step with the row. Both selects are controlled.
  const [type, setType] = useState<string>(item.type);
  const [status, setStatus] = useState<string>(item.status);

  // A draft carrying a date is what "scheduled" means -- there is no fourth
  // status. Held in local-input form because that is what the control reads.
  const [publishAt, setPublishAt] = useState<string>(toLocalInput(item.publish_at));

  // The licence field only means anything while offline is on, so the switch
  // has to be state rather than an uncontrolled input.
  const [downloadable, setDownloadable] = useState(item.is_downloadable);

  // These decide what is on screen, and so they also decide what a save is
  // allowed to write. They come from the live `type` state rather than from
  // `item.type`: the saved row is one step behind the Select, so changing an
  // item from PDF to Video used to show no video panel until a save had
  // round-tripped.
  const isVideo = type === "video";
  const isQuiz = type === "quiz";
  // Everything but a quiz can carry files. A video lesson routinely ships with
  // the worked examples as a PDF alongside it.
  const showFiles = !isQuiz;
  const hasReadingControls = ["pdf", "pyp", "note", "ebook"].includes(type);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const fields: Record<string, unknown> = {
      title: (fd.get("title") as string).trim(),
      // From the controlled state, not from FormData. These two selects are
      // controlled, so the state is the value; reading them back out of the
      // form is a second source of truth that can only ever disagree.
      type,
      status,
      description: (fd.get("description") as string) || null,
      is_paid: fd.get("is_paid") === "on",
      // Only a draft can be waiting for a date. Anything else clears it, so a
      // published lesson never shows a stale "goes live" time -- and the
      // server applies the same rule, because this form is not the only
      // caller of the updater.
      publish_at:
        status === "draft" && publishAt
          ? new Date(publishAt).toISOString()
          : null,
    };

    const playLimit = fd.get("play_limit") as string;
    fields.play_limit = playLimit ? parseInt(playLimit) : null;

    // A control that was never rendered is absent from FormData, and
    // `null === "on"` is false -- so reading a switch unconditionally does not
    // read the admin's choice, it overwrites the stored value with false.
    //
    // `is_printable` was the visible case: the switch renders only for a
    // reading type, so every save of a video or a quiz silently wrote
    // printable = false. Harmless while printing means nothing for a video,
    // and real data loss the moment a reading type is added or the condition
    // is widened. `is_downloadable` and `duration_seconds` had the same shape:
    // saving a quiz cleared the offline flag, and saving a PDF wiped whatever
    // duration the row carried.
    //
    // So each field is written only when the control that owns it was on
    // screen, driven by the same flags that put it there.
    if (!isQuiz) {
      fields.is_downloadable = fd.get("is_downloadable") === "on";

      const licenceDays = fd.get("offline_license_days") as string;
      if (licenceDays) fields.offline_license_days = parseInt(licenceDays);
    }

    if (showFiles && hasReadingControls) {
      fields.is_printable = fd.get("is_printable") === "on";
    }

    if (isVideo) {
      const duration = fd.get("duration_seconds") as string;
      fields.duration_seconds = duration ? parseInt(duration) * 60 : null;
    }

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
          <Select
            name="type"
            value={type}
            onValueChange={(v) => setType(v as string)}
          >
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
            <Select
              name="status"
              value={status}
              onValueChange={(v) => setStatus(v as string)}
            >
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

          {status === "draft" && (
            <div className="space-y-2">
              <Label htmlFor="ci-publish-at">
                Go live at{" "}
                <span className="font-normal text-muted-foreground">
                  (empty = stays a draft)
                </span>
              </Label>
              <Input
                id="ci-publish-at"
                type="datetime-local"
                value={publishAt}
                onChange={(event) => setPublishAt(event.target.value)}
              />
              {publishAt && describeMoment(publishAt) && (
                <p className="text-xs text-brand-orange">
                  Publishes automatically on {describeMoment(publishAt)}. The
                  date has to be in the future.
                </p>
              )}
            </div>
          )}

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
