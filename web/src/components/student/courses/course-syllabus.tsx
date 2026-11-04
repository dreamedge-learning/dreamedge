"use client";

import { useState } from "react";
import {
  ChevronDown,
  FileText,
  Lock,
  Play,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The syllabus on a course page, including the lessons a visitor has not paid
 * for.
 *
 * Every student-facing policy on `content_items` requires an active
 * enrolment, so this cannot read the table: it comes from
 * `get_course_syllabus`, which returns titles, types, durations and posters
 * and nothing that could be turned into playback.
 *
 * A locked lesson shows its poster behind a buy overlay rather than being
 * hidden. A syllabus a buyer cannot read is a course page that does not sell,
 * and the poster is the one piece of the lesson it costs nothing to show.
 */

export interface SyllabusLesson {
  id: string;
  title: string;
  type: string;
  isPaid: boolean;
  durationSeconds: number | null;
  posterUrl: string | null;
}

export interface SyllabusTopic {
  id: string;
  name: string;
  lessons: SyllabusLesson[];
}

export interface SyllabusSubject {
  id: string;
  name: string;
  topics: SyllabusTopic[];
}

function duration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function LessonIcon({ type }: { type: string }) {
  if (type === "video") return <Play className="size-3.5" />;
  if (type === "quiz") return <ScrollText className="size-3.5" />;
  return <FileText className="size-3.5" />;
}

export function CourseSyllabus({
  subjects,
  isEnrolled,
  onEnrol,
}: {
  subjects: SyllabusSubject[];
  isEnrolled: boolean;
  /** Opens the same purchase path the page's main button uses. */
  onEnrol: () => void;
}) {
  // The first subject starts open: a closed accordion reads as an empty page.
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(
    () => new Set(subjects.length > 0 ? [subjects[0].id] : [])
  );

  if (subjects.length === 0) return null;

  const lessonCount = subjects.reduce(
    (total, subject) =>
      total +
      subject.topics.reduce((sum, topic) => sum + topic.lessons.length, 0),
    0
  );

  function toggle(id: string) {
    setOpenSubjects((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          What you&apos;ll learn
        </h2>
        <p className="text-sm text-muted-foreground">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"} ·{" "}
          {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {subjects.map((subject) => {
          const open = openSubjects.has(subject.id);
          const subjectLessons = subject.topics.reduce(
            (sum, topic) => sum + topic.lessons.length,
            0
          );

          return (
            <div key={subject.id}>
              <button
                type="button"
                onClick={() => toggle(subject.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                    open ? "rotate-0" : "-rotate-90"
                  }`}
                />
                <span className="min-w-0 flex-1 font-medium text-foreground">
                  {subject.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {subjectLessons} lesson{subjectLessons === 1 ? "" : "s"}
                </span>
              </button>

              {open && (
                <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
                  {subject.topics.map((topic) => (
                    <div key={topic.id} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {topic.name}
                      </p>

                      {topic.lessons.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Lessons coming soon.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {topic.lessons.map((lesson) => {
                            const locked = lesson.isPaid && !isEnrolled;
                            const length = duration(lesson.durationSeconds);

                            return (
                              <li
                                key={lesson.id}
                                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                              >
                                {/* The poster, or a typed placeholder. Only a
                                    poster is ever shown here: Bunny's own
                                    frame sits behind token auth and would
                                    come back 403 unsigned. */}
                                <div className="relative h-11 w-20 shrink-0 overflow-hidden rounded bg-muted">
                                  {lesson.posterUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={lesson.posterUrl}
                                      alt=""
                                      className={`h-full w-full object-cover ${
                                        locked ? "opacity-50" : ""
                                      }`}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                      <LessonIcon type={lesson.type} />
                                    </div>
                                  )}

                                  {locked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                                      <Lock className="size-3.5 text-white" />
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-foreground">
                                    {lesson.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {lesson.type === "video" ? "Video" : "Notes"}
                                    {length ? ` · ${length}` : ""}
                                    {!lesson.isPaid ? " · Free preview" : ""}
                                  </p>
                                </div>

                                {locked ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="shrink-0 text-xs text-brand-orange hover:text-brand-orange-dark"
                                    onClick={onEnrol}
                                  >
                                    Buy to unlock
                                  </Button>
                                ) : (
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {isEnrolled ? "Included" : "Free"}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
