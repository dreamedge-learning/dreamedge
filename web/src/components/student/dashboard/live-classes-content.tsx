import Link from "next/link";
import {
  Calendar,
  Clock,
  Video,
  PlayCircle,
  CheckCircle2,
  Radio,
} from "lucide-react";

import type { LiveClassSummary } from "@/app/(student)/dashboard/live-classes/page";

/**
 * Student's live-class list. Two sections: upcoming (anything scheduled or
 * live, closest first) and past (ended within the last 60 days). Cards flow
 * one-per-row on phones with the chip pinned top-right by `shrink-0`, and
 * two-per-row from 640px up.
 */
interface Props {
  upcoming: LiveClassSummary[];
  past: LiveClassSummary[];
}

export function LiveClassesContent({ upcoming, past }: Props) {
  const liveNow = upcoming.filter((c) => c.status === "live");
  const scheduled = upcoming.filter((c) => c.status !== "live");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Live classes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Join the ones running now, see what&apos;s coming up, and rewatch the
          ones that have finished.
        </p>
      </header>

      {liveNow.length > 0 && (
        <Section title="Live now">
          <Grid classes={liveNow} />
        </Section>
      )}

      <Section
        title={liveNow.length > 0 ? "Coming up" : "Upcoming"}
        empty="No scheduled classes yet. They'll appear here once your teacher sets one up."
        classes={scheduled}
      >
        <Grid classes={scheduled} />
      </Section>

      <Section
        title="Past classes"
        empty="No recordings yet. Classes that have ended will appear here."
        classes={past}
      >
        <Grid classes={past} />
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  classes,
  children,
}: {
  title: string;
  empty?: string;
  classes?: LiveClassSummary[];
  children: React.ReactNode;
}) {
  const isEmpty = Boolean(classes && classes.length === 0 && empty);
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">{empty}</p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Grid({ classes }: { classes: LiveClassSummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {classes.map((liveClass) => (
        <li key={liveClass.id}>
          <LiveClassCard liveClass={liveClass} />
        </li>
      ))}
    </ul>
  );
}

function LiveClassCard({ liveClass }: { liveClass: LiveClassSummary }) {
  return (
    <Link
      href={`/dashboard/live-classes/${liveClass.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-brand-orange/40 hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {liveClass.course?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={liveClass.course.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-orange/15 to-brand-orange/5">
            <Video className="h-10 w-10 text-brand-orange" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <StatusChip status={liveClass.status} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">
          {liveClass.title}
        </h3>
        {liveClass.course && (
          <p className="truncate text-xs text-muted-foreground">
            {liveClass.course.title}
          </p>
        )}

        <dl className="mt-1 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDate(liveClass.scheduledAt)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {formatTime(liveClass.scheduledAt)} ·{" "}
              {formatDuration(liveClass.durationMinutes)}
            </span>
          </div>
        </dl>

        {liveClass.teacherName && (
          <p className="mt-auto pt-2 text-xs font-medium text-foreground/70">
            {liveClass.teacherName}
          </p>
        )}
      </div>
    </Link>
  );
}

function StatusChip({ status }: { status: LiveClassSummary["status"] }) {
  switch (status) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
          <Radio className="h-3 w-3 animate-pulse" />
          Live
        </span>
      );
    case "scheduled":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/90 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
          <Calendar className="h-3 w-3" />
          Scheduled
        </span>
      );
    case "ended":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
          <PlayCircle className="h-3 w-3" />
          Rewatch
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/90 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
          <CheckCircle2 className="h-3 w-3" />
          Cancelled
        </span>
      );
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}
