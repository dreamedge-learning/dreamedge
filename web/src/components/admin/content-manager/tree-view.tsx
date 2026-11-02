"use client";

import { useEffect, useState, useTransition } from "react";
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
import { toast } from "sonner";
import {
  Search,
  Plus,
  FolderOpen,
  Loader2,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { ExportButton } from "@/components/admin/export-button";
import { TreeNodeRow } from "./tree-node";
import { useContentTree, type NodeKind, type TreeNode } from "@/stores/content-tree";
import { useShallow } from "zustand/react/shallow";
import {
  fetchCourseTree,
  createSubject,
  createTopic,
  createContentItem,
  deleteSubject,
  deleteTopic,
  deleteContentItem,
  enableOfflineForSubtree,
  reorderItems,
} from "@/app/admin/(panel)/content/manager/actions";
import type { Course, ContentType, ContentStatus } from "@/types/database";

interface TreeViewProps {
  courses: Pick<Course, "id" | "title" | "is_published">[];
}

export function TreeView({ courses }: TreeViewProps) {
  const store = useContentTree(
    useShallow((s) => ({
      courseId: s.courseId,
      tree: s.tree,
      expandedIds: s.expandedIds,
      selectedNode: s.selectedNode,
      searchQuery: s.searchQuery,
      typeFilter: s.typeFilter,
      statusFilter: s.statusFilter,
      loading: s.loading,
      setCourseId: s.setCourseId,
      setTree: s.setTree,
      toggleExpand: s.toggleExpand,
      expandAll: s.expandAll,
      selectNode: s.selectNode,
      setSearchQuery: s.setSearchQuery,
      setTypeFilter: s.setTypeFilter,
      setStatusFilter: s.setStatusFilter,
      setLoading: s.setLoading,
      addSubject: s.addSubject,
      addTopic: s.addTopic,
      addContentItem: s.addContentItem,
      removeSubject: s.removeSubject,
      removeTopic: s.removeTopic,
      removeContentItem: s.removeContentItem,
      reorderChildren: s.reorderChildren,
    }))
  );
  const [isPending, startTransition] = useTransition();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<NodeKind>("subject");
  const [addName, setAddName] = useState("");
  const [addContentType, setAddContentType] = useState<ContentType>("video");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    kind: NodeKind;
    name: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!store.courseId) return;
    let cancelled = false;

    store.setLoading(true);
    fetchCourseTree(store.courseId).then((result) => {
      if (cancelled) return;
      store.setLoading(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      store.setTree((result.data as unknown as TreeNode[]) || []);
      store.expandAll();
    });

    return () => { cancelled = true; };
  }, [store.courseId]);

  function handleCourseChange(id: string | null) {
    store.setCourseId(id === "none" ? null : id);
  }

  function openAddDialog(parentId: string | null, kind: NodeKind) {
    setAddParentId(parentId);
    setAddKind(kind);
    setAddName("");
    setAddContentType("video");
    setAddDialogOpen(true);
  }

  function handleAdd() {
    if (!addName.trim()) return;

    startTransition(async () => {
      let result;

      if (addKind === "subject") {
        result = await createSubject(store.courseId!, addName.trim());
        if (result.data) store.addSubject(result.data);
      } else if (addKind === "topic") {
        result = await createTopic(addParentId!, addName.trim());
        if (result.data) store.addTopic(addParentId!, result.data);
      } else {
        result = await createContentItem(
          addParentId!,
          addName.trim(),
          addContentType
        );
        if (result.data) store.addContentItem(addParentId!, result.data);
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${addKind.charAt(0).toUpperCase() + addKind.slice(1)} created`
      );
      setAddDialogOpen(false);

      if (addParentId) {
        const expanded = new Set(store.expandedIds);
        expanded.add(addParentId);
        useContentTree.setState({ expandedIds: expanded });
      }
    });
  }

  function openDeleteDialog(id: string, kind: NodeKind, name: string) {
    setDeleteTarget({ id, kind, name });
    setDeleteDialogOpen(true);
  }

  function handleDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      let result;

      if (deleteTarget.kind === "subject") {
        result = await deleteSubject(deleteTarget.id);
        if (!result.error) store.removeSubject(deleteTarget.id);
      } else if (deleteTarget.kind === "topic") {
        result = await deleteTopic(deleteTarget.id);
        if (!result.error) store.removeTopic(deleteTarget.id);
      } else {
        result = await deleteContentItem(deleteTarget.id);
        if (!result.error) store.removeContentItem(deleteTarget.id);
      }

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Deleted");
      }
      setDeleteDialogOpen(false);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let parentId: string | null = null;
    let siblings: TreeNode[] = [];
    let table: "subjects" | "topics" | "content_items" = "subjects";

    const idx = store.tree.findIndex((n) => n.id === activeId);
    if (idx !== -1) {
      siblings = store.tree;
      parentId = null;
      table = "subjects";
    } else {
      for (const subj of store.tree) {
        const tIdx = subj.children.findIndex((n) => n.id === activeId);
        if (tIdx !== -1) {
          siblings = subj.children;
          parentId = subj.id;
          table = "topics";
          break;
        }
        for (const topic of subj.children) {
          const cIdx = topic.children.findIndex((n) => n.id === activeId);
          if (cIdx !== -1) {
            siblings = topic.children;
            parentId = topic.id;
            table = "content_items";
            break;
          }
        }
        if (siblings.length > 0 && table !== "subjects") break;
      }
    }

    const oldIndex = siblings.findIndex((n) => n.id === activeId);
    const newIndex = siblings.findIndex((n) => n.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const orderedIds = reordered.map((n) => n.id);
    store.reorderChildren(parentId, orderedIds);

    startTransition(async () => {
      const result = await reorderItems(table, orderedIds);
      if (result.error) toast.error(result.error);
    });
  }

  /**
   * Turns the offline switch on for everything under one node.
   *
   * The tree is reloaded afterwards rather than patched in place: the action
   * decides which items it skipped -- quizzes, and anything already on -- and
   * guessing that here would put the wrong badges on the wrong rows.
   */
  function handleEnableOffline(node: TreeNode) {
    if (node.kind === "content") return;
    const kind = node.kind;

    startTransition(async () => {
      const result = await enableOfflineForSubtree(kind, node.id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      const updated = result.data?.updated ?? 0;
      toast.success(
        updated === 0
          ? "Everything below this was already offline"
          : `${updated} item${updated === 1 ? "" : "s"} available offline`
      );

      if (updated > 0 && store.courseId) {
        const tree = await fetchCourseTree(store.courseId);
        if (tree.data) store.setTree(tree.data as unknown as TreeNode[]);
      }
    });
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const isExpanded = store.expandedIds.has(node.id);
    const isSelected = store.selectedNode?.id === node.id;

    if (store.searchQuery) {
      const q = store.searchQuery.toLowerCase();
      const matches =
        node.name.toLowerCase().includes(q) ||
        node.children.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.children.some((cc) => cc.name.toLowerCase().includes(q))
        );
      if (!matches) return null;
    }

    if (store.typeFilter !== "all" && node.kind === "content") {
      if (node.contentType !== store.typeFilter) return null;
    }

    if (store.statusFilter !== "all" && node.kind === "content") {
      if (node.status !== store.statusFilter) return null;
    }

    return (
      <div key={node.id}>
        <TreeNodeRow
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
          onToggle={() => store.toggleExpand(node.id)}
          onSelect={() =>
            store.selectNode({
              id: node.id,
              kind: node.kind,
              data: node.data,
            })
          }
          onAdd={(kind) => openAddDialog(node.id, kind)}
          onRename={() =>
            store.selectNode({
              id: node.id,
              kind: node.kind,
              data: node.data,
            })
          }
          onDelete={() => openDeleteDialog(node.id, node.kind, node.name)}
          onEnableOffline={() => handleEnableOffline(node)}
        />
        {isExpanded && node.children.length > 0 && (
          <SortableContext
            items={node.children.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {node.children.map((child) => renderNode(child, depth + 1))}
          </SortableContext>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Course selector */}
      <div className="border-b border-border p-3 space-y-2">
        <Select
          value={store.courseId || "none"}
          onValueChange={handleCourseChange}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder="Select course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select a course...</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {store.courseId && (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search content..."
                value={store.searchQuery}
                onChange={(e) => store.setSearchQuery(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>

            <div className="flex gap-1.5">
              <Select
                value={store.typeFilter}
                onValueChange={(v) =>
                  store.setTypeFilter((v ?? "all") as ContentType | "all")
                }
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="note">Notes</SelectItem>
                  <SelectItem value="quiz">Test</SelectItem>
                  <SelectItem value="ebook">Ebook</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={store.statusFilter}
                onValueChange={(v) =>
                  store.setStatusFilter((v ?? "all") as ContentStatus | "all")
                }
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* The tree is a shape nobody can filter in a spreadsheet, so the
                export flattens it: one row per content item, carrying the
                course / subject / topic path it sits under. */}
            <ExportButton
              dataset="content-items"
              label="Export this course"
              filters={{
                courseId: store.courseId,
                type: store.typeFilter,
                status: store.statusFilter,
              }}
            />
          </>
        )}
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto p-2">
        {!store.courseId ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Select a course to manage its content
            </p>
          </div>
        ) : store.loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : store.tree.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-xs font-medium">No subjects yet</p>
            <p className="text-xs text-muted-foreground">
              Add a subject to start building content
            </p>
            <Button
              size="sm"
              className="mt-1 h-7 text-xs bg-brand-orange hover:bg-brand-orange-dark text-white"
              onClick={() => openAddDialog(null, "subject")}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Subject
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={store.tree.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              {store.tree.map((node) => renderNode(node, 0))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add subject button */}
      {store.courseId && store.tree.length > 0 && (
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-7 text-xs text-muted-foreground"
            onClick={() => openAddDialog(null, "subject")}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Subject
          </Button>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add{" "}
              {addKind === "subject"
                ? "Subject"
                : addKind === "topic"
                ? "Topic"
                : "Content Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">
                {addKind === "content" ? "Title" : "Name"}
              </Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={
                  addKind === "subject"
                    ? "e.g. Mathematics"
                    : addKind === "topic"
                    ? "e.g. Number Systems"
                    : "e.g. Introduction to Numbers"
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
            {addKind === "content" && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={addContentType}
                  onValueChange={(v) =>
                    setAddContentType((v ?? "video") as ContentType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="note">Notes</SelectItem>
                    <SelectItem value="quiz">Test / Quiz</SelectItem>
                    <SelectItem value="ebook">Ebook</SelectItem>
                    <SelectItem value="pyp">PYP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isPending || !addName.trim()}
              className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.kind}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete &ldquo;{deleteTarget?.name}&rdquo;.
            {deleteTarget?.kind !== "content" &&
              " Items with children cannot be deleted."}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
