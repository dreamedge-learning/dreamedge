"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  TestAttemptRow,
  UpcomingTestRow,
} from "@/app/(student)/dashboard/tests/page";

interface TestsContentProps {
  attempts: TestAttemptRow[];
  upcoming: UpcomingTestRow[];
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function statusForAttempt(a: TestAttemptRow): "pass" | "fail" | "ungraded" {
  if (a.percentage == null || a.test?.pass_percentage == null) return "ungraded";
  return a.percentage >= Number(a.test.pass_percentage) ? "pass" : "fail";
}

export function TestsContent({ attempts, upcoming }: TestsContentProps) {
  const [tab, setTab] = useState<"attempts" | "upcoming">(
    upcoming.length > 0 && attempts.length === 0 ? "upcoming" : "attempts"
  );

  const stats = useMemo(() => {
    const total = attempts.length;
    const graded = attempts.filter(
      (a) => a.percentage != null && a.test?.pass_percentage != null
    );
    const passed = graded.filter(
      (a) => Number(a.percentage) >= Number(a.test!.pass_percentage!)
    );
    const avg =
      graded.length === 0
        ? 0
        : Math.round(
            (graded.reduce((s, a) => s + Number(a.percentage ?? 0), 0) /
              graded.length) *
              10
          ) / 10;
    const best =
      graded.length === 0
        ? 0
        : Math.max(...graded.map((a) => Number(a.percentage ?? 0)));
    return { total, passed: passed.length, avg, best };
  }, [attempts]);

  // Group attempts by test so the user sees "latest + prior attempts" instead
  // of a messy flat list of 100 rows.
  const grouped = useMemo(() => {
    const by = new Map<string, TestAttemptRow[]>();
    for (const a of attempts) {
      if (!a.test) continue;
      const list = by.get(a.test_id) ?? [];
      list.push(a);
      by.set(a.test_id, list);
    }
    // Sort groups by most-recent submission
    return Array.from(by.values()).sort(
      (left, right) =>
        new Date(right[0].submitted_at).getTime() -
        new Date(left[0].submitted_at).getTime()
    );
  }, [attempts]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-12 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Your Tests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Every attempt you&apos;ve made, and every test waiting for you.
        </p>
      </header>

      {/* Stats */}
      {attempts.length > 0 && (
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={FileText}
            label="Attempts"
            value={stats.total.toString()}
          />
          <StatTile
            icon={CheckCircle2}
            label="Passed"
            value={stats.passed.toString()}
            tone="success"
          />
          <StatTile
            icon={Target}
            label="Average score"
            value={stats.avg === 0 ? "—" : `${stats.avg}%`}
          />
          <StatTile
            icon={Flame}
            label="Personal best"
            value={stats.best === 0 ? "—" : `${stats.best}%`}
            tone="brand"
          />
        </section>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="attempts" className="text-sm">
            History ({attempts.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-sm">
            Upcoming ({upcoming.length})
          </TabsTrigger>
        </TabsList>

        {/* -------- History -------- */}
        <TabsContent value="attempts" className="mt-6">
          {grouped.length === 0 ? (
            <EmptyState
              title="No test attempts yet"
              body="Attempts you make will appear here with scores, timing, and pass/fail."
              ctaHref="/courses"
              ctaLabel="Browse courses"
            />
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => {
                const latest = group[0];
                const prior = group.slice(1);
                return (
                  <AttemptGroup
                    key={latest.test_id}
                    latest={latest}
                    prior={prior}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* -------- Upcoming -------- */}
        <TabsContent value="upcoming" className="mt-6">
          {upcoming.length === 0 ? (
            <EmptyState
              title="No tests scheduled"
              body="When your teacher publishes a test for one of your courses, it'll show up here."
              ctaHref="/dashboard/my-courses"
              ctaLabel="View my courses"
            />
          ) : (
            <div className="space-y-4">
              {upcoming.map((t) => (
                <UpcomingCard key={t.id} test={t} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================ */
/*                          Sub-components                      */
/* ============================================================ */

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: "brand" | "success";
}) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-orange/10 text-brand-orange"
      : tone === "success"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-muted text-foreground/70";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function AttemptGroup({
  latest,
  prior,
}: {
  latest: TestAttemptRow;
  prior: TestAttemptRow[];
}) {
  const [showPrior, setShowPrior] = useState(false);
  const status = statusForAttempt(latest);
  const courseSlug = latest.test?.course?.slug;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            {latest.test?.course?.title && (
              <Badge variant="secondary" className="text-xs">
                <BookOpen className="mr-1 h-3 w-3" />
                {latest.test.course.title}
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground sm:text-lg">
            {latest.test?.name ?? "Deleted test"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Last attempted {dateFmt.format(new Date(latest.submitted_at))} ·
            Attempt {latest.attempt_number}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <AttemptScore attempt={latest} />
          {courseSlug && (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/courses/${courseSlug}/learn`} />}
            >
              Open course
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {fmtDuration(latest.time_taken_seconds)}
          {latest.test && (
            <span className="text-foreground/50">
              {" "}/ {latest.test.duration_minutes}m limit
            </span>
          )}
        </span>
        {latest.score != null && latest.total_marks != null && (
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            {Number(latest.score).toFixed(2)} / {Number(latest.total_marks).toFixed(2)} marks
          </span>
        )}
        {prior.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPrior((v) => !v)}
            className="ml-auto text-xs font-medium text-brand-orange hover:text-brand-orange-dark"
          >
            {showPrior ? "Hide" : `Show ${prior.length} earlier attempt${prior.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {showPrior && prior.length > 0 && (
        <ul className="divide-y divide-border border-t border-border bg-muted/30">
          {prior.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs"
            >
              <span className="text-muted-foreground">
                Attempt {a.attempt_number} ·{" "}
                {dateFmt.format(new Date(a.submitted_at))}
              </span>
              <span className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  {fmtDuration(a.time_taken_seconds)}
                </span>
                <AttemptScore attempt={a} inline />
                <StatusPill status={statusForAttempt(a)} compact />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function AttemptScore({
  attempt,
  inline,
}: {
  attempt: TestAttemptRow;
  inline?: boolean;
}) {
  if (attempt.percentage == null) {
    return (
      <span className={inline ? "text-xs" : "text-sm text-muted-foreground"}>
        Ungraded
      </span>
    );
  }
  const pct = Number(attempt.percentage);
  const color =
    attempt.test?.pass_percentage != null &&
    pct >= Number(attempt.test.pass_percentage)
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-foreground";
  if (inline) {
    return <span className={`text-xs font-semibold ${color}`}>{pct.toFixed(1)}%</span>;
  }
  return (
    <div className="text-right">
      <p className={`text-2xl font-bold leading-none ${color}`}>{pct.toFixed(1)}%</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        Score
      </p>
    </div>
  );
}

function StatusPill({
  status,
  compact,
}: {
  status: "pass" | "fail" | "ungraded";
  compact?: boolean;
}) {
  const label = status === "pass" ? "Passed" : status === "fail" ? "Not cleared" : "Ungraded";
  const Icon =
    status === "pass" ? CheckCircle2 : status === "fail" ? XCircle : Clock;
  const cls =
    status === "pass"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "fail"
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </span>
  );
}

function UpcomingCard({ test }: { test: UpcomingTestRow }) {
  const attemptsLeft = Math.max(0, test.max_attempts - test.attempts_so_far);
  const canAttempt = attemptsLeft > 0;
  const startsAt = test.start_time ? new Date(test.start_time) : null;
  const endsAt = test.end_time ? new Date(test.end_time) : null;
  const now = new Date();
  const hasStarted = !startsAt || startsAt <= now;
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {test.course?.title && (
              <Badge variant="secondary" className="text-xs">
                <BookOpen className="mr-1 h-3 w-3" />
                {test.course.title}
              </Badge>
            )}
            {!hasStarted && startsAt && (
              <Badge className="bg-brand-orange/10 text-brand-orange">
                Starts {dateTimeFmt.format(startsAt)}
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground sm:text-lg">
            {test.name}
          </h3>
          {test.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {test.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {test.duration_minutes} min
            </span>
            {test.pass_percentage != null && (
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Pass at {Number(test.pass_percentage).toFixed(0)}%
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {attemptsLeft === 0
                ? "No attempts left"
                : `${attemptsLeft} of ${test.max_attempts} attempt${test.max_attempts === 1 ? "" : "s"} left`}
            </span>
            {endsAt && (
              <span className="inline-flex items-center gap-1.5">
                Closes {dateTimeFmt.format(endsAt)}
              </span>
            )}
          </div>
        </div>

        <Button
          disabled={!canAttempt || !hasStarted}
          className="shrink-0 bg-brand-orange text-white hover:bg-brand-orange-dark"
          render={
            canAttempt && hasStarted && test.course?.slug ? (
              <Link href={`/courses/${test.course.slug}/learn?test=${test.id}`} />
            ) : undefined
          }
        >
          {!hasStarted ? "Not open yet" : canAttempt ? "Start test" : "No attempts left"}
        </Button>
      </div>
    </article>
  );
}

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange">
        <FileText className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Button
        variant="outline"
        className="mt-4"
        render={<Link href={ctaHref} />}
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
