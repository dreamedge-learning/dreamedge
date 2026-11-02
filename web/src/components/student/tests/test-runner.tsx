"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  loadQuestions,
  logEvent,
  saveAnswers,
  startAttempt,
  submitAttempt,
  type SubmitResult,
  type TestQuestion,
} from "@/app/(student)/dashboard/tests/[id]/take/actions";

/**
 * The paper, as a student sees it.
 *
 * One question on screen at a time, a sidebar grid of question numbers for
 * jumping, a visible countdown anchored to the server's clock, and autosave
 * so a dropped connection does not lose work.
 *
 * Proctoring is strict. A tab switch, a window blur, or an exit from
 * fullscreen auto-submits the attempt as a violation -- the student sees
 * the attempt close and the results screen a moment later. The server
 * grades either way, so the submit is the same whether the student
 * chose it or the browser did.
 */

interface TestMeta {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  passPercentage: number | null;
  negativeMarking: boolean;
  showResultsImmediately: boolean;
}

interface Props {
  test: TestMeta;
}

type AnswerValue =
  | number
  | number[]
  | string
  | Record<string, string>
  | null;

/**
 * The whole screen is one state machine. "loading" is before the attempt
 * exists; "ready" is the paper; "submitting" blocks the UI while the
 * server scores; "done" shows the result.
 */
type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" }
  | { kind: "submitting" }
  | { kind: "done"; result: SubmitResult; auto: boolean };

const AUTOSAVE_MS = 15_000;
const AUTOSAVE_DEBOUNCE_MS = 1_500;

