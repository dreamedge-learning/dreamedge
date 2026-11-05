"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, Folder, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  collectSubtreeIds,
  findPath,
  useContentTree,
  type TreeNode,
} from "@/stores/content-tree";
import {
  createContentItem,
  createSubject,
  createTopic,
  fetchCourseTree,
} from "@/app/admin/(panel)/content/manager/actions";
import {
  deleteTreeNode,
  getDeletionImpact,
  moveTreeNode,
  type DeletionImpact,
} from "@/app/admin/(panel)/content/manager/tree-actions";
import type { ContentType, Topic } from "@/types/database";

type AddKind = "subject" | "folder" | "lesson";

interface TreeActions {
  /** parent is null for a new subject; a subject or folder node otherwise. */
  openAdd: (kind: AddKind, parent: TreeNode | null) => void;
  openMove: (node: TreeNode) => void;
  openDelete: (node: TreeNode) => void;
}

const TreeActionsContext = createContext<TreeActions | null>(null);

export function useTreeActions(): TreeActions {
  const value = useContext(TreeActionsContext);
  if (!value) throw new Error("useTreeActions must be used inside TreeActionsProvider");
  return value;
}

const LESSON_TYPES: { value: ContentType; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "pdf", label: "PDF" },
  { value: "note", label: "Notes (PDF, PPT, Word)" },
  { value: "quiz", label: "Test / Quiz" },
  { value: "ebook", label: "Ebook" },
  { value: "pyp", label: "Previous year paper" },
];

/** Re-reads the course after a structural change the store cannot patch by hand. */
async function reloadTree(courseId: string) {
  const result = await fetchCourseTree(courseId);
  if (result.data) {
    useContentTree.getState().setTree(result.data as unknown as TreeNode[]);
  }
}

