"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Library,
  Menu,
  Notebook,
  Play,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Course } from "@/types/course";
import { getYouTubeId, isVideoFile } from "@/lib/video";
import { HostedVideoPlayer } from "@/components/student/courses/hosted-video-player";
import {
  markContentComplete,
  updateContentProgress,
  type ProgressStatus,
} from "@/app/(student)/courses/[slug]/learn/actions";

/* -------------------------------------------------------------------------- */
/* Types — the real content hierarchy: course > subject > topic > content_item */
/* -------------------------------------------------------------------------- */

export type ContentItemType =
  | "video"
  | "pdf"
  | "note"
  | "ebook"
  | "pyp"
  | "quiz";

export interface ContentProgress {
  status: ProgressStatus;
  progressPct: number;
  lastPositionSeconds: number;
}

export interface ContentAttachment {
  id: string;
  name: string;
  /** Lowercased, no dot. Decides whether the player can embed the file. */
  ext: string | null;
  sizeBytes: number;
  /** Always our own route -- the bucket itself is unreachable. */
  url: string;
}

export interface SyllabusContentItem {
  id: string;
  topic_id: string;
  type: ContentItemType;
  title: string;
  description: string | null;
  /** A link to media hosted elsewhere. Our own uploads live in `files`. */
  file_url: string | null;
  /** 'none', 'bunny' (hosted by us) or 'external'. */
  video_provider: string;
  /** Bunny's transcode state: 'none', 'processing', 'ready' or 'failed'. */
  video_status: string;
  /**
   * Everything uploaded against this item, in the order the admin arranged
   * them. The first is what the player shows; the rest are offered below it.
   */
  files: ContentAttachment[];
  video_id: string | null;
  duration_seconds: number | null;
  is_paid: boolean;
  is_downloadable: boolean;
  is_printable: boolean;
  play_limit: number | null;
  weight: number;
  progress: ContentProgress | null;
}

/** A folder. Folders nest to any depth; `folders` are its subfolders. */
export interface SyllabusTopic {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  folders: SyllabusTopic[];
  items: SyllabusContentItem[];
}

/**
 * Every lesson in a folder and its subfolders, in the order the sidebar shows
 * them: subfolders first, then the folder's own lessons. Previous / Next and
 * "resume where you left off" walk this same order, so the buttons never skip
 * a lesson the sidebar lists between two others.
 */
function folderItems(folder: SyllabusTopic): SyllabusContentItem[] {
  return [...folder.folders.flatMap(folderItems), ...folder.items];
}

function subjectItems(subject: SyllabusSubject): SyllabusContentItem[] {
  return subject.topics.flatMap(folderItems);
}

export interface SyllabusSubject {
  id: string;
  name: string;
  color_code: string | null;
  weight: number;
  topics: SyllabusTopic[];
}

