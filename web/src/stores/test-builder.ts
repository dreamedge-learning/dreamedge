import { create } from "zustand";
import type { QuestionType, Difficulty } from "@/types/database";
import type { Json } from "@/types/supabase";

export interface QuestionDraft {
  id: string;
  type: QuestionType | string;
  content: string;
  options: Json | null;
  correct_answer: Json | null;
  positive_marks: number;
  negative_marks: number;
  difficulty: Difficulty | string;
  topic_tag: string | null;
  image_url: string | null;
  hint: string | null;
  weight: number;
}

/**
 * Starting points, one per question type. Choosing a type should leave a card
 * already shaped like the question the teacher is about to write -- the option
 * rows a CBSE paper normally carries, the marks it normally carries, and a
 * prompt that says what to type -- rather than two empty boxes.
 */
export interface QuestionTemplate {
  label: string;
  prompt: string;
  guidance: string;
  positive_marks: number;
  negative_marks: number;
  build: () => { options: Json | null; correct_answer: Json | null };
}

function blankOptions(n: number): string[] {
  return Array.from({ length: n }, () => "");
}

export const QUESTION_TEMPLATES: Record<string, QuestionTemplate> = {
  mcq_single: {
    label: "MCQ (Single)",
    prompt: "Type the question. Exactly one option will be correct.",
    guidance: "Mark the correct option with the radio button beside it.",
    positive_marks: 1,
    negative_marks: 0,
    build: () => ({ options: { items: blankOptions(4), correctIndex: 0 }, correct_answer: "0" }),
  },
  mcq_multiple: {
    label: "MCQ (Multiple)",
    prompt: "Type the question. Say in the wording that more than one option may be correct.",
    guidance: "Tick every correct option. A student scores only for an exact match.",
    positive_marks: 2,
    negative_marks: 0,
    build: () => ({ options: { items: blankOptions(4), correctIndices: [] }, correct_answer: "" }),
  },
  true_false: {
    label: "True/False",
    prompt: "Write a statement the student has to judge, not a question.",
    guidance: "Pick the side that is true.",
    positive_marks: 1,
    negative_marks: 0,
    build: () => ({ options: null, correct_answer: "true" }),
  },
  short_answer: {
    label: "Short Answer",
    prompt: "Ask for a single value, word or phrase.",
    guidance: "List every spelling you will accept, separated by commas. Matching ignores case.",
    positive_marks: 2,
    negative_marks: 0,
    build: () => ({ options: null, correct_answer: "" }),
  },
  match_pair: {
    label: "Match the Pair",
    prompt: "Write the instruction, for example: match each term in Column A with its value in Column B.",
    guidance: "Enter each pair on one row. Students see Column B shuffled.",
    positive_marks: 4,
    negative_marks: 0,
    build: () => ({
      options: {
        pairs: [
          { left: "", right: "" },
          { left: "", right: "" },
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      },
      correct_answer: "pairs",
    }),
  },
  subjective: {
    label: "Subjective",
    prompt: "Ask for working, a proof or an explanation.",
    guidance: "Write the marking scheme here. Only the mentor sees it.",
    positive_marks: 5,
    negative_marks: 0,
    build: () => ({ options: null, correct_answer: "" }),
  },
  image_based: {
    label: "Image Based",
    prompt: "Upload the figure, then ask the question about it.",
    guidance: "Mark the correct option. Keep the figure readable on a phone.",
    positive_marks: 2,
    negative_marks: 0,
    build: () => ({
      options: {
        subType: "mcq_single",
        answerData: { options: blankOptions(4), correctIndex: 0 },
      },
      correct_answer: "0",
    }),
  },
};

export function createQuestionFromTemplate(type: string): QuestionDraft {
  const t = QUESTION_TEMPLATES[type] ?? QUESTION_TEMPLATES.mcq_single;
  const shape = t.build();
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    content: "",
    options: shape.options,
    correct_answer: shape.correct_answer,
    positive_marks: t.positive_marks,
    negative_marks: t.negative_marks,
    difficulty: "medium",
    topic_tag: null,
    image_url: null,
    hint: null,
    weight: 0,
  };
}

interface TestSettings {
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
}

