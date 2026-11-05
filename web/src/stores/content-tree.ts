import { create } from "zustand";
import type { Subject, Topic, ContentItem, ContentType, ContentStatus } from "@/types/database";

export type NodeKind = "subject" | "topic" | "content";

export interface TreeNode {
  id: string;
  kind: NodeKind;
  name: string;
  weight: number;
  status?: string;
  contentType?: string;
  children: TreeNode[];
  data: Subject | Topic | ContentItem;
}

interface SelectedNode {
  id: string;
  kind: NodeKind;
  data: Subject | Topic | ContentItem;
}

interface ContentTreeState {
  courseId: string | null;
  tree: TreeNode[];
  expandedIds: Set<string>;
  selectedNode: SelectedNode | null;
  searchQuery: string;
  typeFilter: ContentType | "all";
  statusFilter: ContentStatus | "all";
  loading: boolean;

  setCourseId: (id: string | null) => void;
  setTree: (tree: TreeNode[]) => void;
  toggleExpand: (id: string) => void;
  expand: (ids: string[]) => void;
  expandAll: () => void;
  collapseAll: () => void;
  selectNode: (node: SelectedNode | null) => void;
  setSearchQuery: (q: string) => void;
  setTypeFilter: (t: ContentType | "all") => void;
  setStatusFilter: (s: ContentStatus | "all") => void;
  setLoading: (l: boolean) => void;

  addSubject: (subject: Subject) => void;
  /** A folder under a subject or inside another folder. */
  addFolder: (parentId: string, topic: Topic) => void;
  addContentItem: (topicId: string, item: ContentItem) => void;

  updateSubject: (subject: Subject) => void;
  updateTopic: (topic: Topic) => void;
  updateContentItem: (item: ContentItem) => void;

  /** Removes a node and everything beneath it, wherever it sits. */
  removeNode: (id: string) => void;

  reorderChildren: (parentId: string | null, orderedIds: string[]) => void;
}

// ─── Tree helpers ───
//
// The tree used to be exactly subject -> topic -> lesson, and every update
// below was written as two nested maps. Folders now nest to any depth, so
// each operation is a walk that stops where the id matches.

function collectAllIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children.length > 0) ids.push(...collectAllIds(node.children));
  }
  return ids;
}

/** The node itself and everything beneath it. */
export function collectSubtreeIds(node: TreeNode): string[] {
  return [node.id, ...collectAllIds(node.children)];
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Ancestors from the subject down to the node, inclusive. Empty if absent. */
export function findPath(nodes: TreeNode[], id: string): TreeNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const below = findPath(node.children, id);
    if (below.length > 0) return [node, ...below];
  }
  return [];
}

function mapTree(nodes: TreeNode[], fn: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((node) => {
    const next = fn(node);
    return next.children.length > 0
      ? { ...next, children: mapTree(next.children, fn) }
      : next;
  });
}

function removeFromTree(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.children.length > 0 ? { ...node, children: removeFromTree(node.children, id) } : node
    );
}

function lessonNode(item: ContentItem): TreeNode {
  return {
    id: item.id,
    kind: "content",
    name: item.title,
    weight: item.weight,
    status: item.status,
    contentType: item.type,
    children: [],
    data: item,
  };
}

function folderNode(topic: Topic): TreeNode {
  return {
    id: topic.id,
    kind: "topic",
    name: topic.name,
    weight: topic.weight,
    children: [],
    data: topic,
  };
}

/** Folders are listed before lessons, so a new folder goes after the last folder. */
function insertChild(children: TreeNode[], child: TreeNode): TreeNode[] {
  if (child.kind !== "topic") return [...children, child];
  const firstLesson = children.findIndex((c) => c.kind === "content");
  if (firstLesson === -1) return [...children, child];
  return [...children.slice(0, firstLesson), child, ...children.slice(firstLesson)];
}

function patchSelected(
  selected: SelectedNode | null,
  id: string,
  data: SelectedNode["data"]
): SelectedNode | null {
  return selected?.id === id ? { ...selected, data } : selected;
}