export function TestRunner({ test }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [serverExpiresAt, setServerExpiresAt] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Latest-value refs used from event listeners and timers. Updated in
  // an effect rather than during render so React's rules of hooks stay
  // satisfied; the lag is one render frame, which is harmless here.
  const answersRef = useRef(answers);
  const attemptIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ---------------------------------------------------------------------
  // Boot: start / resume the attempt and fetch the paper
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = await startAttempt(test.id);
      if (cancelled) return;

      if (start.error || !start.data) {
        setPhase({
          kind: "error",
          message: start.error ?? "Could not start this test.",
        });
        return;
      }

      const { data } = start;
      setAttemptId(data.attemptId);
      setServerExpiresAt(Date.parse(data.expiresAt));
      setClockOffsetMs(Date.parse(data.serverNow) - Date.now());

      const saved = (data.answers ?? {}) as Record<string, AnswerValue>;
      setAnswers(saved);

      const qResult = await loadQuestions(test.id);
      if (cancelled) return;

      if (qResult.error || !qResult.data) {
        setPhase({
          kind: "error",
          message: qResult.error ?? "Could not load this test's questions.",
        });
        return;
      }

      setQuestions(qResult.data);
      setPhase({ kind: "ready" });

      if (data.resumed) {
        toast.info("Picked up where you left off.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [test.id]);

  // ---------------------------------------------------------------------
  // The submit path. One function covers manual and auto; the server
  // decides what to do with p_auto, and the ref dance guards against
  // double-submits (visibility + unload could both fire in the same ms).
  // ---------------------------------------------------------------------
  const submitting = useRef(false);
  const submit = useCallback(
    async (auto: boolean, { silent } = { silent: false }) => {
      const id = attemptIdRef.current;
      if (!id) return;
      if (submitting.current) return;
      if (
        phaseRef.current.kind === "submitting" ||
        phaseRef.current.kind === "done"
      ) {
        return;
      }
      submitting.current = true;

      if (!silent) setPhase({ kind: "submitting" });

      // Save first, so an auto-submit records whatever is on screen rather
      // than only what the autosave timer last persisted.
      await saveAnswers(id, answersRef.current).catch(() => undefined);

      const result = await submitAttempt(id, auto);
      submitting.current = false;

      if (result.error || !result.data) {
        setPhase({
          kind: "error",
          message: result.error ?? "Could not submit this attempt.",
        });
        return;
      }

      setPhase({ kind: "done", result: result.data, auto });
    },
    [],
  );

  const persistAnswers = useCallback(async () => {
    const id = attemptIdRef.current;
    if (!id) return;
    if (phaseRef.current.kind !== "ready") return;
    setSaving(true);
    const result = await saveAnswers(id, answersRef.current);
    setSaving(false);
    if (result.error) {
      // A refused save usually means the deadline has passed. The timer
      // effect will trip the auto-submit next tick.
      console.warn("[test-runner] save failed:", result.error);
    } else {
      setSavedAt(Date.now());
    }
  }, []);

  // ---------------------------------------------------------------------
  // Autosave: debounce on every answer change, plus a safety-net interval
  // ---------------------------------------------------------------------
  const debounceTimer = useRef<number | null>(null);
  useEffect(() => {
    if (phase.kind !== "ready") return;
    if (!attemptId) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      void persistAnswers();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [answers, attemptId, phase.kind, persistAnswers]);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    const id = window.setInterval(() => {
      void persistAnswers();
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [phase.kind, persistAnswers]);

  // ---------------------------------------------------------------------
  // Timer: counts down against the server-anchored deadline. The device
  // clock is only used for a diff since the last anchor so the display
  // ticks every second without a round trip.
  // ---------------------------------------------------------------------
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!serverExpiresAt) return;
    const tick = () => {
      const serverNow = Date.now() + clockOffsetMs;
      setRemainingMs(Math.max(0, serverExpiresAt - serverNow));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [serverExpiresAt, clockOffsetMs]);

  useEffect(() => {
    if (remainingMs === 0 && phase.kind === "ready") {
      // Defer the submit out of the effect's synchronous phase so the
      // setPhase inside submit() does not render-cascade -- the UX is
      // the same, the lint rule is appeased.
      const id = window.setTimeout(() => void submit(true), 0);
      return () => window.clearTimeout(id);
    }
  }, [remainingMs, phase.kind, submit]);

  // ---------------------------------------------------------------------
  // Proctoring: tab switch, window blur and fullscreen exit each log and
  // then auto-submit. One strike -- the student was told at the start.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (phase.kind !== "ready") return;

    const handleHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (!attemptIdRef.current) return;
      void (async () => {
        await logEvent(attemptIdRef.current!, "visibility_hidden").catch(
          () => undefined,
        );
        void submit(true);
      })();
    };

    const handleBlur = () => {
      if (!attemptIdRef.current) return;
      // visibilitychange already covers switching tabs; a plain blur is
      // the only signal for an app-switch on some browsers. Both routes
      // call submit, and the ref inside guards against double-firing.
      void (async () => {
        await logEvent(attemptIdRef.current!, "window_blur").catch(
          () => undefined,
        );
        void submit(true);
      })();
    };

    const handleFsExit = () => {
      if (document.fullscreenElement) return;
      if (!attemptIdRef.current) return;
      void (async () => {
        await logEvent(attemptIdRef.current!, "fullscreen_exit").catch(
          () => undefined,
        );
        void submit(true);
      })();
    };

    document.addEventListener("visibilitychange", handleHidden);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFsExit);

    return () => {
      document.removeEventListener("visibilitychange", handleHidden);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFsExit);
    };
  }, [phase.kind, submit]);

  // Warn on reload/close before the attempt is submitted.
  useEffect(() => {
    if (phase.kind !== "ready") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase.kind]);

  // ---------------------------------------------------------------------
  // Rendering branches
  // ---------------------------------------------------------------------
  if (phase.kind === "loading") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-brand-orange" />
          Preparing your paper…
        </div>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
        <h1 className="mt-4 text-xl font-semibold">We can’t start this test</h1>
        <p className="mt-2 text-sm text-muted-foreground">{phase.message}</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/tests")}
          className="mt-6 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
        >
          Back to tests
        </button>
      </div>
    );
  }

  if (phase.kind === "submitting") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-brand-orange" />
          Submitting and scoring your attempt…
        </div>
      </div>
    );
  }

  if (phase.kind === "done") {
    return (
      <ResultsPanel
        testName={test.name}
        passPercentage={test.passPercentage}
        auto={phase.auto}
        result={phase.result}
        onBack={() => router.push("/dashboard/tests")}
      />
    );
  }

  // phase.kind === "ready"
  const question = questions[currentIndex];
  if (!question) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-4 text-sm text-muted-foreground">
          This test has no questions yet.
        </p>
      </div>
    );
  }

  const answered = Object.keys(answers).filter(
    (k) => !isEmpty(answers[k]),
  ).length;

  const requiredUnanswered = questions
    .filter((q) => q.is_required)
    .filter((q) => isEmpty(answers[q.id]));

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header: name + timer + saving indicator */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">
              {test.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {answered} / {questions.length} answered
              {saving ? " · Saving…" : savedAt ? " · Saved" : ""}
            </p>
          </div>
          <TimerChip remainingMs={remainingMs} />
          <button
            type="button"
            onClick={() => void confirmSubmit()}
            className="rounded-lg bg-brand-orange px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
          >
            Submit
          </button>
        </div>
        <ProctoringBanner />
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_240px]">
        {/* Question body */}
        <main>
          <QuestionCard
            index={currentIndex}
            total={questions.length}
            question={question}
            answer={answers[question.id] ?? null}
            flagged={flagged[question.id] === true}
            onAnswer={(value) =>
              setAnswers((prev) => ({ ...prev, [question.id]: value }))
            }
            onFlag={() =>
              setFlagged((prev) => ({
                ...prev,
                [question.id]: !prev[question.id],
              }))
            }
          />

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            {currentIndex === questions.length - 1 ? (
              <button
                type="button"
                onClick={() => void confirmSubmit()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
              >
                Finish & submit
                <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </main>

        {/* Nav grid */}
        <aside className="order-first lg:order-last lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Questions
            </p>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-5">
              {questions.map((q, i) => {
                const isAnswered = !isEmpty(answers[q.id]);
                const isFlagged = flagged[q.id] === true;
                const isCurrent = i === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(i)}
                    className={
                      "flex h-9 items-center justify-center rounded-md border text-xs font-semibold transition-colors " +
                      (isCurrent
                        ? "border-brand-orange bg-brand-orange text-white"
                        : isFlagged
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : isAnswered
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-border bg-background text-muted-foreground hover:bg-muted")
                    }
                    aria-label={`Go to question ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded border border-brand-orange bg-brand-orange" />
                Current
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded border border-emerald-500/40 bg-emerald-500/10" />
                Answered
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded border border-amber-500/50 bg-amber-500/10" />
                Flagged
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded border border-border bg-background" />
                Unanswered
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );

  function confirmSubmit(): Promise<void> {
    const message =
      requiredUnanswered.length > 0
        ? `You have ${requiredUnanswered.length} required question${
            requiredUnanswered.length === 1 ? "" : "s"
          } unanswered. Submit anyway?`
        : "Submit this attempt? You cannot change your answers after this.";
    if (!window.confirm(message)) return Promise.resolve();
    return submit(false);
  }
}

// =========================================================================
// Pieces
// =========================================================================

function TimerChip({ remainingMs }: { remainingMs: number | null }) {
  if (remainingMs == null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        --:--
      </span>
    );
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const danger = remainingMs < 60_000;

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums " +
        (danger
          ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")
      }
    >
      <Clock className="h-3.5 w-3.5" />
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function ProctoringBanner() {
  return (
    <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-center text-[11px] font-medium text-amber-700 dark:text-amber-400 sm:px-6">
      <span className="inline-flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5" />
        Switching tabs, blurring the window or leaving fullscreen will submit
        your attempt automatically.
      </span>
    </div>
  );
}

function QuestionCard({
  index,
  total,
  question,
  answer,
  flagged,
  onAnswer,
  onFlag,
}: {
  index: number;
  total: number;
  question: TestQuestion;
  answer: AnswerValue;
  flagged: boolean;
  onAnswer: (value: AnswerValue) => void;
  onFlag: () => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Question {index + 1} of {total}
          </p>
          <h2 className="mt-2 text-base font-semibold sm:text-lg">
            <span className="mr-2 text-muted-foreground">Q{index + 1}.</span>
            <QuestionBody text={question.content} />
          </h2>
          {question.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.image_url}
              alt=""
              className="mt-4 max-h-80 rounded-lg border border-border"
            />
          )}
          {question.hint && (
            <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Hint: {question.hint}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onFlag}
          className={
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors " +
            (flagged
              ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border bg-background text-muted-foreground hover:bg-muted")
          }
        >
          <Flag className="h-3.5 w-3.5" />
          {flagged ? "Flagged" : "Flag"}
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <QuestionInput question={question} answer={answer} onAnswer={onAnswer} />
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-5">
        {question.positive_marks > 0 && (
          <span>+{question.positive_marks} for a correct answer</span>
        )}
        {question.negative_marks > 0 && (
          <span>−{question.negative_marks} for a wrong one</span>
        )}
        {question.is_required && <span>Required</span>}
      </footer>
    </article>
  );
}

function QuestionBody({ text }: { text: string }) {
  // Preserve newlines so a multi-line stem reads correctly.
  return <span className="whitespace-pre-wrap break-words">{text}</span>;
}

function QuestionInput({
  question,
  answer,
  onAnswer,
}: {
  question: TestQuestion;
  answer: AnswerValue;
  onAnswer: (value: AnswerValue) => void;
}) {
  switch (question.type) {
    case "mcq_single":
    case "image_based":
      return (
        <ChoiceInput
          options={question.options as { id: number; text: string }[]}
          multiple={false}
          value={typeof answer === "number" ? answer : null}
          onChange={(v) => onAnswer(v)}
        />
      );
    case "mcq_multiple":
      return (
        <ChoiceInput
          options={question.options as { id: number; text: string }[]}
          multiple
          value={Array.isArray(answer) ? (answer as number[]) : []}
          onChange={(v) => onAnswer(v)}
        />
      );
    case "true_false":
      return (
        <ChoiceInput
          options={[
            { id: 0, text: "True" },
            { id: 1, text: "False" },
          ]}
          multiple={false}
          value={answer === "true" ? 0 : answer === "false" ? 1 : null}
          onChange={(v) => onAnswer(v === 0 ? "true" : "false")}
        />
      );
    case "short_answer":
      return (
        <input
          type="text"
          value={typeof answer === "string" ? answer : ""}
          onChange={(e) => onAnswer(e.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Type your answer"
          maxLength={200}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      );
    case "subjective":
      return (
        <textarea
          value={typeof answer === "string" ? answer : ""}
          onChange={(e) => onAnswer(e.target.value)}
          className="min-h-[160px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Write your answer. A mentor will mark this one."
          maxLength={5000}
        />
      );
    case "match_pair": {
      const opts = question.options as {
        left: string[];
        right: string[];
      } | null;
      if (!opts) return <p className="text-sm text-muted-foreground">—</p>;
      const current =
        answer && typeof answer === "object" && !Array.isArray(answer)
          ? (answer as Record<string, string>)
          : {};
      return (
        <ul className="space-y-3">
          {opts.left.map((leftText, i) => (
            <li
              key={i}
              className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]"
            >
              <span className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
                {leftText}
              </span>
              <span className="hidden text-center text-muted-foreground sm:block">
                →
              </span>
              <select
                value={current[String(i)] ?? ""}
                onChange={(e) =>
                  onAnswer({ ...current, [String(i)]: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Pick a match…</option>
                {opts.right.map((rightText, j) => (
                  <option key={j} value={rightText}>
                    {rightText}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      );
    }
    default:
      return (
        <p className="text-sm text-muted-foreground">
          Unsupported question type.
        </p>
      );
  }
}

function ChoiceInput({
  options,
  multiple,
  value,
  onChange,
}: {
  options: { id: number; text: string }[];
  multiple: boolean;
  value: number | number[] | null;
  onChange: (next: number | number[]) => void;
}) {
  const selected = multiple
    ? new Set(Array.isArray(value) ? value : [])
    : new Set(typeof value === "number" ? [value] : []);

  return (
    <ul className="space-y-2">
      {options.map((option) => {
        const isSelected = selected.has(option.id);
        return (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => {
                if (multiple) {
                  const next = new Set(selected);
                  if (next.has(option.id)) next.delete(option.id);
                  else next.add(option.id);
                  onChange(Array.from(next).sort((a, b) => a - b));
                } else {
                  onChange(option.id);
                }
              }}
              className={
                "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors " +
                (isSelected
                  ? "border-brand-orange bg-brand-orange/5"
                  : "border-border bg-background hover:border-brand-orange/40 hover:bg-muted/50")
              }
            >
              <span
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center " +
                  (multiple ? "rounded" : "rounded-full") +
                  " border-2 " +
                  (isSelected
                    ? "border-brand-orange bg-brand-orange"
                    : "border-muted-foreground/40")
                }
              >
                {isSelected &&
                  (multiple ? (
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3 w-3 text-white"
                      fill="currentColor"
                    >
                      <path d="M7.629 14.571l-3.2-3.2 1.414-1.414L7.629 11.743l6.528-6.528 1.414 1.414z" />
                    </svg>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  ))}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {option.text}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ResultsPanel({
  testName,
  passPercentage,
  auto,
  result,
  onBack,
}: {
  testName: string;
  passPercentage: number | null;
  auto: boolean;
  result: SubmitResult;
  onBack: () => void;
}) {
  const pct = Number.isFinite(result.percentage) ? result.percentage : 0;
  const showScore = result.showResults;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div
          className={
            "mx-auto flex h-14 w-14 items-center justify-center rounded-full " +
            (result.awaitingReview
              ? "bg-amber-500/10 text-amber-600"
              : result.passed
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-rose-500/10 text-rose-600")
          }
        >
          <CheckCircle2 className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-center text-xl font-bold sm:text-2xl">
          {result.awaitingReview
            ? "Submitted — awaiting review"
            : result.passed
              ? "Nicely done"
              : "Submitted"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {testName}
          {auto && (
            <>
              {" "}
              <span className="text-amber-600">· auto-submitted</span>
            </>
          )}
        </p>

        {showScore ? (
          <dl className="mt-6 grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
            <Stat label="Score" value={result.score.toString()} />
            <Stat label="Out of" value={result.totalMarks.toString()} />
            <Stat label="Percentage" value={`${pct.toFixed(1)}%`} />
          </dl>
        ) : (
          <p className="mt-6 rounded-lg bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground">
            Results will be shared once your teacher has reviewed them.
          </p>
        )}

        {passPercentage != null && showScore && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Passing mark: {passPercentage}%
          </p>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-6 w-full rounded-lg bg-brand-orange py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
        >
          Back to tests
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function isEmpty(value: AnswerValue | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const entries = Object.values(value as Record<string, string>);
    return entries.length === 0 || entries.every((v) => !v || v.trim() === "");
  }
  return false;
}
