"use client";

import { useEffect, useRef, useTransition } from "react";
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
import { Search, Plus, FolderOpen } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { ExportButton } from "@/components/admin/export-button";
import { TreeNodeRow } from "./tree-node";
import { findPath, useContentTree, type TreeNode } from "@/stores/content-tree";
import { useShallow } from "zustand/react/shallow";
import {
  fetchCourseTree,
  enableOfflineForSubtree,
  reorderItems,
} from "@/app/admin/(panel)/content/manager/actions";
import { useAdminRole } from "@/components/admin/admin-role-context";
import { useTreeActions } from "./tree-dialogs";
import type { Course, ContentType, ContentStatus } from "@/types/database";

interface TreeViewProps {
  courses: Pick<Course, "id" | "title" | "is_published">[];
  /** Opens straight onto this course, from a course's "Manage content" link. */
  initialCourseId?: string | null;
}

/** True when the node or anything beneath it matches the search text. */
function matchesSearch(node: TreeNode, q: string): boolean {
  if (node.name.toLowerCase().includes(q)) return true;
  return node.children.some((child) => matchesSearch(child, q));
}

export function TreeView({ courses, initialCourseId = null }: TreeViewProps) {
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
      reorderChildren: s.reorderChildren,
    }))
  );
  const [, startTransition] = useTransition();
  const actions = useTreeActions();
  const role = useAdminRole();
  // Deleting is super admin only, in the action as well as here. Offering the
  // item to anyone else would only produce a refusal after they confirmed.
  const canDelete = role === "super_admin";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // The effect reads these through their own selectors rather than through
  // `store`. The `useShallow` object above is a fresh identity whenever any
  // selected value changes -- `tree` included -- so depending on `store` here
  // would have `setTree` re-trigger the fetch that called it. The actions are
  // stable references on the Zustand store, so selecting them individually
  // gives the effect an honest dependency list instead of a suppressed one.
  const courseId = useContentTree((s) => s.courseId);
  const setLoading = useContentTree((s) => s.setLoading);
  const setTree = useContentTree((s) => s.setTree);
  const expandAll = useContentTree((s) => s.expandAll);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;

    setLoading(true);
    fetchCourseTree(courseId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTree((result.data as unknown as TreeNode[]) || []);
      expandAll();
    });

    return () => { cancelled = true; };
  }, [courseId, setLoading, setTree, expandAll]);

  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current) return;
    appliedInitial.current = true;
    if (initialCourseId && courses.some((c) => c.id === initialCourseId)) {
      useContentTree.getState().setCourseId(initialCourseId);
    }
  }, [initialCourseId, courses]);

  function handleCourseChange(id: string | null) {
    store.setCourseId(id === "none" ? null : id);
  }

  /**
   * Reorders within one parent. A drag only ever swaps siblings of the same
   * kind -- subjects among subjects, folders among folders, lessons among
   * lessons -- because a folder lists its subfolders before its lessons and
   * moving between parents is what Move to... is for.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activePath = findPath(store.tree, active.id as string);
    const overPath = findPath(store.tree, over.id as string);
    if (activePath.length === 0 || overPath.length === 0) return;

    const moved = activePath[activePath.length - 1];
    const target = overPath[overPath.length - 1];
    const parent = activePath.length > 1 ? activePath[activePath.length - 2] : null;
    const overParent = overPath.length > 1 ? overPath[overPath.length - 2] : null;

    if ((parent?.id ?? null) !== (overParent?.id ?? null) || moved.kind !== target.kind) {
      return;
    }

    const siblings = (parent ? parent.children : store.tree).filter((n) => n.kind === moved.kind);
    const oldIndex = siblings.findIndex((n) => n.id === moved.id);
    const newIndex = siblings.findIndex((n) => n.id === target.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...siblings];
    const [item] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, item);
    const orderedIds = reordered.map((n) => n.id);

    store.reorderChildren(parent?.id ?? null, orderedIds);

    const table =
      moved.kind === "subject" ? "subjects" : moved.kind === "topic" ? "topics" : "content_items";
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

    if (store.searchQuery && !matchesSearch(node, store.searchQuery.toLowerCase())) {
      return null;
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
          onAddFolder={node.kind !== "content" ? () => actions.openAdd("folder", node) : undefined}
          onAddLesson={node.kind === "topic" ? () => actions.openAdd("lesson", node) : undefined}
          onMove={node.kind !== "subject" ? () => actions.openMove(node) : undefined}
          onRename={() =>
            store.selectNode({
              id: node.id,
              kind: node.kind,
              data: node.data,
            })
          }
          onDelete={canDelete ? () => actions.openDelete(node) : undefined}
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
            <p className="text-xs font-medium">This course is empty</p>
            <p className="max-w-[14rem] text-xs text-muted-foreground">
              Start with a subject such as Mathematics, then add folders and lessons inside it.
            </p>
            <Button
              size="sm"
              className="mt-1 h-7 text-xs bg-brand-orange hover:bg-brand-orange-dark text-white"
              onClick={() => actions.openAdd("subject", null)}
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
            onClick={() => actions.openAdd("subject", null)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Subject
          </Button>
        </div>
      )}

    </div>
  );
}
