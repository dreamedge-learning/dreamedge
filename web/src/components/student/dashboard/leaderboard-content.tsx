"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Trophy, Medal, Award } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { LeaderboardEnrollment } from "@/app/(student)/dashboard/leaderboard/page";

// Narrow local types. The task forbids regenerating `types/supabase.ts`, so
// we type the RPC row explicitly rather than relying on the generated
// Functions map. The five columns match `get_weekly_leaderboard` exactly.
interface LeaderboardRow {
  rank: number;
  display_name: string;
  total_score: number;
  tests_taken: number;
  is_me: boolean;
}

type WeekChoice = "this" | "last";

interface LeaderboardContentProps {
  enrollments: LeaderboardEnrollment[];
}

// IST is UTC + 05:30 and does not observe DST. The server still computes the
// week from `now()`, so "this week" sends `p_week_start = null`. "Last week"
// has to translate to a `date`, and the right date is the Monday *in IST*
// one week before the current IST Monday -- never the browser's local day.
function istMondayDate(whenUtc: Date): string {
  const shifted = new Date(whenUtc.getTime() + 5.5 * 60 * 60 * 1000);
  // getUTCDay returns 0 (Sun) .. 6 (Sat); ISO weekday is 1 (Mon) .. 7 (Sun).
  const utcDay = shifted.getUTCDay();
  const isoDay = utcDay === 0 ? 7 : utcDay;
  const monday = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - (isoDay - 1)
    )
  );
  const y = monday.getUTCFullYear().toString().padStart(4, "0");
  const m = (monday.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = monday.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function paramForWeek(week: WeekChoice): string | null {
  if (week === "this") return null;
  const now = new Date();
  // Shift back a full seven days first, then round down to IST Monday.
  return istMondayDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
}

function fmtScore(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}

export function LeaderboardContent({ enrollments }: LeaderboardContentProps) {
  if (enrollments.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-12 lg:px-8">
        <PageHeader />
        <EmptyCard
          title="No enrolled course yet"
          detail="Enrol in a course to see how you rank against your classmates each week."
          cta={{ href: "/courses", label: "Browse courses" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-12 lg:px-8">
      <PageHeader />
      <LeaderboardBody enrollments={enrollments} />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <div className="flex items-center gap-2 text-brand-orange">
        <Trophy className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          Weekly rankings
        </span>
      </div>
      <h1 className="mt-2 text-3xl font-serif font-bold tracking-tight">
        Leaderboard
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Your best score on every test for the week, summed up and ranked
        across the course. Resets Monday 00:00 IST.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Body
// -----------------------------------------------------------------------------

function LeaderboardBody({ enrollments }: { enrollments: LeaderboardEnrollment[] }) {
  const [courseId, setCourseId] = useState<string>(enrollments[0]!.course_id);
  const [week, setWeek] = useState<WeekChoice>("this");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const reqId = useRef(0);

  const load = useCallback(
    async (nextCourseId: string, nextWeek: WeekChoice) => {
      const myReq = ++reqId.current;
      setStatus("loading");
      try {
        const supabase = createClient();
        // The RPC is new; cast around the generated Functions type so we do
        // not have to regenerate `types/supabase.ts` to ship this change.
        const { data, error } = await (
          supabase.rpc as unknown as (
            fn: string,
            params: Record<string, unknown>
          ) => Promise<{ data: LeaderboardRow[] | null; error: unknown }>
        )("get_weekly_leaderboard", {
          p_course_id: nextCourseId,
          p_week_start: paramForWeek(nextWeek),
        });
        if (reqId.current !== myReq) return;
        if (error) {
          setStatus("error");
          setRows([]);
          return;
        }
        setRows(data ?? []);
        setStatus("idle");
      } catch {
        if (reqId.current !== myReq) return;
        setStatus("error");
        setRows([]);
      }
    },
    []
  );

  useEffect(() => {
    // Fetching the leaderboard IS the external-system sync this effect is
    // here for. `load` sets `status` to "loading" before awaiting the RPC
    // and to "idle" or "error" after -- the only honest way to drive a
    // request lifecycle from an effect. The new react-hooks rule flags any
    // setState reachable from an effect body, but there is no non-effect
    // seam for "the course picker or week toggle changed, go fetch again",
    // so disable it here on purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(courseId, week);
  }, [courseId, week, load]);

  // Partition into visible (top block) and the caller row pinned at the
  // bottom when the server returned them past the top block. "Past the top
  // block" is detected by a gap in ranks rather than a hard-coded 50, so the
  // UI stays correct if the server's cap ever changes.
  const partition = useMemo(() => {
    const visible: LeaderboardRow[] = [];
    let outside: LeaderboardRow | null = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (i === 0 || rows[i - 1]!.rank + 1 >= r.rank) {
        visible.push(r);
      } else {
        outside = r;
        break;
      }
    }
    return { visible, outside };
  }, [rows]);

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-[2fr_auto]">
        {enrollments.length > 1 ? (
          <Select
            value={courseId}
            onValueChange={(v) => {
              if (v != null) setCourseId(v);
            }}
          >
            <SelectTrigger className="h-11 rounded-xl border-border bg-card">
              <SelectValue placeholder="Choose a course" />
            </SelectTrigger>
            <SelectContent>
              {enrollments.map((e) => (
                <SelectItem key={e.course_id} value={e.course_id}>
                  {e.course_title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4">
            <Trophy className="h-4 w-4 text-brand-orange" />
            <span className="truncate text-sm font-medium">
              {enrollments[0]!.course_title}
            </span>
          </div>
        )}
        <div
          role="tablist"
          aria-label="Week"
          className="grid grid-cols-2 rounded-xl border border-border bg-card p-1"
        >
          <WeekTab
            label="This week"
            selected={week === "this"}
            onSelect={() => setWeek("this")}
          />
          <WeekTab
            label="Last week"
            selected={week === "last"}
            onSelect={() => setWeek("last")}
          />
        </div>
      </div>

      <div className="mt-6" aria-live="polite">
        {status === "loading" ? (
          <ListSkeleton />
        ) : status === "error" ? (
          <EmptyCard
            title="Could not load the leaderboard"
            detail="Try again in a moment. Your scores are safe; this is just the ranking view."
          />
        ) : partition.visible.length === 0 ? (
          <EmptyCard
            title="No tests taken this week yet"
            detail="Attempt a test from your course and come back here to see where you stand."
            cta={{ href: "/dashboard/tests", label: "Go to tests" }}
          />
        ) : (
          <>
            <ul className="space-y-2">
              {partition.visible.map((row) => (
                <Row key={`${row.rank}-${row.display_name}`} row={row} />
              ))}
            </ul>
            {partition.outside ? (
              <div className="mt-6 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Your position
                </p>
                <Row row={partition.outside} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function WeekTab({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        selected
          ? "bg-brand-orange text-white"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Row
// -----------------------------------------------------------------------------

function Row({ row }: { row: LeaderboardRow }) {
  const highlight = row.is_me;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 transition-colors",
        highlight
          ? "border-brand-orange/70 bg-brand-orange/10"
          : "border-border bg-card"
      )}
    >
      <RankBadge rank={row.rank} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              highlight ? "text-brand-orange" : "text-foreground"
            )}
          >
            {row.display_name}
          </p>
          {highlight ? (
            <span className="rounded-md bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
              you
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {row.tests_taken} {row.tests_taken === 1 ? "test" : "tests"}
        </p>
      </div>
      <p
        className={cn(
          "text-base font-bold tabular-nums",
          highlight ? "text-brand-orange" : "text-foreground"
        )}
      >
        {fmtScore(row.total_score)}
      </p>
    </li>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/60">
        <Crown className="h-5 w-5 text-amber-400" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-400/15 ring-1 ring-slate-400/60">
        <Medal className="h-5 w-5 text-slate-300" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-900/30 ring-1 ring-orange-700/70">
        <Award className="h-5 w-5 text-orange-400" />
      </span>
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-muted-foreground">
      {rank}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-3 w-1/5 rounded bg-muted" />
          </div>
          <div className="h-6 w-14 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyCard({
  title,
  detail,
  cta,
}: {
  title: string;
  detail: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background">
        <Trophy className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {detail}
      </p>
      {cta ? (
        <Button
          className="mt-5 bg-brand-orange text-white hover:bg-brand-orange-dark"
          render={<Link href={cta.href} />}
        >
          {cta.label}
        </Button>
      ) : null}
    </div>
  );
}
