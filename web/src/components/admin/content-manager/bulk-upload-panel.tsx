"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Film,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Upload as TusUpload } from "tus-js-client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useContentTree } from "@/stores/content-tree";
import type { ContentItem } from "@/types/database";

import { bulkCreateContentItems } from "@/app/admin/(panel)/content/manager/actions";
import {
  createUploadTicket,
  registerContentFile,
} from "@/app/admin/(panel)/content/manager/file-actions";
import {
  attachBunnyVideo,
  createVideoUploadTicket,
} from "@/app/admin/(panel)/content/manager/video-actions";

/**
 * Many lessons in one pass.
 *
 * The single-item panels upload into a lesson that already exists. This goes
 * the other way: the files decide what lessons there are. Each file becomes one
 * draft content item named after it, and the queue then fills them.
 *
 * Deliberately draft, always. Thirty lessons going live the moment their bytes
 * land is not something anyone would ask for, and the scheduling control on
 * each item is there for when they should.
 */

const VIDEO_EXTENSIONS = /\.(mp4|mov|mkv|webm|avi|m4v|mpg|mpeg|wmv|flv)$/i;
const MAX_FILES = 50;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024;

// Two at a time. One wastes a fast line; six share a slow one so thinly that
// every lesson finishes late and a dropped connection costs six resumes.
const CONCURRENCY = 2;

const CHUNK_SIZE = 50 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 10000, 30000];

type RowStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "attaching"
  | "done"
  | "failed";

interface Row {
  key: string;
  file: File;
  title: string;
  /** `video` goes to Bunny; everything else to the documents bucket. */
  kind: "video" | "document";
  contentType: "video" | "pdf" | "note";
  itemId: string | null;
  status: RowStatus;
  progress: number;
  error: string | null;
}

/**
 * A filename as a lesson title.
 *
 * Strips the extension and any leading track number, which is how exported
 * lecture files are almost always named ("01 - Rational Numbers.mp4"), then
 * turns separators into spaces. Not clever about capitalisation: guessing
 * wrong on "pH" or "BODMAS" is worse than leaving what the file said.
 */
function titleFromFile(name: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  return (
    withoutExtension
      .replace(/^[\s]*\d{1,3}[\s._)\-]+/, "")
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || withoutExtension.slice(0, 200)
  );
}

