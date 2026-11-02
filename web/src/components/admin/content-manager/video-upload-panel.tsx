"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Upload as TusUpload } from "tus-js-client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  attachBunnyVideo,
  createVideoUploadTicket,
  discardPendingVideo,
  getVideoHostingStatus,
  refreshVideoStatus,
  removeVideo,
  setExternalVideoUrl,
  type VideoState,
} from "@/app/admin/(panel)/content/manager/video-actions";
import type { ContentItem } from "@/types/database";

// Big enough that a 2 GB file is forty-odd requests rather than thousands,
// small enough that a dropped connection costs one chunk and not the hour
// before it.
const CHUNK_SIZE = 50 * 1024 * 1024;

// Bunny treats 409 and 423 as temporary conflicts and everything else in the
// 4xx range as final, so these delays only ever apply to those two and to
// network failures.
const RETRY_DELAYS = [0, 3000, 10000, 30000];

// Transcoding a long lesson takes minutes, not seconds. Ten is often enough
// to feel live without making a hundred calls while someone leaves the panel
// open over lunch.
const POLL_INTERVAL_MS = 10000;

interface Progress {
  fileName: string;
  sent: number;
  total: number;
  /** Bytes per second, smoothed. Null until two samples exist. */
  speed: number | null;
  paused: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSecond: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "—";
  if (bytesPerSecond < 1024 * 1024) {
    return `${Math.round(bytesPerSecond / 1024)} KB/s`;
  }
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatEta(progress: Progress): string {
  if (progress.paused) return "paused";
  if (!progress.speed || progress.speed <= 0) return "estimating…";
  const remaining = (progress.total - progress.sent) / progress.speed;
  return `${formatClock(remaining)} left`;
}

interface VideoUploadPanelProps {
  item: ContentItem;
  /** Lets the tree and the form see a row the video actions rewrote. */
  onItemChange?: (item: ContentItem) => void;
}

export function VideoUploadPanel({ item, onItemChange }: VideoUploadPanelProps) {
  const [mode, setMode] = useState<"upload" | "external">(
    item.video_provider === "external" ? "external" : "upload"
  );
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [video, setVideo] = useState<VideoState | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [externalUrl, setExternalUrlValue] = useState(item.file_url ?? "");

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<TusUpload | null>(null);
  const sampleRef = useRef<{ at: number; bytes: number } | null>(null);

  // The panel is keyed on the selected node, so switching lessons remounts it
  // rather than reusing this state. This only has to catch the case where the
  // same instance is handed a different id, and it stops an upload belonging
  // to the previous lesson from going on writing to it. Deliberately keyed on
  // the id alone: the row is rewritten by our own actions while an upload is
  // running, and watching those columns would abort the upload that caused it.
  useEffect(() => {
    return () => {
      const inFlight = uploadRef.current;
      uploadRef.current = null;
      if (inFlight) void inFlight.abort(false);
    };
  }, [item.id]);

  useEffect(() => {
    let active = true;

    getVideoHostingStatus().then((result) => {
      if (active) setConfigured(result.data?.configured ?? false);
    });

    return () => {
      active = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    const result = await refreshVideoStatus(item.id);
    if (result.error) return null;
    setVideo(result.data ?? null);
    return result.data ?? null;
  }, [item.id]);

  // The first read lands in the promise callback rather than in the effect
  // body. Calling a setState-ing function straight from the body cascades a
  // second render before the first has painted, which is what
  // react-hooks/set-state-in-effect objects to -- and it is an error here, so
  // `npm run lint` exited non-zero on a file this change set introduced.
  // Subscribing to an external system's answer is exactly the shape the rule
  // asks for, and it is the shape the effect above already uses.
  useEffect(() => {
    let active = true;

    void refreshVideoStatus(item.id).then((result) => {
      if (!active || result.error) return;
      setVideo(result.data ?? null);
    });

    return () => {
      active = false;
    };
  }, [item.id]);

  // While Bunny is still working, ask again until it stops being "processing".
  useEffect(() => {
    if (video?.status !== "processing") return;

    const timer = setInterval(() => void loadStatus(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [video?.status, loadStatus]);

  const applyRow = useCallback(
    (row: unknown) => {
      if (row && typeof row === "object") onItemChange?.(row as ContentItem);
    },
    [onItemChange]
  );

  const startUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/") && !/\.[a-z0-9]+$/i.test(file.name)) {
        toast.error("That does not look like a video file.");
        return;
      }

      setBusy(true);
      const ticket = await createVideoUploadTicket(
        item.id,
        file.name,
        file.size
      );
      setBusy(false);

      if (ticket.error || !ticket.data) {
        toast.error(ticket.error ?? "Could not start the upload.");
        return;
      }

      const { videoGuid, libraryId, endpoint, expire, signature } = ticket.data;
      sampleRef.current = null;

      setProgress({
        fileName: file.name,
        sent: 0,
        total: file.size,
        speed: null,
        paused: false,
      });

      const upload = new TusUpload(file, {
        endpoint,
        chunkSize: CHUNK_SIZE,
        retryDelays: RETRY_DELAYS,
        // Keeps the upload URL in local storage against a fingerprint of the
        // file, so picking the same file after a reload continues from where
        // the bytes stopped instead of sending the whole lesson again.
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,
        headers: {
          AuthorizationSignature: signature,
          AuthorizationExpire: String(expire),
          VideoId: videoGuid,
          LibraryId: libraryId,
        },
        metadata: {
          filetype: file.type || "video/mp4",
          title: file.name,
        },
        onProgress: (sent, total) => {
          const now = Date.now();
          const previous = sampleRef.current;
          sampleRef.current = { at: now, bytes: sent };

          setProgress((current) => {
            if (!current) return current;

            let speed = current.speed;
            if (previous && now > previous.at) {
              const instant =
                ((sent - previous.bytes) * 1000) / (now - previous.at);
              // Smoothed, or the number jitters so fast it cannot be read.
              speed =
                current.speed === null
                  ? instant
                  : current.speed * 0.7 + instant * 0.3;
            }

            return { ...current, sent, total, speed };
          });
        },
        onError: (error) => {
          console.error("video upload failed:", error);
          uploadRef.current = null;
          setProgress(null);
          toast.error(
            "Upload failed. Pick the same file again to carry on from where it stopped."
          );
        },
        onSuccess: () => {
          uploadRef.current = null;
          setProgress(null);

          void attachBunnyVideo(item.id, videoGuid, file.size).then(
            (result) => {
              if (result.error) {
                toast.error(result.error);
                return;
              }
              applyRow(result.data);
              toast.success("Upload finished — Bunny is processing it now");
              void loadStatus();
            }
          );
        },
      });

      const previous = await upload.findPreviousUploads();
      if (previous.length > 0) {
        upload.resumeFromPreviousUpload(previous[0]);
      }

      uploadRef.current = upload;
      upload.start();
    },
    [item.id, loadStatus, applyRow]
  );

  function pauseUpload() {
    const upload = uploadRef.current;
    if (!upload) return;

    void upload.abort(false);
    sampleRef.current = null;
    setProgress((current) =>
      current ? { ...current, paused: true, speed: null } : current
    );
  }

  function resumeUpload() {
    const upload = uploadRef.current;
    if (!upload) return;

    setProgress((current) => (current ? { ...current, paused: false } : current));
    upload.start();
  }

  async function cancelUpload() {
    const upload = uploadRef.current;
    uploadRef.current = null;
    setProgress(null);
    sampleRef.current = null;

    // `true` terminates the upload on Bunny's side as well, so the partial
    // file stops occupying the library.
    if (upload) await upload.abort(true).catch(() => undefined);

    const result = await discardPendingVideo(item.id);
    if (result.error) toast.error(result.error);
  }

  async function saveExternal() {
    setBusy(true);
    const result = await setExternalVideoUrl(item.id, externalUrl);
    setBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    applyRow(result.data);
    toast.success("Video URL saved");
    void loadStatus();
  }

  async function handleRemove() {
    setBusy(true);
    const result = await removeVideo(item.id);
    setBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    applyRow(result.data);
    setExternalUrlValue("");
    toast.success("Video removed");
    void loadStatus();
  }

  const hasBunnyVideo = video?.provider === "bunny" && !!video.videoGuid;
  const uploadDisabled = configured === false;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Video
      </p>

      {/* Where the video comes from */}
      <div className="flex flex-wrap gap-4">
        {(
          [
            ["upload", "Upload video"],
            ["external", "Link an external URL"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={cn(
              "flex items-center gap-2 text-sm",
              value === "upload" && uploadDisabled
                ? "cursor-not-allowed text-muted-foreground"
                : "cursor-pointer"
            )}
          >
            <input
              type="radio"
              name="video_source"
              value={value}
              checked={mode === value}
              disabled={value === "upload" && uploadDisabled}
              onChange={() => setMode(value)}
              className="h-3.5 w-3.5 accent-[var(--brand-orange,#F26A21)]"
            />
            {label}
          </label>
        ))}
      </div>

      {mode === "external" ? (
        <div className="space-y-2">
          <Label htmlFor="ci-video-url">Video URL</Label>
          <div className="flex gap-2">
            <Input
              id="ci-video-url"
              value={externalUrl}
              onChange={(e) => setExternalUrlValue(e.target.value)}
              placeholder="https://…"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void saveExternal()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            An external video streams as-is. It cannot be quality-switched or
            saved for offline use, because neither renditions nor a playback
            token exist for it.
          </p>
        </div>
      ) : uploadDisabled ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">
            Video hosting is not configured yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add the BUNNY_STREAM_* environment variables to upload videos. The
            external URL option works without them.
          </p>
        </div>
      ) : progress ? (
        /* An upload in flight */
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
          <div className="flex items-center gap-2 text-sm">
            {progress.paused ? (
              <Pause className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-orange" />
            )}
            <span className="min-w-0 flex-1 truncate">{progress.fileName}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {progress.total > 0
                ? Math.floor((progress.sent / progress.total) * 100)
                : 0}
              %
            </span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-brand-orange transition-[width] duration-300"
              style={{
                width: `${Math.max(
                  1,
                  progress.total > 0
                    ? (progress.sent / progress.total) * 100
                    : 0
                )}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <span>
              {formatBytes(progress.sent)} of {formatBytes(progress.total)}
            </span>
            <span>{formatSpeed(progress.speed)}</span>
            <span>{formatEta(progress)}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {progress.paused ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={resumeUpload}
              >
                <Play className="mr-1 h-3 w-3" />
                Resume
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={pauseUpload}
              >
                <Pause className="mr-1 h-3 w-3" />
                Pause
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-red-600"
              onClick={() => void cancelUpload()}
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            It is safe to leave this page. Come back, pick the same file again,
            and the upload carries on from where it stopped.
          </p>
        </div>
      ) : hasBunnyVideo ? (
        /* A video Bunny already holds */
        <div className="space-y-3">
          <div className="flex gap-3 rounded-lg border border-border p-3">
            <div className="h-16 w-28 shrink-0 overflow-hidden rounded bg-muted">
              {video.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <UploadCloud className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              {video.status === "processing" ? (
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-orange" />
                  Processing — {video.encodeProgress}%
                </p>
              ) : video.status === "failed" ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Transcoding failed
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready to play
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                {video.durationSeconds
                  ? formatClock(video.durationSeconds)
                  : "Duration pending"}
                {video.sizeBytes ? ` · ${formatBytes(video.sizeBytes)}` : ""}
              </p>

              {video.resolutions.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {video.resolutions.join(" · ")}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                title="Check status again"
                onClick={() => void loadStatus()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                title="Remove video"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {video.warning && (
            <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {video.warning}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <UploadCloud className="mr-2 h-3.5 w-3.5" />
            Replace video
          </Button>
          <p className="text-xs text-muted-foreground">
            The current video keeps playing until the replacement has finished
            uploading.
          </p>
        </div>
      ) : (
        /* Nothing uploaded yet */
        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(false);
            const picked = e.dataTransfer.files[0];
            if (picked) void startUpload(picked);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
            dropping
              ? "border-brand-orange bg-brand-orange/5"
              : "border-border bg-muted/20"
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-brand-orange" />
          ) : (
            <UploadCloud className="h-5 w-5 text-muted-foreground" />
          )}
          <p className="text-sm text-foreground">
            Drop a video here, or{" "}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="font-medium text-brand-orange underline-offset-2 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            MP4, MOV or MKV — up to 4 GB. The upload resumes if it is
            interrupted.
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void startUpload(picked);
        }}
      />
    </div>
  );
}