interface LearnContentProps {
  course: Course;
  subjects: SyllabusSubject[];
  /**
   * Content item id to open on first paint. Used by the live-class
   * rewatch deep-link; the page passes the id from `?content=` through,
   * and this component opens the player on that item if it exists in
   * the syllabus.
   */
  initialContentId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TYPE_ICON = {
  video: Play,
  pdf: FileText,
  note: Notebook,
  ebook: BookOpen,
  pyp: ScrollText,
  quiz: ClipboardList,
} as const;

const TYPE_LABEL: Record<ContentItemType, string> = {
  video: "Video",
  pdf: "PDF",
  note: "Notes",
  ebook: "E-book",
  pyp: "Previous year paper",
  quiz: "Quiz",
};

const DOCUMENT_TYPES: ContentItemType[] = ["pdf", "ebook", "pyp"];

/** Send a progress ping at most this often while a video plays. */
const PING_INTERVAL_MS = 15_000;
/** ...and only once the watched share has actually moved. */
const PING_MIN_DELTA_PCT = 2;

function iconFor(type: ContentItemType) {
  return TYPE_ICON[type] ?? FileText;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${Math.max(1, totalMinutes)} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/** Only let through values that are safe to drop into a style attribute. */
function safeColor(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : undefined;
}

type VideoSource =
  | { kind: "file"; src: string }
  | { kind: "youtube"; src: string }
  | { kind: "embed"; src: string }
  | { kind: "none" };

/**
 * Where a video that is not hosted by us comes from.
 *
 * A video on Bunny never reaches here: it has no stored URL at all, because
 * its address is signed per request and expires. `HostedVideoPlayer` asks the
 * API for one. This covers what is left -- a YouTube link, a direct file, an
 * embed -- and `video_id` stays a fallback for the days before the provider
 * column existed.
 */
function resolveVideoSource(item: SyllabusContentItem): VideoSource {
  const url = item.file_url?.trim();

  if (url) {
    const youtubeId = getYouTubeId(url);
    if (youtubeId) return { kind: "youtube", src: youtubeId };
    if (isVideoFile(url)) return { kind: "file", src: url };
    return { kind: "embed", src: url };
  }

  const videoId = item.video_id?.trim();
  if (videoId) {
    if (/^https?:\/\//i.test(videoId)) {
      const youtubeId = getYouTubeId(videoId);
      if (youtubeId) return { kind: "youtube", src: youtubeId };
      if (isVideoFile(videoId)) return { kind: "file", src: videoId };
      return { kind: "embed", src: videoId };
    }
    if (/^[\w-]{11}$/.test(videoId)) return { kind: "youtube", src: videoId };
  }

  return { kind: "none" };
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

function SyllabusTree({
  subjects,
  progressById,
  currentItemId,
  openTopics,
  onToggleTopic,
  onSelect,
}: {
  subjects: SyllabusSubject[];
  progressById: Record<string, ContentProgress>;
  currentItemId: string | null;
  openTopics: Record<string, boolean>;
  onToggleTopic: (topicId: string) => void;
  onSelect: (itemId: string) => void;
}) {
  if (subjects.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-10 text-center">
        <Library className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Syllabus coming soon
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chapters appear here as soon as your teacher publishes them.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {subjects.map((subject) => {
        const lessons = subjectItems(subject);
        const subjectDone = lessons.filter(
          (i) => progressById[i.id]?.status === "completed"
        ).length;

        return (
          <section key={subject.id} className="border-b border-border/60 last:border-b-0">
            <header className="flex items-center gap-2 px-4 pt-4 pb-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-orange"
                style={{ backgroundColor: safeColor(subject.color_code) }}
              />
              <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {subject.name}
              </h3>
              {lessons.length > 0 && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {subjectDone}/{lessons.length}
                </span>
              )}
            </header>

            {subject.topics.length === 0 && (
              <p className="px-4 pb-3 text-xs text-muted-foreground">
                No chapters published yet.
              </p>
            )}

            {subject.topics.map((topic) => (
              <FolderNode
                key={topic.id}
                folder={topic}
                depth={0}
                progressById={progressById}
                currentItemId={currentItemId}
                openTopics={openTopics}
                onToggleTopic={onToggleTopic}
                onSelect={onSelect}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * One folder in the sidebar, with its subfolders nested beneath it and then
 * its own lessons. Counts and the all-done tick cover the whole branch, so a
 * chapter reads as finished only when everything inside it is.
 */
function FolderNode({
  folder,
  depth,
  progressById,
  currentItemId,
  openTopics,
  onToggleTopic,
  onSelect,
}: {
  folder: SyllabusTopic;
  depth: number;
  progressById: Record<string, ContentProgress>;
  currentItemId: string | null;
  openTopics: Record<string, boolean>;
  onToggleTopic: (topicId: string) => void;
  onSelect: (itemId: string) => void;
}) {
  const isOpen = openTopics[folder.id] ?? false;
  const lessons = folderItems(folder);
  const done = lessons.filter((i) => progressById[i.id]?.status === "completed").length;
  const allDone = lessons.length > 0 && done === lessons.length;
  const isEmpty = folder.folders.length === 0 && folder.items.length === 0;

  return (
    <div className={depth === 0 ? "px-2" : "pl-3"}>
      <button
        type="button"
        onClick={() => onToggleTopic(folder.id)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm text-foreground/90 ${
            depth === 0 ? "font-medium" : ""
          }`}
        >
          {folder.name}
        </span>
        {allDone ? (
          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
        ) : (
          lessons.length > 0 && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {done}/{lessons.length}
            </span>
          )
        )}
      </button>

      {isOpen && (
        <div className="mb-1 border-l border-border/60 ml-4">
          {folder.folders.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              progressById={progressById}
              currentItemId={currentItemId}
              openTopics={openTopics}
              onToggleTopic={onToggleTopic}
              onSelect={onSelect}
            />
          ))}

          <ul className="space-y-0.5 pl-1">
            {isEmpty && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                Nothing published here yet.
              </li>
            )}
            {folder.items.map((item) => {
              const ItemIcon = iconFor(item.type);
              const progress = progressById[item.id];
              const isCompleted = progress?.status === "completed";
              const isInProgress = progress?.status === "in_progress";
              const isCurrent = item.id === currentItemId;
              const duration = formatDuration(item.duration_seconds);

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={isCurrent ? "true" : undefined}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isCurrent
                        ? "bg-brand-orange/10 font-medium text-brand-orange"
                        : "text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <ItemIcon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isCurrent ? "text-brand-orange" : "text-muted-foreground"
                        }`}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {TYPE_LABEL[item.type]}
                        {duration && (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            {duration}
                          </>
                        )}
                      </span>
                      {isInProgress && (progress?.progressPct ?? 0) > 0 && (
                        <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-brand-orange"
                            style={{ width: `${progress.progressPct}%` }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  course,
  subjects,
  progressById,
  currentItemId,
  openTopics,
  onToggleTopic,
  onSelect,
  completedCount,
  totalCount,
}: {
  course: Course;
  subjects: SyllabusSubject[];
  progressById: Record<string, ContentProgress>;
  currentItemId: string | null;
  openTopics: Record<string, boolean>;
  onToggleTopic: (topicId: string) => void;
  onSelect: (itemId: string) => void;
  completedCount: number;
  totalCount: number;
}) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <>
      <div className="p-4">
        <h2 className="line-clamp-2 text-sm font-semibold text-foreground">
          {course.title}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {totalCount > 0
            ? `${completedCount} of ${totalCount} completed`
            : "Nothing published yet"}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-orange transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Syllabus
        </h3>
      </div>

      <SyllabusTree
        subjects={subjects}
        progressById={progressById}
        currentItemId={currentItemId}
        openTopics={openTopics}
        onToggleTopic={onToggleTopic}
        onSelect={onSelect}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Viewers                                                                     */
/* -------------------------------------------------------------------------- */

function EmptyFrame({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof BookOpen;
  title: string;
  body?: string | null;
}) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10">
          <Icon className="h-6 w-6 text-brand-orange" />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {body && <p className="text-xs text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}

function VideoViewer({
  item,
  startAt,
  onTick,
  onFlush,
  onEnded,
}: {
  item: SyllabusContentItem;
  startAt: number;
  onTick: (pct: number, position: number) => void;
  onFlush: (pct: number, position: number) => void;
  onEnded: (position: number) => void;
}) {
  const source = useMemo(() => resolveVideoSource(item), [item]);
  // One restore per item — remounting the <video> must not re-seek a student
  // who has deliberately scrubbed back.
  const seekedForRef = useRef<string | null>(null);


  const readProgress = useCallback((el: HTMLVideoElement) => {
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    const position = el.currentTime;
    const pct = duration > 0 ? (position / duration) * 100 : 0;
    return { pct, position };
  }, []);

  // A video we host goes through the signed-URL player, which is also where
  // the five-second step, the speed menu and the quality menu live. Nothing
  // about it can be derived from the row: the row has no URL.
  if (item.video_provider === "bunny") {
    if (item.video_status !== "ready") {
      return (
        <EmptyFrame
          icon={Clock}
          title="This video is still being prepared"
          body="Transcoding usually takes a few minutes. Please check back shortly."
        />
      );
    }

    return (
      <HostedVideoPlayer
        key={item.id}
        contentItemId={item.id}
        title={item.title}
        startAt={startAt}
        allowDownload={item.is_downloadable}
        onTick={onTick}
        onFlush={onFlush}
        onEnded={onEnded}
      />
    );
  }

  if (source.kind === "file") {
    return (
      <video
        key={item.id}
        src={source.src}
        controls
        playsInline
        preload="metadata"
        controlsList={item.is_downloadable ? undefined : "nodownload"}
        className="aspect-video w-full rounded-xl bg-black"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (seekedForRef.current === item.id) return;
          seekedForRef.current = item.id;
          const duration = Number.isFinite(el.duration) ? el.duration : 0;
          if (startAt > 5 && duration > 0 && startAt < duration - 10) {
            el.currentTime = startAt;
          }
        }}
        onTimeUpdate={(e) => {
          const { pct, position } = readProgress(e.currentTarget);
          onTick(pct, position);
        }}
        onPause={(e) => {
          const { pct, position } = readProgress(e.currentTarget);
          onFlush(pct, position);
        }}
        onEnded={(e) => {
          onEnded(e.currentTarget.currentTime);
        }}
      />
    );
  }

  if (source.kind === "youtube") {
    return (
      <iframe
        key={item.id}
        src={`https://www.youtube-nocookie.com/embed/${source.src}?rel=0`}
        title={item.title}
        className="aspect-video w-full rounded-xl"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  }

  if (source.kind === "embed") {
    return (
      <iframe
        key={item.id}
        src={source.src}
        title={item.title}
        className="aspect-video w-full rounded-xl"
        allow="fullscreen"
        allowFullScreen
      />
    );
  }

  return (
    <EmptyFrame
      icon={Play}
      title="This video has no source yet"
      body="The lesson exists but no playable file has been attached. Mark it complete once you have watched it elsewhere, or check back shortly."
    />
  );
}

/**
 * The content route redirects to a signed URL on Supabase's origin, where the
 * `download` attribute is ignored -- the browser opens the file instead of
 * saving it. Asking the route for an attachment makes it sign the URL with a
 * Content-Disposition header, which the browser does honour. External URLs are
 * someone else's to serve and are left alone.
 */
function downloadHref(url: string): string {
  return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Everything attached to the lesson beyond the one on screen. Each opens
 * through the content route, so entitlement is rechecked on every click.
 */
function AttachmentList({ files }: { files: ContentAttachment[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Attachments
      </h3>
      <ul className="mt-3 space-y-2">
        {files.map((file) => (
          <li key={file.id}>
            <a
              href={downloadHref(file.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-brand-orange/50 hover:bg-muted/40"
            >
              <FileText className="h-4 w-4 shrink-0 text-brand-orange" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {file.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatFileSize(file.sizeBytes)}
              </span>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentViewer({ item }: { item: SyllabusContentItem }) {
  const primary = item.files[0];

  if (!primary) {
    return (
      <EmptyFrame
        icon={FileText}
        title="No file attached yet"
        body={item.description ?? "This document has not been uploaded yet."}
      />
    );
  }

  // Only PDFs render reliably in a browser frame. Anything else (epub, docx)
  // gets an honest hand-off instead of a blank embed.
  if (primary.ext !== "pdf") {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange/10">
            <FileText className="h-5 w-5 text-brand-orange" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {primary.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This file opens outside the player.
            </p>
            <Button
              size="sm"
              className="mt-4 bg-brand-orange text-white hover:bg-brand-orange-dark"
              render={
                <a
                  href={downloadHref(primary.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Open file
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // `#toolbar=0` asks the browser's built-in PDF viewer to hide its save and
  // print controls. It is a courtesy to the publishing rules, not real DRM.
  const src = item.is_downloadable
    ? primary.url
    : `${primary.url}#toolbar=0&navpanes=0`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
      <object
        data={src}
        type="application/pdf"
        className="h-[70vh] min-h-[420px] w-full"
        aria-label={item.title}
      >
        <iframe
          src={src}
          title={item.title}
          className="h-[70vh] min-h-[420px] w-full"
        />
      </object>
    </div>
  );
}

function NoteViewer({ item }: { item: SyllabusContentItem }) {
  if (item.files.length > 0) return <DocumentViewer item={item} />;

  if (!item.description) {
    return (
      <EmptyFrame
        icon={Notebook}
        title="These notes are empty"
        body="Nothing has been written into this note yet."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {item.description}
      </p>
    </div>
  );
}

function QuizViewer({ item }: { item: SyllabusContentItem }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange/10">
          <ClipboardList className="h-5 w-5 text-brand-orange" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description ??
              "Quizzes are taken from the tests section, where your attempts and scores are recorded."}
          </p>
          <Button
            size="sm"
            className="mt-4 bg-brand-orange text-white hover:bg-brand-orange-dark"
            render={<Link href="/dashboard/tests" />}
          >
            Go to my tests
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemViewer({
  item,
  startAt,
  onTick,
  onFlush,
  onEnded,
}: {
  item: SyllabusContentItem;
  startAt: number;
  onTick: (pct: number, position: number) => void;
  onFlush: (pct: number, position: number) => void;
  onEnded: (position: number) => void;
}) {
  if (item.type === "video") {
    return (
      <VideoViewer
        item={item}
        startAt={startAt}
        onTick={onTick}
        onFlush={onFlush}
        onEnded={onEnded}
      />
    );
  }
  if (item.type === "note") return <NoteViewer item={item} />;
  if (item.type === "quiz") return <QuizViewer item={item} />;
  if (DOCUMENT_TYPES.includes(item.type)) return <DocumentViewer item={item} />;
  return <NoteViewer item={item} />;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function LearnContent({
  course,
  subjects,
  initialContentId,
}: LearnContentProps) {
  const flatItems = useMemo(() => subjects.flatMap(subjectItems), [subjects]);

  // Which folder holds each lesson, which folder holds each folder, and every
  // folder id -- so the sidebar can open exactly the chain leading to a
  // lesson, at whatever depth it sits.
  const { topicOfItem, parentOfFolder, allFolderIds } = useMemo(() => {
    const itemMap: Record<string, string> = {};
    const parentMap: Record<string, string | null> = {};
    const ids: string[] = [];
    function walk(folder: SyllabusTopic, parent: string | null) {
      ids.push(folder.id);
      parentMap[folder.id] = parent;
      for (const item of folder.items) itemMap[item.id] = folder.id;
      for (const child of folder.folders) walk(child, folder.id);
    }
    for (const subject of subjects) {
      for (const topic of subject.topics) walk(topic, null);
    }
    return { topicOfItem: itemMap, parentOfFolder: parentMap, allFolderIds: ids };
  }, [subjects]);

  const [progressById, setProgressById] = useState<Record<string, ContentProgress>>(
    () => {
      const seed: Record<string, ContentProgress> = {};
      for (const item of flatItems) {
        if (item.progress) seed[item.id] = item.progress;
      }
      return seed;
    }
  );

  // Resume at the item named in the URL first, then the first unfinished.
  // The deep-link takes priority so a rewatch button on the live-class
  // page lands the student right at the lesson, not at the resume point.
  const deepLinkItem = useMemo(
    () =>
      initialContentId
        ? flatItems.find((i) => i.id === initialContentId) ?? null
        : null,
    [flatItems, initialContentId]
  );

  const initialItem = useMemo(
    () =>
      deepLinkItem ??
      flatItems.find((i) => i.progress?.status !== "completed") ??
      flatItems[0] ??
      null,
    [deepLinkItem, flatItems]
  );

  const [currentItemId, setCurrentItemId] = useState<string | null>(
    initialItem?.id ?? null
  );

  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>(() => {
    const open: Record<string, boolean> = {};
    const focusTopic = initialItem ? topicOfItem[initialItem.id] : undefined;
    if (!focusTopic) {
      for (const id of allFolderIds) open[id] = true;
      return open;
    }
    // Only the folders on the way down to the lesson being resumed, so a
    // twelve-chapter course does not open as a wall of lessons.
    for (const id of allFolderIds) open[id] = false;
    let cursor: string | null = focusTopic;
    while (cursor) {
      open[cursor] = true;
      cursor = parentOfFolder[cursor] ?? null;
    }
    return open;
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentIndex = flatItems.findIndex((i) => i.id === currentItemId);
  const currentItem = currentIndex >= 0 ? flatItems[currentIndex] : null;
  const currentProgress = currentItem ? progressById[currentItem.id] : undefined;
  const isCurrentCompleted = currentProgress?.status === "completed";

  const completedCount = flatItems.filter(
    (i) => progressById[i.id]?.status === "completed"
  ).length;

  /* ----- progress persistence ------------------------------------------- */

  const lastPingRef = useRef<{ itemId: string; at: number; pct: number }>({
    itemId: "",
    at: 0,
    pct: -1,
  });
  const pingErrorShownRef = useRef(false);

  const applyResult = useCallback(
    (itemId: string, result: ContentProgress | undefined) => {
      if (!result) return;
      setProgressById((prev) => ({
        ...prev,
        [itemId]: {
          status: result.status,
          progressPct: result.progressPct,
          lastPositionSeconds: result.lastPositionSeconds,
        },
      }));
    },
    []
  );

  const sendProgress = useCallback(
    async (itemId: string, pct: number, position: number) => {
      const result = await updateContentProgress({
        contentItemId: itemId,
        progressPct: pct,
        lastPositionSeconds: position,
      });

      if (result.error) {
        // One quiet warning per visit — a failing ping must not spam toasts
        // over a video the student is still watching.
        if (!pingErrorShownRef.current) {
          pingErrorShownRef.current = true;
          toast.error("We could not save your progress just now.");
        }
        return;
      }

      applyResult(itemId, result.data);
    },
    [applyResult]
  );

  /** Throttled: at most one write per PING_INTERVAL_MS, and only on movement. */
  const handleTick = useCallback(
    (pct: number, position: number) => {
      if (!currentItem) return;
      const now = Date.now();
      const last = lastPingRef.current;
      const sameItem = last.itemId === currentItem.id;

      if (
        sameItem &&
        now - last.at < PING_INTERVAL_MS &&
        Math.abs(pct - last.pct) < PING_MIN_DELTA_PCT
      ) {
        return;
      }

      lastPingRef.current = { itemId: currentItem.id, at: now, pct };
      void sendProgress(currentItem.id, pct, position);
    },
    [currentItem, sendProgress]
  );

  /** Unthrottled: pause and similar moments where losing the position hurts. */
  const handleFlush = useCallback(
    (pct: number, position: number) => {
      if (!currentItem) return;
      lastPingRef.current = {
        itemId: currentItem.id,
        at: Date.now(),
        pct,
      };
      void sendProgress(currentItem.id, pct, position);
    },
    [currentItem, sendProgress]
  );

  const completeCurrent = useCallback(
    (position: number, announce: boolean) => {
      if (!currentItem) return;
      const itemId = currentItem.id;
      startTransition(async () => {
        const result = await markContentComplete(itemId, position);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        applyResult(itemId, result.data);
        if (announce) toast.success("Marked as complete");
      });
    },
    [applyResult, currentItem]
  );

  const handleEnded = useCallback(
    (position: number) => {
      if (!currentItem || progressById[currentItem.id]?.status === "completed") {
        return;
      }
      completeCurrent(position, false);
    },
    [completeCurrent, currentItem, progressById]
  );

  /* ----- navigation ------------------------------------------------------ */

  const selectItem = useCallback(
    (itemId: string) => {
      setCurrentItemId(itemId);
      setSheetOpen(false);
      // Open every folder on the way down, not just the lesson's own: with
      // nesting, Next can land in a subfolder of a folder that is closed.
      const chain: string[] = [];
      let cursor: string | null = topicOfItem[itemId] ?? null;
      while (cursor) {
        chain.push(cursor);
        cursor = parentOfFolder[cursor] ?? null;
      }
      if (chain.length > 0) {
        setOpenTopics((prev) => {
          const next = { ...prev };
          for (const id of chain) next[id] = true;
          return next;
        });
      }
    },
    [topicOfItem, parentOfFolder]
  );

  const toggleTopic = useCallback((topicId: string) => {
    setOpenTopics((prev) => ({ ...prev, [topicId]: !prev[topicId] }));
  }, []);

  const previousItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < flatItems.length - 1
      ? flatItems[currentIndex + 1]
      : null;

  const sidebar = (
    <SidebarContent
      course={course}
      subjects={subjects}
      progressById={progressById}
      currentItemId={currentItemId}
      openTopics={openTopics}
      onToggleTopic={toggleTopic}
      onSelect={selectItem}
      completedCount={completedCount}
      totalCount={flatItems.length}
    />
  );

  const currentDuration = formatDuration(currentItem?.duration_seconds ?? null);

  return (
    <div className="flex h-[calc(100vh-var(--header-height))]">
      {/* Desktop sidebar */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-border bg-card md:block">
        {sidebar}
      </aside>

      <div className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href={`/courses/${course.slug}`} />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="line-clamp-1 text-sm font-medium text-foreground">
            {course.title}
          </h1>

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto md:hidden"
                />
              }
            >
              <Menu className="h-4 w-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Syllabus</SheetTitle>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {currentItem ? (
            <>
              <ItemViewer
                item={currentItem}
                startAt={currentProgress?.lastPositionSeconds ?? 0}
                onTick={handleTick}
                onFlush={handleFlush}
                onEnded={handleEnded}
              />

              {/* Item header */}
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[11px]">
                      {TYPE_LABEL[currentItem.type]}
                    </Badge>
                    {currentDuration && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {currentDuration}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-foreground">
                    {currentItem.title}
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {currentItem.is_downloadable && currentItem.files[0] && (
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <a
                          href={downloadHref(currentItem.files[0].url)}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Download
                    </Button>
                  )}

                  {isCurrentCompleted ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="border-green-500/30 text-green-600"
                    >
                      <CheckCircle className="mr-1.5 h-4 w-4" />
                      Completed
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => completeCurrent(
                        currentProgress?.lastPositionSeconds ?? 0,
                        true
                      )}
                      disabled={isPending}
                      className="bg-brand-orange text-white hover:bg-brand-orange-dark"
                    >
                      {isPending ? "Saving..." : "Mark as complete"}
                    </Button>
                  )}
                </div>
              </div>

              {currentItem.description && currentItem.type !== "note" && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {currentItem.description}
                </p>
              )}

              {!currentItem.is_downloadable &&
                currentItem.files.length > 0 &&
                currentItem.type !== "video" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    This material is view-only
                    {currentItem.is_printable ? " but may be printed" : ""}.
                  </p>
                )}

              {/* Everything after the one the player is showing. A video
                  lesson shows all of them, since none is embedded. */}
              <AttachmentList
                files={
                  currentItem.type === "video"
                    ? currentItem.files
                    : currentItem.files.slice(1)
                }
              />

              {/* Prev / next */}
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
                {previousItem ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectItem(previousItem.id)}
                    className="min-w-0"
                  >
                    <ChevronLeft className="mr-1.5 h-4 w-4" />
                    <span className="truncate">Previous</span>
                  </Button>
                ) : (
                  <span />
                )}
                {nextItem && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectItem(nextItem.id)}
                    className="ml-auto min-w-0"
                  >
                    <span className="truncate">Next</span>
                    <ChevronRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Teacher */}
              {course.teacher_name && (
                <div className="mt-8 flex items-center gap-3">
                  {course.teacher_avatar_url ? (
                    <Image
                      src={course.teacher_avatar_url}
                      alt={course.teacher_name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-orange/10 text-sm font-semibold text-brand-orange">
                      {course.teacher_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {course.teacher_name}
                    </p>
                    <p className="text-xs text-muted-foreground">Instructor</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-orange/10">
                <Library className="h-8 w-8 text-brand-orange" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-foreground">
                Your syllabus is being prepared
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Nothing has been published for this course yet. Chapters, videos
                and notes will appear here the moment your teacher releases
                them — your enrolment is already active.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                render={<Link href={`/courses/${course.slug}`} />}
              >
                Back to course page
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
