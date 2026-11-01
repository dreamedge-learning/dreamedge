"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  GripVertical,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { McqSingle } from "./question-types/mcq-single";
import { McqMultiple } from "./question-types/mcq-multiple";
import { TrueFalse } from "./question-types/true-false";
import { ShortAnswer } from "./question-types/short-answer";
import { MatchPair } from "./question-types/match-pair";
import { Subjective } from "./question-types/subjective";
import { ImageBased } from "./question-types/image-based";
import { QUESTION_TEMPLATES, type QuestionDraft } from "@/stores/test-builder";
import type { Difficulty } from "@/types/database";
import type { Json } from "@/types/supabase";

interface QuestionCardProps {
  question: QuestionDraft;
  index: number;
  isEditing: boolean;
  negativeMarkingEnabled: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<QuestionDraft>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const typeColors: Record<string, string> = {
  mcq_single: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  mcq_multiple: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  true_false: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  short_answer: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  match_pair: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  subjective: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  image_based: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

const typeLabels: Record<string, string> = {
  mcq_single: "MCQ (Single)",
  mcq_multiple: "MCQ (Multiple)",
  true_false: "True/False",
  short_answer: "Short Answer",
  match_pair: "Match the Pair",
  subjective: "Subjective",
  image_based: "Image Based",
};

export function QuestionCard({
  question,
  index,
  isEditing,
  negativeMarkingEnabled,
  onEdit,
  onUpdate,
  onDuplicate,
  onDelete,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: QuestionCardProps) {
  const [showHint, setShowHint] = useState(false);
  const template = QUESTION_TEMPLATES[question.type];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function renderAnswerArea() {
    const opts = (question.options || {}) as Record<string, unknown>;

    switch (question.type) {
      case "mcq_single":
        return (
          <McqSingle
            options={(opts.items as string[]) || ["", ""]}
            correctIndex={(opts.correctIndex as number) ?? 0}
            onChange={(items, ci) => {
              onUpdate({
                options: { items, correctIndex: ci },
                correct_answer: String(ci),
              });
            }}
            readOnly={!isEditing}
          />
        );
      case "mcq_multiple":
        return (
          <McqMultiple
            options={(opts.items as string[]) || ["", ""]}
            correctIndices={(opts.correctIndices as number[]) || []}
            onChange={(items, ci) => {
              onUpdate({
                options: { items, correctIndices: ci },
                correct_answer: ci.join(","),
              });
            }}
            readOnly={!isEditing}
          />
        );
      case "true_false":
        return (
          <TrueFalse
            correctAnswer={
              (String(question.correct_answer) as "true" | "false") ?? null
            }
            onChange={(a) => onUpdate({ correct_answer: a })}
            readOnly={!isEditing}
          />
        );
      case "short_answer":
        return (
          <ShortAnswer
            answers={
              question.correct_answer
                ? String(question.correct_answer).split(",").map((s: string) => s.trim())
                : [""]
            }
            onChange={(a) => onUpdate({ correct_answer: a.join(", ") })}
            readOnly={!isEditing}
          />
        );
      case "match_pair":
        return (
          <MatchPair
            pairs={
              (opts.pairs as { left: string; right: string }[]) || [
                { left: "", right: "" },
                { left: "", right: "" },
              ]
            }
            onChange={(pairs) =>
              onUpdate({ options: { pairs } as unknown as Json, correct_answer: "pairs" })
            }
            readOnly={!isEditing}
          />
        );
      case "subjective":
        return (
          <Subjective
            guidelines={(question.correct_answer as string) || ""}
            onChange={(g) => onUpdate({ correct_answer: g })}
            readOnly={!isEditing}
          />
        );
      case "image_based":
        return (
          <ImageBased
            imageUrl={question.image_url}
            subType={(opts.subType as "mcq_single") || "mcq_single"}
            answerData={(opts.answerData as Record<string, unknown>) || {}}
            onImageChange={(url) => onUpdate({ image_url: url })}
            onSubTypeChange={(st) =>
              onUpdate({ options: { ...opts, subType: st } as unknown as Json })
            }
            onAnswerChange={(data) =>
              onUpdate({ options: { ...opts, answerData: data } as unknown as Json })
            }
            readOnly={!isEditing}
          />
        );
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border bg-card transition-shadow ${
        isEditing
          ? "border-brand-orange/40 shadow-md ring-1 ring-brand-orange/20"
          : "border-border hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex flex-col items-center">
          <button
            type="button"
            aria-label="Drag to reorder"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          {/* Dragging is awkward on a long paper and impossible on a phone, so
              the same move is available one step at a time. */}
          <button
            type="button"
            aria-label="Move question up"
            disabled={isFirst}
            onClick={onMoveUp}
            className="text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Move question down"
            disabled={isLast}
            onClick={onMoveDown}
            className="text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              Q{index + 1}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeColors[question.type]}`}
            >
              {typeLabels[question.type]}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {!isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onEdit}
                  className="text-muted-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onDuplicate}
                className="text-muted-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-1.5">
              <Textarea
                value={question.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder={template?.prompt ?? "Enter your question..."}
                rows={2}
                className="resize-none"
              />
              {template && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {template.guidance}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed">
              {question.content || (
                <span className="italic text-muted-foreground">
                  No question text
                </span>
              )}
            </p>
          )}

          {renderAnswerArea()}

          {isEditing && (
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  +Marks
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={question.positive_marks}
                  onChange={(e) =>
                    onUpdate({ positive_marks: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8"
                />
              </div>
              {negativeMarkingEnabled && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    −Marks
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={question.negative_marks}
                    onChange={(e) =>
                      onUpdate({
                        negative_marks: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-8"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Difficulty
                </label>
                <select
                  value={question.difficulty}
                  onChange={(e) =>
                    onUpdate({ difficulty: e.target.value as Difficulty })
                  }
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Topic Tag
                </label>
                <Input
                  value={question.topic_tag || ""}
                  onChange={(e) =>
                    onUpdate({ topic_tag: e.target.value || null })
                  }
                  placeholder="e.g. Algebra"
                  className="h-8"
                />
              </div>
            </div>
          )}

          {isEditing && (
            <div>
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showHint ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Hint (optional)
              </button>
              {showHint && (
                <Input
                  value={question.hint || ""}
                  onChange={(e) =>
                    onUpdate({ hint: e.target.value || null })
                  }
                  placeholder="Hint for students"
                  className="mt-1.5 h-8"
                />
              )}
            </div>
          )}

          {!isEditing && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>+{question.positive_marks} marks</span>
              {question.negative_marks > 0 && (
                <span className="text-red-500">
                  −{question.negative_marks}
                </span>
              )}
              <span className="capitalize">{question.difficulty}</span>
              {question.topic_tag && (
                <span className="rounded bg-muted px-1.5 py-0.5">
                  {question.topic_tag}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
