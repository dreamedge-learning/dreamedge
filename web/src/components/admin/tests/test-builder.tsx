"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Save,
  Eye,
  Upload,
  Plus,
  Loader2,
  CheckCircle2,
  BookOpen,
  CircleDot,
  CheckSquare,
  ToggleLeft,
  Type,
  Link2,
  PenLine,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useTestBuilder,
  createQuestionFromTemplate,
  type QuestionDraft,
} from "@/stores/test-builder";
import { useShallow } from "zustand/react/shallow";
import { TestSettings } from "./test-settings";
import { QuestionCard } from "./question-card";
import { QuestionBankModal } from "./question-bank-modal";
import { TestPreview } from "./test-preview";
import { saveTest, publishTest } from "@/app/admin/(panel)/content/tests/actions";
import type { QuestionType, QuestionBankItem } from "@/types/database";
import type { Json } from "@/types/supabase";

interface CourseOption {
  id: string;
  title: string;
}

interface TestBuilderProps {
  courses: CourseOption[];
  initialTest?: {
    id: string;
    settings: {
      name: string;
      course_id: string;
      instructions: string;
      duration_minutes: number;
      max_attempts: number;
      pass_percentage: number;
      shuffle_questions: boolean;
      show_results_immediately: boolean;
      certificate_enabled: boolean;
      negative_marking: boolean;
    };
    questions: QuestionDraft[];
  };
}

const questionTypeCards: {
  type: QuestionType;
  label: string;
  desc: string;
  icon: React.ElementType;
}[] = [
  { type: "mcq_single", label: "MCQ (Single)", desc: "One correct answer", icon: CircleDot },
  { type: "mcq_multiple", label: "MCQ (Multiple)", desc: "Multiple correct", icon: CheckSquare },
  { type: "true_false", label: "True/False", desc: "Binary choice", icon: ToggleLeft },
  { type: "short_answer", label: "Short Answer", desc: "Text response", icon: Type },
  { type: "match_pair", label: "Match the Pair", desc: "Connect pairs", icon: Link2 },
  { type: "subjective", label: "Subjective", desc: "Manual grading", icon: PenLine },
  { type: "image_based", label: "Image Based", desc: "Image + answer", icon: ImageIcon },
];

