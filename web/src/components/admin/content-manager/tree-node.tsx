"use client";

import { memo } from "react";
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  CloudDownload,
  FileText,
  Video,
  FileCheck,
  Notebook,
  BookMarked,
  MoreHorizontal,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  FolderInput,
  Pencil,
  Trash2,
  GripVertical,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { TreeNode as TreeNodeType, NodeKind } from "@/stores/content-tree";
import type { ContentItem } from "@/types/database";

const contentTypeIcons: Record<string, React.ElementType> = {
  video: Video,
  pdf: FileText,
  note: Notebook,
  ebook: BookMarked,
  pyp: FileCheck,
  quiz: FileCheck,
};

const kindIcons: Record<NodeKind, React.ElementType> = {
  subject: BookOpen,
  topic: Folder,
  content: Video,
};

function getIcon(node: TreeNodeType, isExpanded: boolean) {
  if (node.kind === "content" && node.contentType) {
    return contentTypeIcons[node.contentType] || FileText;
  }
  if (node.kind === "topic" && isExpanded) return FolderOpen;
  return kindIcons[node.kind];
}

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onAddFolder?: () => void;
  onAddLesson?: () => void;
  onMove?: () => void;
  onRename?: () => void;
  /** Absent for roles that may not delete; the item is then not offered. */
  onDelete?: () => void;
  onEnableOffline?: () => void;
}

/**
 * The two things about a content item worth seeing without selecting it:
 * whether students can keep a copy, and whether its video is in trouble.
 *
 * A tree of sixty lessons is where "which of these are offline" and "did that
 * upload ever finish" actually get asked, and both answers are already in the
 * row's data.
 */
function contentFlags(node: TreeNodeType) {
  if (node.kind !== "content") return null;

  const item = node.data as ContentItem;
  return {
    offline: item.is_downloadable === true,
    videoProcessing: item.video_status === "processing",
    videoFailed: item.video_status === "failed",
  };
}

export const TreeNodeRow = memo(function TreeNodeRow({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onAddFolder,
  onAddLesson,
  onMove,
  onRename,
  onDelete,
  onEnableOffline,
}: TreeNodeProps) {
  const hasChildren = node.kind !== "content";
  const Icon = getIcon(node, isExpanded);
  const isDraft = node.status === "draft";
  const flags = contentFlags(node);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors cursor-pointer select-none",
        isSelected
          ? "bg-brand-orange/10 text-brand-orange"
          : "text-foreground hover:bg-muted",
        isDragging && "opacity-50",
        isDraft && !isSelected && "text-muted-foreground"
      )}
      style={{ ...style, paddingLeft: `${depth * 16 + 4}px` }}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab opacity-0 group-hover:opacity-60 hover:opacity-100 active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Expand/collapse toggle */}
      {hasChildren ? (
        <button
          className="shrink-0 p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}

      {/* Icon */}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          node.kind === "subject" && "text-indigo-500",
          node.kind === "topic" && "text-amber-500",
          node.kind === "content" && "text-sky-500"
        )}
      />

      {/* Name */}
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {node.name}
      </span>

      {/* A video that is still transcoding, or that never made it */}
      {(flags?.videoProcessing || flags?.videoFailed) && (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            flags.videoFailed
              ? "bg-red-500"
              : "animate-pulse bg-amber-500"
          )}
          title={
            flags.videoFailed
              ? "Transcoding failed"
              : "Video is still processing"
          }
        />
      )}

      {/* Saved to the device when offline */}
      {flags?.offline && (
        <span className="shrink-0" title="Available offline in app">
          <CloudDownload className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}

      {/* Content count badge */}
      {hasChildren && node.children.length > 0 && (
        <Badge
          variant="secondary"
          className="h-4 px-1 text-[10px] font-normal shrink-0"
        >
          {node.children.length}
        </Badge>
      )}

      {/* Status indicator */}
      {isDraft && (
        <Badge
          variant="outline"
          className="h-4 px-1 text-[10px] border-zinc-400/30 text-zinc-500 shrink-0"
        >
          Draft
        </Badge>
      )}

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              // Visible at rest. This menu used to appear only on hover, which
              // on a touch screen means never, and on a laptop meant most
              // people never found out it existed.
              aria-label={`Actions for ${node.name}`}
              className="h-6 w-6 shrink-0 p-0 opacity-60 hover:opacity-100 group-hover:opacity-100"
            />
          }
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          {onAddFolder && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAddFolder();
              }}
            >
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              New folder
            </DropdownMenuItem>
          )}
          {onAddLesson && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAddLesson();
              }}
            >
              <FilePlus className="mr-2 h-3.5 w-3.5" />
              New lesson
            </DropdownMenuItem>
          )}
          {hasChildren && onEnableOffline && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEnableOffline();
              }}
            >
              <CloudDownload className="mr-2 h-3.5 w-3.5" />
              Enable offline for all items below
            </DropdownMenuItem>
          )}
          {(onAddFolder || onAddLesson || onEnableOffline) && <DropdownMenuSeparator />}
          {onRename && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
          )}
          {onMove && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onMove();
              }}
            >
              <FolderInput className="mr-2 h-3.5 w-3.5" />
              Move to…
            </DropdownMenuItem>
          )}
          {onDelete && <DropdownMenuSeparator />}
          {onDelete && (
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
