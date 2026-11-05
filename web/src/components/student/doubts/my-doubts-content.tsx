import Link from "next/link";
import { ChevronRight, MessageCircleQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DoubtSummary } from "@/lib/doubts";
import { formatRelativeTime } from "@/lib/format";

import { DoubtStatusPill } from "./doubt-thread-card";

/**
 * The student's list of doubts. One card per doubt; the whole card opens the
 * thread. Single column at every width so a long lesson title wraps instead
 * of pushing the status off a 360 px screen.
 */
export function MyDoubtsContent({ doubts }: { doubts: DoubtSummary[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My doubts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Questions you have asked your teachers, and their answers. To ask a new
          one, open the lesson and use &ldquo;Ask a doubt&rdquo;.
        </p>
      </header>

      {doubts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MessageCircleQuestion className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-semibold">No doubts yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            When something in a lesson does not make sense, ask from the lesson
            page. Your teacher&apos;s answer will show up here.
          </p>
          <Button variant="outline" size="sm" className="mt-5" render={<Link href="/dashboard/my-courses" />}>
            Go to my courses
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {doubts.map((doubt) => (
            <li key={doubt.id}>
              <Link
                href={`/dashboard/doubts/${doubt.id}`}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DoubtStatusPill status={doubt.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(doubt.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-foreground">{doubt.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {doubt.lessonTitle ?? "Lesson"}
                    {doubt.courseTitle ? ` · ${doubt.courseTitle}` : ""}
                    {" · "}
                    {doubt.replyCount === 0
                      ? "No replies yet"
                      : `${doubt.replyCount} ${doubt.replyCount === 1 ? "reply" : "replies"}`}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
