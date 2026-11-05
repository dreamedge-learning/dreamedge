"use client";

import { TreeView } from "./tree-view";
import { DetailPanel } from "./detail-panel";
import { SchedulerStrip } from "./scheduler-strip";
import { TreeActionsProvider } from "./tree-dialogs";
import type { Course } from "@/types/database";

interface Props {
  courses: Pick<Course, "id" | "title" | "is_published">[];
  initialCourseId?: string | null;
}

export function ContentManagerClient({ courses, initialCourseId = null }: Props) {
  return (
    <TreeActionsProvider>
      <div className="flex h-[calc(100vh-65px)] -m-4 flex-col lg:-m-6">
        {/* Says whether dated lessons are actually being published. Renders
            nothing until it knows, so it never reserves space for a state it
            cannot report yet. */}
        <SchedulerStrip />

        {/* Side by side from tablet width up. On a phone a fixed 288px tree
            left the editor a sliver, so they stack: tree on top, capped so
            the editor below is always reachable. */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="max-h-[45vh] shrink-0 md:max-h-none md:w-72 lg:w-80">
            <TreeView courses={courses} initialCourseId={initialCourseId} />
          </div>

          <div className="min-h-0 flex-1 border-t border-border bg-background md:border-l md:border-t-0">
            <DetailPanel />
          </div>
        </div>
      </div>
    </TreeActionsProvider>
  );
}