function generateId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function TestBuilder({ courses, initialTest }: TestBuilderProps) {
  const {
    testId,
    settings,
    questions,
    dirty,
    saving,
    lastSaved,
    editingQuestionId,
  } = useTestBuilder(
    useShallow((s) => ({
      testId: s.testId,
      settings: s.settings,
      questions: s.questions,
      dirty: s.dirty,
      saving: s.saving,
      lastSaved: s.lastSaved,
      editingQuestionId: s.editingQuestionId,
    }))
  );

  const setTestId = useTestBuilder((s) => s.setTestId);
  const setSettings = useTestBuilder((s) => s.setSettings);
  const setQuestions = useTestBuilder((s) => s.setQuestions);
  const addQuestion = useTestBuilder((s) => s.addQuestion);
  const updateQuestion = useTestBuilder((s) => s.updateQuestion);
  const removeQuestion = useTestBuilder((s) => s.removeQuestion);
  const duplicateQuestion = useTestBuilder((s) => s.duplicateQuestion);
  const moveQuestion = useTestBuilder((s) => s.moveQuestion);
  const setEditingQuestion = useTestBuilder((s) => s.setEditingQuestion);
  const markSaving = useTestBuilder((s) => s.markSaving);
  const reset = useTestBuilder((s) => s.reset);

  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    reset();
    if (initialTest) {
      setTestId(initialTest.id);
      setSettings(initialTest.settings);
      setQuestions(initialTest.questions);
    }
    return () => reset();
  }, []);

  const currentStatusRef = useRef<"draft" | "published">("draft");

  const handleSave = useCallback(
    (preserveStatus = false) => {
      startTransition(async () => {
        markSaving(true);
        const gen = useTestBuilder.getState().saveGeneration;
        const status = preserveStatus ? currentStatusRef.current : ("draft" as const);
        const { negative_marking: _, ...dbSettings } = settings;
        const payload = {
          id: testId || undefined,
          ...dbSettings,
          status,
          questions: questions.map((q, i) => ({ ...q, weight: i + 1 })),
        };

        const action = status === "published" ? publishTest : saveTest;
        const result = await action(payload);

        if (result.error) {
          toast.error(result.error);
          markSaving(false);
          return;
        }

        if (result.data?.id && !testId) {
          setTestId(result.data.id);
          window.history.replaceState(
            null,
            "",
            `/admin/content/tests/${result.data.id}/edit`
          );
        }

        useTestBuilder.getState().markSaved(gen);
        toast.success(
          preserveStatus ? "Test saved" : "Test saved as draft"
        );
      });
    },
    [testId, settings, questions, markSaving, setTestId]
  );

  const handlePublish = useCallback(() => {
    currentStatusRef.current = "published";
    startTransition(async () => {
      markSaving(true);
      const gen = useTestBuilder.getState().saveGeneration;
      const { negative_marking: _, ...dbSettings } = settings;
      const payload = {
        id: testId || undefined,
        ...dbSettings,
        status: "published" as const,
        questions: questions.map((q, i) => ({ ...q, weight: i + 1 })),
      };

      const result = await publishTest(payload);

      if (result.error) {
        toast.error(result.error);
        markSaving(false);
        return;
      }

      if (result.data?.id && !testId) {
        setTestId(result.data.id);
        window.history.replaceState(
          null,
          "",
          `/admin/content/tests/${result.data.id}/edit`
        );
      }

      useTestBuilder.getState().markSaved(gen);
      toast.success("Test published");
    });
  }, [testId, settings, questions, markSaving, setTestId]);

  // auto-save every 30s — preserves current status
  const saveRef = useRef(handleSave);
  useEffect(() => { saveRef.current = handleSave; }, [handleSave]);

  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => saveRef.current(true), 30000);
    return () => clearTimeout(timer);
  }, [dirty, saving]);

  // warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      moveQuestion(oldIndex, newIndex);
    }
  }

  function handleAddQuestion(type: QuestionType) {
    const q = createQuestionFromTemplate(type);
    addQuestion(q);
    setEditingQuestion(q.id);
    setShowTypeSelector(false);
  }

  function handleImportFromBank(items: QuestionBankItem[]) {
    for (const item of items) {
      const q: QuestionDraft = {
        id: generateId(),
        type: item.type,
        content: item.content,
        options: item.options as Json | null,
        correct_answer: item.correct_answer as Json | null,
        positive_marks: item.positive_marks,
        negative_marks: item.negative_marks,
        difficulty: item.difficulty,
        topic_tag: item.topic_tag,
        image_url: item.image_url,
        hint: item.hint,
        weight: 0,
      };
      addQuestion(q);
    }
    toast.success(`Imported ${items.length} question${items.length > 1 ? "s" : ""}`);
  }

  const totalMarks = questions.reduce((sum, q) => sum + q.positive_marks, 0);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Input
          value={settings.name}
          onChange={(e) => setSettings({ name: e.target.value })}
          className="h-9 max-w-sm border-none bg-transparent text-lg font-semibold shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
          placeholder="Test Title"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Saved
              </span>
            ) : dirty ? (
              "Unsaved changes"
            ) : null}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            disabled={questions.length === 0}
          >
            <Eye className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={isPending}
          >
            <Save className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Save Draft</span>
          </Button>
          <Button
            size="sm"
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            onClick={handlePublish}
            disabled={isPending}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Publish
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex min-h-0 flex-1">
        {/* Settings sidebar */}
        <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-border p-4 lg:block xl:w-80">
          <TestSettings courses={courses} />
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              <p>{questions.length} questions</p>
              <p>Total marks: {totalMarks}</p>
            </div>
          </div>
        </div>

        {/* Questions area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {/* Mobile settings toggle */}
            <details className="rounded-xl border border-border bg-card lg:hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Test Settings
              </summary>
              <div className="border-t border-border px-4 py-4">
                <TestSettings courses={courses} />
              </div>
            </details>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                {questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    index={i}
                    isEditing={editingQuestionId === q.id}
                    negativeMarkingEnabled={settings.negative_marking}
                    onEdit={() =>
                      setEditingQuestion(
                        editingQuestionId === q.id ? null : q.id
                      )
                    }
                    onUpdate={(updates) => updateQuestion(q.id, updates)}
                    onDuplicate={() => duplicateQuestion(q.id)}
                    onDelete={() => removeQuestion(q.id)}
                    isFirst={i === 0}
                    isLast={i === questions.length - 1}
                    onMoveUp={() => moveQuestion(i, i - 1)}
                    onMoveDown={() => moveQuestion(i, i + 1)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {questions.length === 0 && !showTypeSelector && (
              <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
                <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <h3 className="text-sm font-medium">No questions yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add questions to build your test
                </p>
              </div>
            )}

            {/* Add Question */}
            {showTypeSelector ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="mb-3 text-sm font-medium">
                  Choose Question Type
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {questionTypeCards.map((qt) => {
                    const Icon = qt.icon;
                    return (
                      <button
                        key={qt.type}
                        type="button"
                        onClick={() => handleAddQuestion(qt.type)}
                        className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-colors hover:border-brand-orange/40 hover:bg-brand-orange/5"
                      >
                        <Icon className="h-5 w-5 text-brand-orange" />
                        <span className="text-xs font-medium">{qt.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {qt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTypeSelector(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowTypeSelector(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowBankModal(true)}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Import from Bank
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <QuestionBankModal
        open={showBankModal}
        onClose={() => setShowBankModal(false)}
        onImport={handleImportFromBank}
      />

      <TestPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        testName={settings.name}
        durationMin={settings.duration_minutes}
        questions={questions}
      />
    </div>
  );
}
