"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  GripVertical,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  createUploadTicket,
  deleteContentFile,
  listContentFiles,
  registerContentFile,
  renameContentFile,
  reorderContentFiles,
  replaceContentFile,
  type ContentFile,
} from "@/app/admin/(panel)/content/manager/file-actions";

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.epub,.zip,.png,.jpg,.jpeg";

interface Upload {
  key: string;
  name: string;
  progress: number;
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * PUTs a file straight at storage, reporting progress as it goes.
 *
 * `fetch` cannot report upload progress, and a 40 MB booklet uploading behind
 * a bar that does not move reads as a hang, so this stays on XHR.
 */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));

    xhr.send(file);
  });
}

export function ContentFilesPanel({ contentId }: { contentId: string }) {
  const [files, setFiles] = useState<ContentFile[]>([]);
  // Which item the list in state belongs to. Derived rather than a `loading`
  // flag, so switching items in the tree never shows the previous item's
  // files for a frame.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dropping, setDropping] = useState(false);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacingId = useRef<string | null>(null);

  const loading = loadedId !== contentId;

  useEffect(() => {
    let active = true;

    listContentFiles(contentId).then((result) => {
      if (!active) return;
      if (result.error) toast.error(result.error);

      setFiles(result.data ?? []);
      setLoadedId(contentId);
    });

    return () => {
      active = false;
    };
  }, [contentId]);

  /** Signs, uploads, and reports where the object landed. */
  const sendToStorage = useCallback(
    async (file: File, key: string) => {
      const ticket = await createUploadTicket(
        contentId,
        file.name,
        file.size,
        file.type || null
      );
      if (ticket.error || !ticket.data) {
        throw new Error(ticket.error ?? "Could not start the upload.");
      }

      await putWithProgress(ticket.data.signedUrl, file, (fraction) => {
        setUploads((current) =>
          current.map((u) => (u.key === key ? { ...u, progress: fraction } : u))
        );
      });

      return ticket.data.path;
    },
    [contentId]
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      for (const file of incoming) {
        const key = `${file.name}-${Date.now()}-${Math.random()}`;
        setUploads((current) => [
          ...current,
          { key, name: file.name, progress: 0 },
        ]);

        try {
          const path = await sendToStorage(file, key);
          const result = await registerContentFile(
            contentId,
            path,
            file.name,
            file.size,
            file.type || null
          );

          if (result.error || !result.data) {
            toast.error(result.error ?? "Could not save that file.");
          } else {
            const saved = result.data;
            setFiles((current) => [...current, saved]);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed.");
        } finally {
          setUploads((current) => current.filter((u) => u.key !== key));
        }
      }
    },
    [contentId, sendToStorage]
  );

  async function handleReplace(file: File) {
    const fileId = replacingId.current;
    if (!fileId) return;

    const key = `replace-${fileId}-${Date.now()}`;
    setUploads((current) => [
      ...current,
      { key, name: file.name, progress: 0 },
    ]);

    try {
      const path = await sendToStorage(file, key);
      const result = await replaceContentFile(
        fileId,
        path,
        file.size,
        file.type || null
      );

      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not replace that file.");
      } else {
        const saved = result.data;
        setFiles((current) =>
          current.map((f) => (f.id === saved.id ? saved : f))
        );
        toast.success("File replaced");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploads((current) => current.filter((u) => u.key !== key));
      replacingId.current = null;
    }
  }

  async function handleDelete(fileId: string) {
    const previous = files;
    setFiles((current) => current.filter((f) => f.id !== fileId));
    setConfirmId(null);

    const result = await deleteContentFile(fileId);
    if (result.error) {
      setFiles(previous);
      toast.error(result.error);
      return;
    }
    toast.success("File removed");
  }

  async function commitRename(fileId: string) {
    const name = editValue.trim();
    setEditingId(null);

    const current = files.find((f) => f.id === fileId);
    if (!current || !name || name === current.display_name) return;

    setFiles((list) =>
      list.map((f) => (f.id === fileId ? { ...f, display_name: name } : f))
    );

    const result = await renameContentFile(fileId, name);
    if (result.error) {
      setFiles((list) =>
        list.map((f) => (f.id === fileId ? current : f))
      );
      toast.error(result.error);
    }
  }

  async function commitOrder(next: ContentFile[]) {
    const previous = files;
    setFiles(next);

    const result = await reorderContentFiles(
      contentId,
      next.map((f) => f.id)
    );
    if (result.error) {
      setFiles(previous);
      toast.error(result.error);
    }
  }

  function handleRowDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }

    const next = [...files];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);

    setDragIndex(null);
    setOverIndex(null);
    void commitOrder(next);
  }

  const busy = uploads.length > 0;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Files
        </p>
        {files.length > 1 && (
          <p className="text-xs text-muted-foreground">
            First file is shown in the player; drag to reorder
          </p>
        )}
      </div>

      {/* Drop zone */}
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
          void addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dropping
            ? "border-brand-orange bg-brand-orange/5"
            : "border-border bg-muted/20"
        )}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-foreground">
          Drop files here, or{" "}
          <button
            type="button"
            onClick={() => addRef.current?.click()}
            className="font-medium text-brand-orange underline-offset-2 hover:underline"
          >
            browse
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, Word, PowerPoint, ePub or images — up to 40 MB each
        </p>
      </div>

      <input
        ref={addRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length) void addFiles(picked);
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void handleReplace(picked);
        }}
      />

      {/* In-flight uploads */}
      {uploads.map((upload) => (
        <div
          key={upload.key}
          className="space-y-1.5 rounded-md border border-border bg-muted/30 px-3 py-2.5"
        >
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-orange" />
            <span className="min-w-0 flex-1 truncate">{upload.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(upload.progress * 100)}%
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-brand-orange transition-[width] duration-200"
              style={{ width: `${Math.max(2, upload.progress * 100)}%` }}
            />
          </div>
        </div>
      ))}

      {/* A lesson whose only documents are PowerPoint or Word originals shows
          students nothing at all, since those are never served to them. Said
          here, where the files are, instead of discovered by a student. */}
      {!loading &&
        files.some((f) => f.is_source_document) &&
        !files.some((f) => !f.is_source_document) && (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Students can&rsquo;t see this lesson&rsquo;s files yet. PowerPoint and Word files are
              kept for teachers only &mdash; export the same file as PDF and upload that too.
            </span>
          </div>
        )}

      {/* The list */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading files…</p>
      ) : files.length === 0 && !busy ? (
        <p className="text-xs text-muted-foreground">
          No files attached yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={file.id}
              draggable={editingId !== file.id}
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDrop={() => handleRowDrop(index)}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 transition-colors",
                dragIndex === index && "opacity-50",
                overIndex === index && dragIndex !== index
                  ? "border-brand-orange"
                  : "border-border"
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <FileText className="h-4 w-4 shrink-0 text-brand-orange" />

              {editingId === file.id ? (
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => void commitRename(file.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitRename(file.id);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 flex-1 text-sm"
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {file.display_name}
                  </span>
                  {file.is_source_document && (
                    <span
                      className="shrink-0 rounded border border-zinc-500/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title="Students never receive this file. Upload a PDF export for them."
                    >
                      Teachers only
                    </span>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatSize(file.size_bytes)}
                  </span>
                </>
              )}

              {confirmId === file.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-xs text-muted-foreground">Remove?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 bg-red-600 px-2 text-xs text-white hover:bg-red-700"
                    onClick={() => void handleDelete(file.id)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                editingId !== file.id && (
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Rename"
                      onClick={() => {
                        setEditValue(file.display_name);
                        setEditingId(file.id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Replace with another file"
                      onClick={() => {
                        replacingId.current = file.id;
                        replaceRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                      title="Remove"
                      onClick={() => setConfirmId(file.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