export const useContentTree = create<ContentTreeState>((set) => ({
  courseId: null,
  tree: [],
  expandedIds: new Set<string>(),
  selectedNode: null,
  searchQuery: "",
  typeFilter: "all",
  statusFilter: "all",
  loading: false,

  setCourseId: (id) => set({ courseId: id, tree: [], selectedNode: null }),
  setTree: (tree) =>
    set((state) => ({
      tree,
      // A selection that no longer exists (deleted elsewhere, or a course
      // switch) would leave the detail panel editing a ghost.
      selectedNode:
        state.selectedNode && findNode(tree, state.selectedNode.id) ? state.selectedNode : null,
    })),
  toggleExpand: (id) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    }),
  expand: (ids) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      for (const id of ids) next.add(id);
      return { expandedIds: next };
    }),
  expandAll: () => set((state) => ({ expandedIds: new Set(collectAllIds(state.tree)) })),
  collapseAll: () => set({ expandedIds: new Set() }),
  selectNode: (node) => set({ selectedNode: node }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setTypeFilter: (t) => set({ typeFilter: t }),
  setStatusFilter: (s) => set({ statusFilter: s }),
  setLoading: (l) => set({ loading: l }),

  addSubject: (subject) =>
    set((state) => ({
      tree: [
        ...state.tree,
        {
          id: subject.id,
          kind: "subject",
          name: subject.name,
          weight: subject.weight,
          children: [],
          data: subject,
        },
      ],
    })),

  addFolder: (parentId, topic) =>
    set((state) => ({
      tree: mapTree(state.tree, (node) =>
        node.id === parentId
          ? { ...node, children: insertChild(node.children, folderNode(topic)) }
          : node
      ),
    })),

  addContentItem: (topicId, item) =>
    set((state) => ({
      tree: mapTree(state.tree, (node) =>
        node.id === topicId
          ? { ...node, children: insertChild(node.children, lessonNode(item)) }
          : node
      ),
    })),

  updateSubject: (subject) =>
    set((state) => ({
      tree: state.tree.map((node) =>
        node.id === subject.id ? { ...node, name: subject.name, data: subject } : node
      ),
      selectedNode: patchSelected(state.selectedNode, subject.id, subject),
    })),

  updateTopic: (topic) =>
    set((state) => ({
      tree: mapTree(state.tree, (node) =>
        node.id === topic.id ? { ...node, name: topic.name, data: topic } : node
      ),
      selectedNode: patchSelected(state.selectedNode, topic.id, topic),
    })),

  updateContentItem: (item) =>
    set((state) => ({
      tree: mapTree(state.tree, (node) =>
        node.id === item.id
          ? { ...node, name: item.title, status: item.status, contentType: item.type, data: item }
          : node
      ),
      selectedNode: patchSelected(state.selectedNode, item.id, item),
    })),

  removeNode: (id) =>
    set((state) => {
      const removed = findNode(state.tree, id);
      const gone = new Set(removed ? collectSubtreeIds(removed) : [id]);
      return {
        tree: removeFromTree(state.tree, id),
        selectedNode:
          state.selectedNode && gone.has(state.selectedNode.id) ? null : state.selectedNode,
      };
    }),

  reorderChildren: (parentId, orderedIds) =>
    set((state) => {
      // A folder holds subfolders and lessons, and a drag reorders only one of
      // the two. The reordered group is laid back into the slots it already
      // occupied, so the other group does not move.
      function sortAndWeight(nodes: TreeNode[]): TreeNode[] {
        const order = new Map(orderedIds.map((id, index) => [id, index]));
        const moving = nodes
          .filter((node) => order.has(node.id))
          .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
          .map((node) => ({ ...node, weight: order.get(node.id)! + 1 }));
        let next = 0;
        return nodes.map((node) => (order.has(node.id) ? moving[next++] : node));
      }

      if (parentId === null) return { tree: sortAndWeight(state.tree) };

      return {
        tree: mapTree(state.tree, (node) =>
          node.id === parentId ? { ...node, children: sortAndWeight(node.children) } : node
        ),
      };
    }),
}));
