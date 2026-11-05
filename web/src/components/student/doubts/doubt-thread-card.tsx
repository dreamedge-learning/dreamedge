"use client";

import Link from "next/link";
import { BookOpen, Lock } from "lucide-react";

import { replyToDoubt } from "@/app/(student)/dashboard/doubts/actions";
import { DoubtComposer } from "@/components/doubts/doubt-composer";
import { DoubtMessages } from "@/components/doubts/doubt-messages";
import {
  DOUBT_STATUS_STYLES,
  REPLY_BODY_MAX,
  REPLY_BODY_MIN,
  STUDENT_STATUS_LABEL,
  lessonHref,
  type DoubtThread,
} from "@/lib/doubts";
import { cn } from "@/lib/utils";

export function DoubtStatusPill({ status }: { status: DoubtThread["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        DOUBT_STATUS_STYLES[status]
      )}
    >
      {STUDENT_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * One doubt with its replies and a box to follow up.
 *
 * The follow-up box goes away once a teacher closes the doubt -- the database
 * refuses those messages, and an input that can only fail is worse than a
 * plain sentence saying why.
 */
export function DoubtThreadCard({
  thread,
  onUpdated,
  showLesson = false,
}: {
  thread: DoubtThread;
  onUpdated: (thread: DoubtThread) => void;
  /** On the lesson page the lesson is obvious; elsewhere it is the heading. */
  showLesson?: boolean;
}) {
  const href = lessonHref(thread.courseSlug, thread.contentItemId);

  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        {showLesson ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {thread.lessonTitle ?? "Lesson"}
            </p>
            {thread.courseTitle && (
              <p className="truncate text-xs text-muted-foreground">{thread.courseTitle}</p>
            )}
          </div>
        ) : (
          <span />
        )}
        <DoubtStatusPill status={thread.status} />
      </header>

      <DoubtMessages messages={thread.messages} viewer="student" />

      <div className="mt-5 border-t border-border pt-4">
        {thread.status === "closed" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            Your teacher has closed this doubt. If you are still stuck, ask a new one.
          </p>
        ) : (
          <DoubtComposer
            uploadAs="student"
            placeholder="Still confused? Reply to your teacher…"
            submitLabel="Reply"
            minLength={REPLY_BODY_MIN}
            maxLength={REPLY_BODY_MAX}
            onSubmit={async ({ body, imagePath }) => {
              const result = await replyToDoubt({ doubtId: thread.id, body, imagePath });
              if (result.data) onUpdated(result.data);
              return { error: result.error };
            }}
          />
        )}
      </div>

      {showLesson && href && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-orange hover:underline"
        >
          <BookOpen className="h-4 w-4" />
          Open the lesson
        </Link>
      )}
    </article>
  );
}
