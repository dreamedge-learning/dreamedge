import Image from "next/image";
import { GraduationCap } from "lucide-react";

import type { DoubtMessage } from "@/lib/doubts";
import { formatRelativeTime, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A doubt's conversation, oldest first.
 *
 * The viewer's own side sits on the right, as in any chat they already use:
 * the student's messages for the student, the teachers' for the panel.
 * Teacher messages carry a cap icon either way, because on the student's side
 * "who answered" is the point of the thread.
 */
export function DoubtMessages({
  messages,
  viewer,
}: {
  messages: DoubtMessage[];
  viewer: "student" | "admin";
}) {
  return (
    <ol className="space-y-4">
      {messages.map((message) => {
        const mine = message.author === viewer;
        const fromTeacher = message.author === "admin";

        return (
          <li
            key={message.id}
            className={cn("flex gap-2.5", mine ? "flex-row-reverse" : "flex-row")}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                fromTeacher
                  ? "bg-brand-orange text-white"
                  : "bg-muted text-muted-foreground"
              )}
              aria-hidden
            >
              {fromTeacher ? (
                <GraduationCap className="h-4 w-4" />
              ) : (
                getInitials(message.authorName)
              )}
            </div>

            <div
              className={cn(
                "min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[75%]",
                fromTeacher
                  ? "border border-brand-orange/25 bg-brand-orange/5"
                  : "border border-border bg-card"
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {message.authorName}
                {fromTeacher && <span className="text-brand-orange"> · Teacher</span>}
                <span className="font-normal">
                  {" "}
                  · <time dateTime={message.createdAt}>{formatRelativeTime(message.createdAt)}</time>
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {message.body}
              </p>
              {message.imageUrl && (
                <a
                  href={message.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block w-fit"
                  title="Open the full photo"
                >
                  {/* Unoptimised: the link is signed and short-lived, and
                      sending it through the image optimiser would cache a
                      private photo under a URL that outlives the signature. */}
                  <Image
                    src={message.imageUrl}
                    alt="Attached photo"
                    width={320}
                    height={240}
                    unoptimized
                    className="max-h-64 w-auto max-w-full rounded-lg border border-border object-contain"
                  />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
