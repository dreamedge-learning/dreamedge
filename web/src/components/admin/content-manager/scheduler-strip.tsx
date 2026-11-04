"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getSchedulerHealth,
  publishDueNow,
  type SchedulerHealth,
} from "@/app/admin/(panel)/content/manager/actions";

/**
 * Whether scheduled publishing is actually working.
 *
 * On screen rather than assumed. A cron job that stops firing says nothing:
 * the lesson simply never appears, and the first person to notice is a student
 * who was told it would be there. One line is enough as long as it is honest
 * about the three states that matter -- no job, a failed run, and items past
 * their time.
 */
function describe(health: SchedulerHealth): {
  tone: "ok" | "warn";
  text: string;
} {
  if (!health.job_exists) {
    return {
      tone: "warn",
      text: "Scheduled publishing is not registered — dated lessons will never go live.",
    };
  }

  if (health.last_status && health.last_status !== "succeeded") {
    return {
      tone: "warn",
      text: `The last publishing run ${health.last_status}. Dated lessons may be stuck.`,
    };
  }

  // Named before the generic overdue line, because this one has a cause and a
  // fix rather than being a symptom of a broken job.
  if (health.blocked_no_poster > 0) {
    const n = health.blocked_no_poster;
    return {
      tone: "warn",
      text:
        `${n} scheduled video lesson${n === 1 ? "" : "s"} cannot publish without a poster`
        + `${health.overdue > n ? ` (${health.overdue} overdue in total)` : ""}. Add one and it goes live on the next run.`,
    };
  }

  if (health.overdue > 0) {
    return {
      tone: "warn",
      text: `${health.overdue} lesson${health.overdue === 1 ? "" : "s"} past their publish time and still in draft.`,
    };
  }

  if (health.next_due_at) {
    const when = new Date(health.next_due_at).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return { tone: "ok", text: `Next scheduled publish: ${when}.` };
  }

  if (!health.last_run_at) {
    return {
      tone: "ok",
      text: "Scheduled publishing is registered but has not run yet.",
    };
  }

  return { tone: "ok", text: "Scheduled publishing is running. Nothing waiting." };
}

export function SchedulerStrip() {
  const [health, setHealth] = useState<SchedulerHealth | null>(null);
  const [pending, startTransition] = useTransition();

  // Read in the promise callback, not the effect body: setting state straight
  // from the body cascades a render before the first has painted, which the
  // lint rule treats as an error.
  useEffect(() => {
    let active = true;

    void getSchedulerHealth().then((result) => {
      if (!active || result.error || !result.data) return;
      setHealth(result.data);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!health) return null;

  const { tone, text } = describe(health);

  function runNow() {
    startTransition(async () => {
      const result = await publishDueNow();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      const published = result.data?.published ?? 0;
      toast.success(
        published > 0
          ? `Published ${published} lesson${published === 1 ? "" : "s"}.`
          : "Nothing was due."
      );

      const refreshed = await getSchedulerHealth();
      if (refreshed.data) setHealth(refreshed.data);
    });
  }

  return (
    <div
      className={
        tone === "warn"
          ? "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400"
          : "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground"
      }
    >
      {tone === "warn" ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      )}

      <span className="min-w-0 flex-1">{text}</span>

      {health.last_run_at && (
        <span className="flex shrink-0 items-center gap-1">
          {health.last_status === "succeeded" && (
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          )}
          last run{" "}
          {new Date(health.last_run_at).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}

      {health.overdue > health.blocked_no_poster && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 shrink-0 text-xs"
          disabled={pending}
          onClick={runNow}
        >
          Publish them now
        </Button>
      )}
    </div>
  );
}
