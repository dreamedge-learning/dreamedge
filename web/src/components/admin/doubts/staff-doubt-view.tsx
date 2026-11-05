"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Lock, LockOpen, UserCheck } from "lucide-react";
import { toast } from "sonner";

import {
  assignDoubtToMe,
  replyToDoubtAsStaff,
  setDoubtClosed,
  type StaffDoubtThread,
} from "@/app/admin/(panel)/doubts/actions";
import { DoubtComposer } from "@/components/doubts/doubt-composer";
import { DoubtMessages } from "@/components/doubts/doubt-messages";
import { Button } from "@/components/ui/button";
import {
  DOUBT_STATUS_STYLES,
  REPLY_BODY_MAX,
  REPLY_BODY_MIN,
  STAFF_STATUS_LABEL,
} from "@/lib/doubts";
import { cn } from "@/lib/utils";

/**
 * One doubt, from the teacher's side: where it was asked, who asked it, the
 * conversation, and the reply box.
 *
 * Every action returns the refreshed doubt from the server, which replaces
 * the one on screen, so status, assignee and messages never disagree with
 * what was saved.
 */
export function StaffDoubtView({
  initialDoubt,
  canAnswer,
  adminId,
}: {
  initialDoubt: StaffDoubtThread;
  /** Support staff read the thread but neither reply nor close. */
  canAnswer: boolean;
  adminId: string;
}) {
  const [doubt, setDoubt] = useState(initialDoubt);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ data?: StaffDoubtThread; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error || !result.data) {
        toast.error(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDoubt(result.data);
      if (done) toast.success(done);
    });
  }

  const crumbs = [doubt.courseTitle, doubt.subjectName, doubt.topicName].filter(
    (part): part is string => !!part
  );
  const assignedToMe = doubt.assignedTo?.id === adminId;
  const closed = doubt.status === "closed";

  return (
    <div className="space-y-4">
      {/* Where it was asked */}
      <section className="rounded-lg border border-border bg-card p-4">
        {crumbs.length > 0 && (
          <nav aria-label="Lesson location" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {crumb}
              </span>
            ))}
          </nav>
        )}
        <h1 className="mt-1 text-lg font-semibold">{doubt.lessonTitle ?? "Lesson"}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              DOUBT_STATUS_STYLES[doubt.status]
            )}
          >
            {STAFF_STATUS_LABEL[doubt.status]}
          </span>
          <span className="font-medium">{doubt.student.name}</span>
          <span className="text-muted-foreground">
            {[
              doubt.student.className ? `Class ${doubt.student.className}` : null,
              doubt.student.board,
              doubt.student.code,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {doubt.assignedTo ? (
            <>
              <UserCheck className="mr-1 inline h-3.5 w-3.5" />
              {assignedToMe ? "Assigned to you" : `Assigned to ${doubt.assignedTo.name}`}
            </>
          ) : (
            "Not assigned"
          )}
        </p>

        {canAnswer && (
          <div className="mt-4 flex flex-wrap gap-2">
            {!assignedToMe && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => assignDoubtToMe(doubt.id), "Assigned to you.")}
              >
                <UserCheck className="mr-1.5 h-4 w-4" />
                Assign to me
              </Button>
            )}
            {closed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(() => setDoubtClosed({ doubtId: doubt.id, closed: false }), "Doubt reopened.")
                }
              >
                <LockOpen className="mr-1.5 h-4 w-4" />
                Reopen
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(() => setDoubtClosed({ doubtId: doubt.id, closed: true }), "Doubt closed.")
                }
              >
                <Lock className="mr-1.5 h-4 w-4" />
                Close
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Conversation */}
      <section className="rounded-lg border border-border bg-card p-4">
        <DoubtMessages messages={doubt.messages} viewer="admin" />
      </section>

      {/* Reply */}
      {canAnswer && (
        <section className="rounded-lg border border-border bg-card p-4">
          {closed ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              This doubt is closed. Reopen it to reply.
            </p>
          ) : (
            <DoubtComposer
              uploadAs="staff"
              placeholder={`Reply to ${doubt.student.name}…`}
              submitLabel="Send reply"
              minLength={REPLY_BODY_MIN}
              maxLength={REPLY_BODY_MAX}
              disabled={isPending}
              onSubmit={async ({ body, imagePath }) => {
                const result = await replyToDoubtAsStaff({ doubtId: doubt.id, body, imagePath });
                if (result.data) {
                  setDoubt(result.data);
                  toast.success("Reply sent. The student has been notified.");
                }
                return { error: result.error };
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
