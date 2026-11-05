"use client";

import {
  BookOpen,
  ChevronRight,
  FilePlus,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Trash2,
} from "lucide-react";
import { useContentTree, findPath, type TreeNode } from "@/stores/content-tree";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { useAdminRole } from "@/components/admin/admin-role-context";
import { useTreeActions } from "./tree-dialogs";
import { SubjectForm } from "./subject-form";
import { TopicForm } from "./topic-form";
import { ContentItemForm } from "./content-item-form";
import type { Subject, Topic, ContentItem } from "@/types/database";

export function DetailPanel() {
  const { selectedNode, courseId, tree } = useContentTree(
    useShallow((s) => ({ selectedNode: s.selectedNode, courseId: s.courseId, tree: s.tree }))
  );

  if (!courseId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Choose a course on the left</p>
        </div>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-xs space-y-2 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Select a subject, folder or lesson</p>
          <p className="text-xs text-muted-foreground">
            Its actions appear here: add folders and lessons, upload files, move or delete.
            The ⋯ on any row in the tree has the same options.
          </p>
        </div>
      </div>
    );
  }

  const path = findPath(tree, selectedNode.id);
  const node = path[path.length - 1];

  return (
    <div className="h-full overflow-y-auto">
      {node && <ActionBar node={node} path={path} />}
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          {selectedNode.kind === "subject" && (
            <SubjectForm key={selectedNode.id} subject={selectedNode.data as Subject} />
          )}
          {selectedNode.kind === "topic" && (
            <TopicForm key={selectedNode.id} topic={selectedNode.data as Topic} />
          )}
          {selectedNode.kind === "content" && (
            <ContentItemForm key={selectedNode.id} item={selectedNode.data as ContentItem} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Where the selection sits, and what can be done to it, as buttons rather
 * than a menu. The same actions are on each row's ⋯ menu; these are the ones
 * people actually find.
 */
function ActionBar({ node, path }: { node: TreeNode; path: TreeNode[] }) {
  const actions = useTreeActions();
  const role = useAdminRole();
  const selectNode = useContentTree((s) => s.selectNode);
  const canDelete = role === "super_admin";

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <nav aria-label="Location" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {path.map((step, index) => (
          <span key={step.id} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3" />}
            {index === path.length - 1 ? (
              <span className="font-medium text-foreground">{step.name}</span>
            ) : (
              <button
                type="button"
                className="hover:text-foreground hover:underline"
                onClick={() => selectNode({ id: step.id, kind: step.kind, data: step.data })}
              >
                {step.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        {node.kind !== "content" && (
          <Button size="sm" variant="outline" onClick={() => actions.openAdd("folder", node)}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            New folder
          </Button>
        )}
        {node.kind === "topic" && (
          <Button size="sm" variant="outline" onClick={() => actions.openAdd("lesson", node)}>
            <FilePlus className="mr-1.5 h-3.5 w-3.5" />
            New lesson
          </Button>
        )}
        {node.kind !== "subject" && (
          <Button size="sm" variant="outline" onClick={() => actions.openMove(node)}>
            <FolderInput className="mr-1.5 h-3.5 w-3.5" />
            Move to…
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="outline"
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => actions.openDelete(node)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>

      {node.kind === "subject" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Lessons live inside folders. Create a folder here first, then add lessons or upload
          files into it.
        </p>
      )}
    </div>
  );
}