function classify(file: File): Pick<Row, "kind" | "contentType"> {
  if (file.type.startsWith("video/") || VIDEO_EXTENSIONS.test(file.name)) {
    return { kind: "video", contentType: "video" };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return { kind: "document", contentType: "pdf" };
  }
  return { kind: "document", contentType: "note" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function putFile(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

export function BulkUploadPanel({ topicId }: { topicId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [dropping, setDropping] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadsRef = useRef<Map<string, TusUpload>>(new Map());
  const cancelledRef = useRef(false);

  const addContentItem = useContentTree((s) => s.addContentItem);

  const patch = useCallback((key: string, changes: Partial<Row>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row))
    );
  }, []);

  function addFiles(incoming: File[]) {
    const accepted: Row[] = [];
    const rejected: string[] = [];

    for (const file of incoming) {
      const { kind, contentType } = classify(file);
      const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_DOCUMENT_BYTES;

      if (file.size === 0) {
        rejected.push(`${file.name} is empty`);
        continue;
      }
      if (file.size > limit) {
        rejected.push(
          `${file.name} is over the ${kind === "video" ? "4 GB" : "40 MB"} limit`
        );
        continue;
      }

      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        title: titleFromFile(file.name),
        kind,
        contentType,
        itemId: null,
        status: "queued",
        progress: 0,
        error: null,
      });
    }

    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? rejected[0]
          : `${rejected.length} files skipped: ${rejected[0]}, …`
      );
    }

    setRows((current) => {
      const next = [...current, ...accepted];
      if (next.length > MAX_FILES) {
        toast.error(`Only ${MAX_FILES} files at a time.`);
        return next.slice(0, MAX_FILES);
      }
      return next;
    });
  }

  /** Uploads one row's file into the content item it was paired with. */
  const sendOne = useCallback(
    async (row: Row, itemId: string) => {
      if (row.kind === "video") {
        const ticket = await createVideoUploadTicket(
          itemId,
          row.file.name,
          row.file.size
        );
        if (ticket.error || !ticket.data) {
          throw new Error(ticket.error ?? "Could not start the upload.");
        }

        const { videoGuid, libraryId, endpoint, expire, signature } = ticket.data;

        await new Promise<void>((resolve, reject) => {
          const upload = new TusUpload(row.file, {
            endpoint,
            chunkSize: CHUNK_SIZE,
            retryDelays: RETRY_DELAYS,
            storeFingerprintForResuming: true,
            removeFingerprintOnSuccess: true,
            // Scoped to the video GUID for the same reason the single-item
            // panel does it: a remembered upload URL must never be replayed
            // against a different video.
            fingerprint: async (file) =>
              ["bunny", videoGuid, file.name, file.size, file.lastModified].join("/"),
            headers: {
              AuthorizationSignature: signature,
              AuthorizationExpire: String(expire),
              VideoId: videoGuid,
              LibraryId: libraryId,
            },
            metadata: { filetype: row.file.type || "video/mp4", title: row.file.name },
            onProgress: (sent, total) =>
              patch(row.key, { progress: total > 0 ? sent / total : 0 }),
            onError: (error) => reject(error),
            onSuccess: () => resolve(),
          });

          uploadsRef.current.set(row.key, upload);
          void upload.findPreviousUploads().then((previous) => {
            if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
          });
        });

        uploadsRef.current.delete(row.key);
        patch(row.key, { status: "attaching", progress: 1 });

        const attached = await attachBunnyVideo(itemId, videoGuid, row.file.size);
        if (attached.error) throw new Error(attached.error);
        return;
      }

      const ticket = await createUploadTicket(
        itemId,
        row.file.name,
        row.file.size,
        row.file.type || null
      );
      if (ticket.error || !ticket.data) {
        throw new Error(ticket.error ?? "Could not start the upload.");
      }

      await putFile(ticket.data.signedUrl, row.file);
      patch(row.key, { status: "attaching", progress: 1 });

      const registered = await registerContentFile(
        itemId,
        ticket.data.path,
        row.file.name,
        row.file.size,
        row.file.type || null
      );
      if (registered.error) throw new Error(registered.error);
    },
    [patch]
  );

  /**
   * Creates the lessons, then fills them.
   *
   * The lessons are created in one call before any bytes move, so the tree
   * shows the whole batch straight away and a failure halfway leaves lessons
   * an admin can see and retry rather than files with nowhere to go.
   */
  async function start() {
    const pending = rows.filter((row) => row.status === "queued" || row.status === "failed");
    if (pending.length === 0) return;

    cancelledRef.current = false;
    setRunning(true);

    const needItems = pending.filter((row) => row.itemId === null);
    const paired = new Map<string, string>();

    if (needItems.length > 0) {
      setRows((current) =>
        current.map((row) =>
          needItems.some((p) => p.key === row.key)
            ? { ...row, status: "creating", error: null }
            : row
        )
      );

      const created = await bulkCreateContentItems(
        topicId,
        needItems.map((row) => ({ title: row.title, type: row.contentType }))
      );

      if (created.error || !created.data) {
        setRows((current) =>
          current.map((row) =>
            needItems.some((p) => p.key === row.key)
              ? { ...row, status: "failed", error: created.error ?? "Could not create the lessons." }
              : row
          )
        );
        setRunning(false);
        toast.error(created.error ?? "Could not create the lessons.");
        return;
      }

      created.data.forEach((item, index) => {
        const row = needItems[index];
        if (!row) return;
        paired.set(row.key, item.id);
        addContentItem(topicId, item as ContentItem);
      });
    }

    for (const row of pending) {
      if (row.itemId) paired.set(row.key, row.itemId);
    }

    setRows((current) =>
      current.map((row) =>
        paired.has(row.key)
          ? { ...row, itemId: paired.get(row.key)!, status: "uploading", progress: 0 }
          : row
      )
    );

    // A fixed pool rather than Promise.all: twenty simultaneous uploads is a
    // slower batch than two at a time on every connection Rahul Sir will use.
    const todo = pending.filter((row) => paired.has(row.key));
    let cursor = 0;
    // Counted here rather than read back off `rows` at the end: `rows` in this
    // closure is the array from the render that started the batch, so every
    // status it reports is the one from before a single file moved.
    let failed = 0;

    async function worker() {
      while (cursor < todo.length) {
        if (cancelledRef.current) return;
        const row = todo[cursor++];
        const itemId = paired.get(row.key)!;

        try {
          await sendOne(row, itemId);
          if (!cancelledRef.current) {
            patch(row.key, { status: "done", progress: 1, error: null });
          }
        } catch (error) {
          uploadsRef.current.delete(row.key);
          if (cancelledRef.current) return;
          failed += 1;
          patch(row.key, {
            status: "failed",
            error: error instanceof Error ? error.message : "Upload failed.",
          });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, todo.length) }, () => worker())
    );

    setRunning(false);

    if (!cancelledRef.current) {
      if (failed > 0) {
        toast.error(`Batch finished — ${failed} need another go.`);
      } else {
        toast.success(
          "All files uploaded. The lessons are drafts until you publish them."
        );
      }
    }
  }

  function cancelAll() {
    cancelledRef.current = true;
    for (const upload of uploadsRef.current.values()) {
      void upload.abort(false).catch(() => undefined);
    }
    uploadsRef.current.clear();
    setRunning(false);
    setRows((current) =>
      current.map((row) =>
        row.status === "uploading" || row.status === "creating" || row.status === "attaching"
          ? { ...row, status: "failed", error: "Cancelled." }
          : row
      )
    );
  }

  const pendingCount = rows.filter(
    (row) => row.status === "queued" || row.status === "failed"
  ).length;
  const doneCount = rows.filter((row) => row.status === "done").length;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Bulk upload
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            One draft lesson per file, named from the filename. Videos go to
            Bunny, documents to storage.
          </p>
        </div>
        {rows.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {doneCount}/{rows.length} done
          </span>
        )}
      </div>

      <div
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDropping(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dropping ? "border-brand-orange bg-brand-orange/5" : "border-border bg-muted/20"
        )}
      >
        <UploadCloud className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm">
          Drop files here, or{" "}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="font-medium text-brand-orange underline-offset-2 hover:underline"
          >
            browse
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          Up to {MAX_FILES} at a time — video to 4 GB, documents to 40 MB
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2"
            >
              {row.kind === "video" ? (
                <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}

              <div className="min-w-0 flex-1">
                {row.status === "queued" ? (
                  <Input
                    value={row.title}
                    onChange={(event) => patch(row.key, { title: event.target.value })}
                    className="h-7 text-sm"
                    maxLength={200}
                  />
                ) : (
                  <p className="truncate text-sm">{row.title}</p>
                )}

                <p className="truncate text-xs text-muted-foreground">
                  {formatBytes(row.file.size)}
                  {row.status === "uploading" &&
                    ` · ${Math.floor(row.progress * 100)}%`}
                  {row.status === "attaching" && " · finishing"}
                  {row.status === "creating" && " · creating lesson"}
                  {row.error && ` · ${row.error}`}
                </p>

                {row.status === "uploading" && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-brand-orange transition-[width] duration-300"
                      style={{ width: `${Math.max(1, row.progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {row.status === "done" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                {row.status === "failed" && (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                )}
                {(row.status === "uploading" ||
                  row.status === "creating" ||
                  row.status === "attaching") && (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-orange" />
                )}
                {(row.status === "queued" || row.status === "failed") && !running && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((current) => current.filter((r) => r.key !== row.key))
                    }
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${row.title}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={running || pendingCount === 0}
            onClick={() => void start()}
            className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {rows.some((row) => row.status === "failed") && !running ? (
              <>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Retry {pendingCount}
              </>
            ) : (
              `Upload ${pendingCount} file${pendingCount === 1 ? "" : "s"}`
            )}
          </Button>

          {running ? (
            <Button type="button" variant="outline" onClick={cancelAll}>
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows([])}
              className="text-muted-foreground"
            >
              Clear list
            </Button>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (picked.length > 0) addFiles(picked);
        }}
      />
    </div>
  );
}
