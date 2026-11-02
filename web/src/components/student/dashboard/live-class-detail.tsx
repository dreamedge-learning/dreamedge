"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  PlayCircle,
  Radio,
  Video,
} from "lucide-react";

import { LiveStreamPlayer } from "@/components/student/live/live-stream-player";
import type { LiveClassDetailData } from "@/app/(student)/dashboard/live-classes/[id]/page";

/**
 * Live-class detail. One of three states carries the primary action:
 *   * `live` + in_app  → inline HLS player
 *   * `live` + external → "Open meeting" that launches the external URL
 *   * `scheduled` → countdown panel, no action
 *   * `ended` + rewatch content → "Watch rewatch" linking into the course
 *     player
 *   * `ended` without a recording → "Recording coming soon"
 *   * `cancelled` → cancelled state
 */
interface Props {
  detail: LiveClassDetailData;
}

export function LiveClassDetail({ detail }: Props) {
  const scheduledAt = new Date(detail.scheduledAt);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/dashboard/live-classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Live classes
      </Link>

      <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Hero detail={detail} />

        <div className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <StatusChip status={detail.status} />
              <h1 className="mt-3 text-xl font-bold leading-tight sm:text-2xl">
                {detail.title}
              </h1>
              {detail.course && (
                <Link
                  href={`/courses/${detail.course.slug}`}
                  className="mt-1 inline-flex text-sm text-muted-foreground hover:text-foreground"
                >
                  {detail.course.title}
                </Link>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
            <Row
              icon={Calendar}
              label="Date"
              value={scheduledAt.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            />
            <Row
              icon={Clock}
              label="Time"
              value={`${scheduledAt.toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
              })} · ${formatDuration(detail.durationMinutes)}`}
            />
            <Row
              icon={Video}
              label="Platform"
              value={platformLabel(detail.platform)}
            />
          </dl>

          {detail.teacher?.name && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                {detail.teacher.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.teacher.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {initial(detail.teacher.name)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Taken by
                </p>
                <p className="truncate text-sm font-semibold">
                  {detail.teacher.name}
                </p>
              </div>
            </div>
          )}

          {detail.description && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                About this class
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {detail.description}
              </p>
            </div>
          )}

          <ActionPanel detail={detail} />
        </div>
      </section>
    </div>
  );
}

function Hero({ detail }: { detail: LiveClassDetailData }) {
  // For a live in-app class, the hero IS the player. Everything else gets
  // the course thumbnail or a brand backdrop.
  if (
    detail.status === "live" &&
    detail.platform === "in_app" &&
    detail.meetingUrl
  ) {
    return (
      <LiveStreamPlayer src={detail.meetingUrl} poster={detail.course?.thumbnailUrl ?? null} />
    );
  }

  return (
    <div className="relative aspect-video w-full bg-muted">
      {detail.course?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={detail.course.thumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-orange/15 to-brand-orange/5">
          <Video className="h-14 w-14 text-brand-orange" />
        </div>
      )}
    </div>
  );
}

function ActionPanel({ detail }: { detail: LiveClassDetailData }) {
  if (detail.status === "live" && detail.platform !== "in_app") {
    if (!detail.meetingUrl) {
      return (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          The class is live but a meeting link has not been published yet.
          Refresh in a moment or check with your teacher.
        </div>
      );
    }
    return (
      <a
        href={detail.meetingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700 sm:w-auto"
      >
        <Radio className="h-4 w-4" />
        Open meeting on {platformLabel(detail.platform)}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  }

  if (detail.status === "scheduled") {
    const scheduledAt = new Date(detail.scheduledAt);
    return (
      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 text-sm">
        <p className="font-semibold">
          Starts {relativeTo(scheduledAt)}
        </p>
        <p className="mt-1 text-muted-foreground">
          Come back to this page once the class is live and the Join button
          will appear here.
        </p>
      </div>
    );
  }

  if (detail.status === "ended") {
    if (detail.rewatchContentId && detail.rewatchCourseSlug) {
      return (
        <Link
          href={`/courses/${detail.rewatchCourseSlug}/learn?content=${detail.rewatchContentId}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark sm:w-auto"
        >
          <PlayCircle className="h-4 w-4" />
          Watch rewatch
        </Link>
      );
    }
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        The edited rewatch of this class has not been uploaded yet. It
        usually arrives within a few hours of the class ending.
      </div>
    );
  }

  if (detail.status === "cancelled") {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm">
        This class was cancelled. Your teacher will let you know when it is
        rescheduled.
      </div>
    );
  }

  return null;
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="truncate text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: LiveClassDetailData["status"] }) {
  switch (status) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
          <Radio className="h-3 w-3 animate-pulse" />
          Live now
        </span>
      );
    case "scheduled":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
          Scheduled
        </span>
      );
    case "ended":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          Ended
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-400">
          Cancelled
        </span>
      );
  }
}

function platformLabel(platform: string): string {
  switch (platform) {
    case "in_app":
      return "In-app";
    case "zoom":
      return "Zoom";
    case "google_meet":
      return "Google Meet";
    case "youtube":
      return "YouTube";
    default:
      return platform;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? "T" : trimmed[0].toUpperCase();
}

function relativeTo(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "any moment now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
