"use client";

import { useState, useTransition } from "react";
import { ExportButton } from "@/components/admin/export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  BookOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addToQuestionBank,
  updateQuestionBankItem,
  deleteQuestionBankItem,
} from "@/app/admin/(panel)/content/tests/actions";
import type { QuestionBankItem, QuestionType, Difficulty } from "@/types/database";

const typeLabels: Record<string, string> = {
  mcq_single: "MCQ (Single)",
  mcq_multiple: "MCQ (Multiple)",
  true_false: "True/False",
  short_answer: "Short Answer",
  match_pair: "Match Pair",
  subjective: "Subjective",
  image_based: "Image",
};

const typeColors: Record<string, string> = {
  mcq_single: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  mcq_multiple: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  true_false: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  short_answer: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  match_pair: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  subjective: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  image_based: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

interface QuestionBankClientProps {
  questions: QuestionBankItem[];
}

interface EditingQuestion {
  id?: string;
  type: string;
  content: string;
  positive_marks: number;
  negative_marks: number;
  difficulty: string;
  topic_tag: string;
}

export function QuestionBankClient({ questions }: QuestionBankClientProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [diffFilter, setDiffFilter] = useState<Difficulty | "all">("all");
  const [editModal, setEditModal] = useState<EditingQuestion | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = questions.filter((q) => {
    if (typeFilter !== "all" && q.type !== typeFilter) return false;
    if (diffFilter !== "all" && q.difficulty !== diffFilter) return false;
    if (search && !q.content.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  function openCreate() {
    setEditModal({
      type: "mcq_single",
      content: "",
      positive_marks: 1,
      negative_marks: 0,
      difficulty: "medium",
      topic_tag: "",
    });
  }

  function openEdit(q: QuestionBankItem) {
    setEditModal({
      id: q.id,
      type: q.type,
      content: q.content,
      positive_marks: q.positive_marks,
      negative_marks: q.negative_marks,
      difficulty: q.difficulty,
      topic_tag: q.topic_tag || "",
    });
  }

  function handleSave() {
    if (!editModal) return;
    startTransition(async () => {
      const payload = {
        type: editModal.type,
        content: editModal.content,
        options: null,
        correct_answer: null,
        positive_marks: editModal.positive_marks,
        negative_marks: editModal.negative_marks,
        difficulty: editModal.difficulty,
        topic_tag: editModal.topic_tag || null,
        image_url: null,
        hint: null,
      };

      if (editModal.id) {
        const result = await updateQuestionBankItem(editModal.id, payload);
        if (result.error) toast.error(result.error);
        else toast.success("Question updated");
      } else {
        const result = await addToQuestionBank(payload);
        if (result.error) toast.error(result.error);
        else toast.success("Question added");
      }
      setEditModal(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    startTransition(async () => {
      const result = await deleteQuestionBankItem(id);
      if (result.error) toast.error(result.error);
      else toast.success("Question deleted");
    });
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Question Bank
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Central repository of reusable questions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            dataset="question-bank"
            filters={{ search, type: typeFilter, difficulty: diffFilter }}
            size="default"
          />
          <Button
            onClick={openCreate}
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="h-9 pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as QuestionType | "all")
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Types</option>
          {(Object.keys(typeLabels) as QuestionType[]).map((t) => (
            <option key={t} value={t}>
              {typeLabels[t]}
            </option>
          ))}
        </select>
        <select
          value={diffFilter}
          onChange={(e) =>
            setDiffFilter(e.target.value as Difficulty | "all")
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-sm font-medium">No questions found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {questions.length === 0
              ? "Add your first question to the bank"
              : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Question</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead className="hidden sm:table-cell">Topic</TableHead>
                <TableHead className="text-center">Used</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <p className="max-w-xs truncate text-sm">
                      {q.content}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] ${typeColors[q.type]}`}
                    >
                      {typeLabels[q.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {q.difficulty}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {q.topic_tag || "—"}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {q.used_count}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEdit(q)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(q.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog
        open={editModal !== null}
        onOpenChange={(v) => !v && setEditModal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editModal?.id ? "Edit Question" : "Add Question"}
            </DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Type</label>
                <select
                  value={editModal.type}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      type: e.target.value as QuestionType,
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {(Object.keys(typeLabels) as QuestionType[]).map((t) => (
                    <option key={t} value={t}>
                      {typeLabels[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Question Text
                </label>
                <Textarea
                  value={editModal.content}
                  onChange={(e) =>
                    setEditModal({ ...editModal, content: e.target.value })
                  }
                  placeholder="Enter question text..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    +Marks
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={editModal.positive_marks}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        positive_marks: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    −Marks
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={editModal.negative_marks}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        negative_marks: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Difficulty
                  </label>
                  <select
                    value={editModal.difficulty}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        difficulty: e.target.value as Difficulty,
                      })
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Topic
                  </label>
                  <Input
                    value={editModal.topic_tag}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        topic_tag: e.target.value,
                      })
                    }
                    placeholder="e.g. Algebra"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending || !editModal?.content}
              className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editModal?.id ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
