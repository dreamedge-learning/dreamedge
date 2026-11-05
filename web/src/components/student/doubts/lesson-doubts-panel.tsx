"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, HelpCircle, Loader2, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";

import { askDoubt, listLessonDoubts } from "@/app/(student)/dashboard/doubts/actions";
import { DoubtComposer } from "@/components/doubts/doubt-composer";
import { Button } from "@/components/ui/button";
import { DOUBT_BODY_MAX, DOUBT_BODY_MIN, type DoubtThread } from "@/lib/doubts";

import { DoubtThreadCard } from "./doubt-thread-card";

type LoadState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; threads: DoubtThread[] };

/**
 * "Ask a doubt" under the lesson.
 *
 * Shows only this student's own doubts on this lesson: doubts are private
 * between a student and the teachers, so there is no class-wide Q&A here to
 * scroll through. The parent mounts one panel per lesson (keyed on the lesson
 * id), so moving to the next lesson starts a fresh load rather than briefly
 * showing the previous lesson's questions.
 */
export function LessonDoubtsPanel({ contentItemId }: { contentItemId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [asking, setAsking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listLessonDoubts(contentItemId).then(
      (result) => {
        if (cancelled) return;
        setState(
          result.data
            ? { kind: "ready", threads: result.data }
            : { kind: "failed", message: result.error ?? "Your doubts could not be loaded." }
        );
      },
      (err: unknown) => {
        console.error("LessonDoubtsPanel load failed:", err);
        if (!cancelled) setState({ kind: "failed", message: "Your doubts could not be loaded." });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [contentItemId, attempt]);

  function upsert(thread: DoubtThread) {
    setState((current) => {
      const threads = current.kind === "ready" ? current.threads : [];
      const exists = threads.some((t) => t.id === thread.id);
      return {
        kind: "ready",
        threads: exists
          ? threads.map((t) => (t.id === thread.id ? thread : t))
          : [thread, ...threads],
      };
    });
  }

  const threads = state.kind === "ready" ? state.threads : [];

  return (
    <section aria-labelledby="lesson-doubts-heading" className="mt-8 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="lesson-doubts-heading"
            className="flex items-center gap-2 text-base font-semibold text-foreground"
          >
            <MessageCircleQuestion className="h-5 w-5 text-brand-orange" />
            Doubts on this lesson
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only you and your teachers can see these. You will get a notification when a teacher replies.
          </p>
        </div>
        {!asking && (
          <Button
            size="sm"
            onClick={() => setAsking(true)}
            className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            <HelpCircle className="mr-1.5 h-4 w-4" />
            Ask a doubt
          </Button>
        )}
      </div>

      {asking && (
        <div className="mt-4 rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">What did you not understand?</p>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <DoubtComposer
            uploadAs="student"
            placeholder="Describe your doubt. Mention the step or the time in the video where you got stuck. You can add a photo of your notebook."
            submitLabel="Send doubt"
            minLength={DOUBT_BODY_MIN}
            maxLength={DOUBT_BODY_MAX}
            autoFocus
            onSubmit={async ({ body, imagePath }) => {
              const result = await askDoubt({ contentItemId, body, imagePath });
              if (result.data) {
                upsert(result.data);
                setAsking(false);
                toast.success("Doubt sent. Your teacher will reply soon.");
              }
              return { error: result.error };
            }}
          />
        </div>
      )}

      <div className="mt-4 space-y-4">
        {state.kind === "loading" && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your doubts…
          </div>
        )}

        {state.kind === "failed" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="text-destructive">{state.message}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setState({ kind: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {state.kind === "ready" && threads.length === 0 && !asking && (
          <p className="py-2 text-sm text-muted-foreground">
            Stuck on something in this lesson? Ask your teacher — no question is too small.
          </p>
        )}

        {threads.map((thread, index) => (
          <CollapsibleThread
            key={thread.id}
            thread={thread}
            defaultOpen={index === 0}
            onUpdated={upsert}
          />
        ))}

        {threads.length > 0 && (
          <Link
            href="/dashboard/doubts"
            className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            See all my doubts →
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * A thread folded down to its first line, so a lesson with several doubts
 * does not push the next-lesson buttons off the bottom of a phone screen.
 */
function CollapsibleThread({
  thread,
  defaultOpen,
  onUpdated,
}: {
  thread: DoubtThread;
  defaultOpen: boolean;
  onUpdated: (thread: DoubtThread) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const question = thread.messages[0]?.body ?? "";
  const replies = thread.messages.length - 1;

  if (open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          Collapse
        </button>
        <DoubtThreadCard thread={thread} onUpdated={onUpdated} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{question}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {replies === 0 ? "No replies yet" : `${replies} ${replies === 1 ? "reply" : "replies"}`}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