export function TreeActionsProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();

  // ─── Add ───
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>("folder");
  const [addParent, setAddParent] = useState<TreeNode | null>(null);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<ContentType>("video");

  // ─── Move ───
  const [moveNode, setMoveNode] = useState<TreeNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);

  // ─── Delete ───
  const [deleteNode, setDeleteNode] = useState<TreeNode | null>(null);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const actions: TreeActions = {
    openAdd(kind, parent) {
      setAddKind(kind);
      setAddParent(parent);
      setAddName("");
      setAddType("video");
      setAddOpen(true);
    },
    openMove(node) {
      setMoveNode(node);
      setMoveTarget(null);
    },
    openDelete(node) {
      setDeleteNode(node);
      setImpact(null);
      setImpactError(null);
      setConfirmText("");
      getDeletionImpact(node.kind, node.id).then((result) => {
        if (result.error) setImpactError(result.error);
        else if (result.data) setImpact(result.data);
      });
    },
  };

  function handleAdd() {
    const name = addName.trim();
    if (!name) return;
    const store = useContentTree.getState();
    const courseId = store.courseId;
    if (!courseId) return;

    startTransition(async () => {
      if (addKind === "subject") {
        const result = await createSubject(courseId, name);
        if (result.error || !result.data) {
          toast.error(result.error ?? "Could not create that subject.");
          return;
        }
        store.addSubject(result.data);
        toast.success("Subject created");
      } else if (addKind === "folder" && addParent) {
        // A folder under a subject has no parent folder; one inside a folder
        // names it. The subject is the parent's own when the parent is a folder.
        const subjectId =
          addParent.kind === "subject" ? addParent.id : (addParent.data as Topic).subject_id;
        const parentTopicId = addParent.kind === "topic" ? addParent.id : null;
        const result = await createTopic(subjectId, name, parentTopicId);
        if (result.error || !result.data) {
          toast.error(result.error ?? "Could not create that folder.");
          return;
        }
        store.addFolder(addParent.id, result.data as Topic);
        store.expand([addParent.id]);
        toast.success("Folder created");
      } else if (addKind === "lesson" && addParent) {
        const result = await createContentItem(addParent.id, name, addType);
        if (result.error || !result.data) {
          toast.error(result.error ?? "Could not create that lesson.");
          return;
        }
        store.addContentItem(addParent.id, result.data);
        store.expand([addParent.id]);
        store.selectNode({ id: result.data.id, kind: "content", data: result.data });
        toast.success("Lesson created — add its video or files on the right");
      }
      setAddOpen(false);
    });
  }

  function handleMove() {
    if (!moveNode || !moveTarget) return;
    const store = useContentTree.getState();
    const courseId = store.courseId;
    const target = findPath(store.tree, moveTarget).at(-1);
    if (!courseId || !target) return;

    startTransition(async () => {
      const result = await moveTreeNode(moveNode.kind, moveNode.id, {
        kind: target.kind,
        id: target.id,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      await reloadTree(courseId);
      const fresh = useContentTree.getState();
      fresh.expand(findPath(fresh.tree, moveNode.id).map((n) => n.id));
      toast.success(`Moved to ${target.name}`);
      setMoveNode(null);
    });
  }

  const needsTypedName =
    !!deleteNode &&
    deleteNode.kind !== "content" &&
    !!impact &&
    (impact.lessons > 0 || impact.folders > (deleteNode.kind === "topic" ? 1 : 0));

  const canDelete =
    !!impact && !isPending && (!needsTypedName || confirmText.trim() === impact.name.trim());

  function handleDelete() {
    if (!deleteNode || !canDelete) return;
    startTransition(async () => {
      const result = await deleteTreeNode(deleteNode.kind, deleteNode.id, confirmText);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      useContentTree.getState().removeNode(deleteNode.id);
      const failures = result.data?.cleanupFailures ?? 0;
      if (failures > 0) {
        toast.warning(
          "Deleted. Some stored files or videos could not be removed and have been logged."
        );
      } else {
        toast.success("Deleted");
      }
      setDeleteNode(null);
    });
  }

  const addTitle =
    addKind === "subject" ? "New subject" : addKind === "folder" ? "New folder" : "New lesson";

  return (
    <TreeActionsContext.Provider value={actions}>
      {children}

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{addTitle}</DialogTitle>
            {addParent && (
              <DialogDescription>
                Inside <span className="font-medium text-foreground">{addParent.name}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="tree-add-name">{addKind === "lesson" ? "Title" : "Name"}</Label>
              <Input
                id="tree-add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={
                  addKind === "subject"
                    ? "e.g. Mathematics"
                    : addKind === "folder"
                      ? "e.g. Chapter 3 — Fractions"
                      : "e.g. Adding unlike fractions"
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                autoFocus
              />
            </div>
            {addKind === "lesson" && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={addType}
                  onValueChange={(v) => setAddType((v ?? "video") as ContentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LESSON_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  To add many files at once, select the folder and use Upload files instead.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isPending || !addName.trim()}
              className="bg-brand-orange text-white hover:bg-brand-orange-dark"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={!!moveNode} onOpenChange={(open) => !open && setMoveNode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move &ldquo;{moveNode?.name}&rdquo;</DialogTitle>
            <DialogDescription>
              {moveNode?.kind === "content"
                ? "Choose the folder this lesson should go into."
                : "Choose a subject or folder. Everything inside moves with it."}
            </DialogDescription>
          </DialogHeader>
          {moveNode && (
            <MoveTargetList
              node={moveNode}
              selected={moveTarget}
              onSelect={setMoveTarget}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveNode(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={isPending || !moveTarget}
              className="bg-brand-orange text-white hover:bg-brand-orange-dark"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleteNode} onOpenChange={(open) => !open && setDeleteNode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteNode?.name}&rdquo;?</DialogTitle>
          </DialogHeader>

          {impactError ? (
            <p className="text-sm text-red-500">{impactError}</p>
          ) : !impact ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working out what this would remove…
            </div>
          ) : (
            <div className="space-y-4">
              <ImpactSummary impact={impact} kind={deleteNode?.kind ?? "content"} />

              {impact.studentsWithProgress > 0 && (
                <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {impact.studentsWithProgress} student
                    {impact.studentsWithProgress === 1 ? " has" : "s have"} progress on these
                    lessons. It is deleted too and cannot be recovered.
                  </span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Stored files and videos are removed as well. This cannot be undone.
              </p>

              {needsTypedName && (
                <div className="space-y-2">
                  <Label htmlFor="tree-delete-confirm" className="text-xs">
                    Type <span className="font-semibold text-foreground">{impact.name}</span> to
                    confirm
                  </Label>
                  <Input
                    id="tree-delete-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNode(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!canDelete}>
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TreeActionsContext.Provider>
  );
}

function ImpactSummary({ impact, kind }: { impact: DeletionImpact; kind: TreeNode["kind"] }) {
  const parts: string[] = [];
  // A folder counts itself; say how many sit inside it instead.
  const innerFolders = kind === "topic" ? impact.folders - 1 : impact.folders;
  if (innerFolders > 0) parts.push(`${innerFolders} folder${innerFolders === 1 ? "" : "s"}`);
  if (kind !== "content" || impact.lessons > 1) {
    parts.push(`${impact.lessons} lesson${impact.lessons === 1 ? "" : "s"}`);
  }
  if (impact.files > 0) parts.push(`${impact.files} file${impact.files === 1 ? "" : "s"}`);
  if (impact.videos > 0) parts.push(`${impact.videos} video${impact.videos === 1 ? "" : "s"}`);

  if (parts.length === 0) {
    return <p className="text-sm text-muted-foreground">It is empty.</p>;
  }
  return (
    <p className="text-sm">
      This removes <span className="font-medium">{parts.join(", ")}</span>.
    </p>
  );
}

/**
 * Every place the node could go: subjects and folders for a folder, folders
 * only for a lesson. A folder's own branch is left out, since the database
 * would refuse to put a folder inside itself, and the current parent is
 * shown but not selectable.
 */
function MoveTargetList({
  node,
  selected,
  onSelect,
}: {
  node: TreeNode;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const tree = useContentTree((s) => s.tree);
  const path = findPath(tree, node.id);
  const currentParent = path.length >= 2 ? path[path.length - 2].id : null;
  const excluded = new Set(node.kind === "topic" ? collectSubtreeIds(node) : []);

  const rows: { node: TreeNode; depth: number }[] = [];
  function walk(nodes: TreeNode[], depth: number) {
    for (const candidate of nodes) {
      if (candidate.kind === "content" || excluded.has(candidate.id)) continue;
      rows.push({ node: candidate, depth });
      walk(candidate.children, depth + 1);
    }
  }
  walk(tree, 0);

  return (
    <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
      {rows.map(({ node: candidate, depth }) => {
        const isSubject = candidate.kind === "subject";
        const disabled =
          candidate.id === currentParent || (node.kind === "content" && isSubject);
        const Icon = isSubject ? BookOpen : Folder;
        return (
          <button
            key={candidate.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(candidate.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
              selected === candidate.id
                ? "bg-brand-orange/15 text-brand-orange"
                : "hover:bg-muted",
              disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
            )}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", isSubject ? "text-indigo-400" : "text-amber-400")}
            />
            <span className="truncate">{candidate.name}</span>
            {candidate.id === currentParent && (
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">current</span>
            )}
          </button>
        );
      })}
      {rows.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
          There is nowhere else to move this.
        </p>
      )}
    </div>
  );
}