interface TestBuilderState {
  testId: string | null;
  settings: TestSettings;
  questions: QuestionDraft[];
  dirty: boolean;
  saving: boolean;
  lastSaved: Date | null;
  editingQuestionId: string | null;
  saveGeneration: number;
  lastSavedGeneration: number;

  setTestId: (id: string | null) => void;
  setSettings: (s: Partial<TestSettings>) => void;
  setQuestions: (q: QuestionDraft[]) => void;
  addQuestion: (q: QuestionDraft) => void;
  updateQuestion: (id: string, updates: Partial<QuestionDraft>) => void;
  removeQuestion: (id: string) => void;
  duplicateQuestion: (id: string) => void;
  moveQuestion: (fromIndex: number, toIndex: number) => void;
  setEditingQuestion: (id: string | null) => void;
  markDirty: () => void;
  markSaving: (saving: boolean) => void;
  markSaved: (generation: number) => void;
  reset: () => void;
}

const defaultSettings: TestSettings = {
  name: "Untitled Test",
  course_id: "",
  instructions: "",
  duration_minutes: 60,
  max_attempts: 1,
  pass_percentage: 40,
  shuffle_questions: false,
  show_results_immediately: true,
  certificate_enabled: false,
  negative_marking: false,
};

function generateId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useTestBuilder = create<TestBuilderState>((set, get) => ({
  testId: null,
  settings: { ...defaultSettings },
  questions: [],
  dirty: false,
  saving: false,
  lastSaved: null,
  editingQuestionId: null,
  saveGeneration: 0,
  lastSavedGeneration: 0,

  setTestId: (id) => set({ testId: id }),

  setSettings: (s) =>
    set((state) => ({
      settings: { ...state.settings, ...s },
      dirty: true,
      saveGeneration: state.saveGeneration + 1,
    })),

  setQuestions: (q) => set({ questions: q }),

  addQuestion: (q) =>
    set((state) => ({
      questions: [...state.questions, { ...q, weight: state.questions.length + 1 }],
      dirty: true,
      saveGeneration: state.saveGeneration + 1,
    })),

  updateQuestion: (id, updates) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === id ? { ...q, ...updates } : q
      ),
      dirty: true,
      saveGeneration: state.saveGeneration + 1,
    })),

  removeQuestion: (id) =>
    set((state) => ({
      questions: state.questions
        .filter((q) => q.id !== id)
        .map((q, i) => ({ ...q, weight: i + 1 })),
      dirty: true,
      saveGeneration: state.saveGeneration + 1,
      editingQuestionId:
        state.editingQuestionId === id ? null : state.editingQuestionId,
    })),

  duplicateQuestion: (id) => {
    const state = get();
    const source = state.questions.find((q) => q.id === id);
    if (!source) return;
    const idx = state.questions.indexOf(source);
    const clone: QuestionDraft = {
      ...source,
      id: generateId(),
      options: source.options
        ? JSON.parse(JSON.stringify(source.options))
        : null,
      weight: idx + 2,
    };
    const updated = [...state.questions];
    updated.splice(idx + 1, 0, clone);
    set({
      questions: updated.map((q, i) => ({ ...q, weight: i + 1 })),
      dirty: true,
      saveGeneration: state.saveGeneration + 1,
    });
  },

  moveQuestion: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex < 0 || fromIndex >= state.questions.length ||
        toIndex < 0 || toIndex >= state.questions.length
      ) {
        return state;
      }
      const updated = [...state.questions];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return {
        questions: updated.map((q, i) => ({ ...q, weight: i + 1 })),
        dirty: true,
        saveGeneration: state.saveGeneration + 1,
      };
    }),

  setEditingQuestion: (id) => set({ editingQuestionId: id }),

  markDirty: () =>
    set((state) => ({ dirty: true, saveGeneration: state.saveGeneration + 1 })),

  markSaving: (saving) => set({ saving }),

  markSaved: (generation: number) =>
    set((state) => ({
      dirty: state.saveGeneration !== generation,
      saving: false,
      lastSaved: new Date(),
      lastSavedGeneration: generation,
    })),

  reset: () =>
    set({
      testId: null,
      settings: { ...defaultSettings },
      questions: [],
      dirty: false,
      saving: false,
      lastSaved: null,
      editingQuestionId: null,
      saveGeneration: 0,
      lastSavedGeneration: 0,
    }),
}));
