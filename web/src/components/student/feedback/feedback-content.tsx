"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquare, Send, CheckCircle2, Clock, Inbox } from "lucide-react";
import { toast } from "sonner";

import { submitFeedback } from "@/app/(student)/dashboard/feedback/actions";
import type { FeedbackHistoryItem } from "@/app/(student)/dashboard/feedback/page";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_RATE_LIMIT_PER_DAY,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/validations/feedback";

interface Props {
  history: FeedbackHistoryItem[];
}

/**
 * The student's send-feedback page.
 *
 * Form on top, history below. The character counter reads the textarea on
 * every keystroke because the real budget comes from the database check, and
 * showing it in real time is what stops a student discovering 2000 is the
 * limit by hitting Submit with 2100 characters typed.
 */
export function FeedbackContent({ history }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>("content");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [recent, setRecent] = useState<FeedbackHistoryItem[]>(history);
  const formRef = useRef<HTMLFormElement | null>(null);

  const trimmedLength = message.trim().length;
  const valid =
    trimmedLength >= FEEDBACK_MESSAGE_MIN && message.length <= FEEDBACK_MESSAGE_MAX;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending) return;

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await submitFeedback(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Thanks -- we've received your feedback.");
      setMessage("");
      formRef.current?.reset();
      setCategory("content");

      // Optimistic prepend: the server-rendered page is regenerated on the
      // next visit (revalidatePath in the action), but a student staying on
      // this page should still see what they just sent.
      setRecent((prev) => [
        {
          id: `local-${Date.now()}`,
          category: formData.get("category") as FeedbackCategory,
          message: String(formData.get("message") ?? ""),
          status: "new",
          createdAt: new Date().toISOString(),
          handledAt: null,
        },
        ...prev,
      ]);
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Send feedback
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Found a bug, have an idea, or something not working the way you
          expected? Tell us -- Rahul Sir and the team read every message.
        </p>
      </header>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="space-y-5">
          <div>
            <label
              htmlFor="feedback-category"
              className="mb-1.5 block text-sm font-semibold"
            >
              What is this about?
            </label>
            <select
              id="feedback-category"
              name="category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as FeedbackCategory)
              }
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
            >
              {FEEDBACK_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {FEEDBACK_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <label
                htmlFor="feedback-message"
                className="block text-sm font-semibold"
              >
                Your message
              </label>
              <span
                className={
                  "text-xs tabular-nums " +
                  (message.length > FEEDBACK_MESSAGE_MAX
                    ? "text-destructive"
                    : "text-muted-foreground")
                }
                aria-live="polite"
              >
                {message.length}/{FEEDBACK_MESSAGE_MAX}
              </span>
            </div>
            <textarea
              id="feedback-message"
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={FEEDBACK_MESSAGE_MAX + 50}
              rows={6}
              placeholder={`What would you like to tell us? Minimum ${FEEDBACK_MESSAGE_MIN} characters.`}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
              required
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Up to {FEEDBACK_RATE_LIMIT_PER_DAY} messages a day. Please do not
              include passwords.
            </p>
            <button
              type="submit"
              disabled={!valid || pending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {pending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </form>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your past feedback
          </h2>
        </div>
        {/* The inbox is one-way: the team's notes on a message stay internal,
            so say plainly where an answer would come from instead of leaving
            the student waiting for a reply on this page. */}
        <p className="mb-4 text-sm text-muted-foreground">
          Each message shows whether the team has read it or resolved it. If
          we need to get back to you, we will use the email or phone number on
          your profile.
        </p>

        {recent.length === 0 ? (
          <HistoryEmpty />
        ) : (
          <ul className="space-y-3">
            {recent.map((item) => (
              <li key={item.id}>
                <HistoryCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-base font-semibold">Nothing sent yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Anything you send will show up here, with its status.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function HistoryCard({ item }: { item: FeedbackHistoryItem }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {FEEDBACK_CATEGORY_LABELS[item.category]}
          </span>
          <StatusPill status={item.status} />
        </div>
        <time
          dateTime={item.createdAt}
          className="text-xs text-muted-foreground"
        >
          {formatTimestamp(item.createdAt)}
        </time>
      </header>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground/90">
        {item.message}
      </p>

    </article>
  );
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  const base =
    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium";

  if (status === "resolved") {
    return (
      <span className={base + " bg-emerald-500/10 text-emerald-500"}>
        <CheckCircle2 className="h-3 w-3" />
        {FEEDBACK_STATUS_LABELS.resolved}
      </span>
    );
  }
  if (status === "read") {
    return (
      <span className={base + " bg-sky-500/10 text-sky-500"}>
        <Clock className="h-3 w-3" />
        {FEEDBACK_STATUS_LABELS.read}
      </span>
    );
  }
  return (
    <span className={base + " bg-brand-orange/10 text-brand-orange"}>
      <Clock className="h-3 w-3" />
      {FEEDBACK_STATUS_LABELS.new}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
