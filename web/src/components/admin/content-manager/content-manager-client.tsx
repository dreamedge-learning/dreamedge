"use client";

import { TreeView } from "./tree-view";
import { DetailPanel } from "./detail-panel";
import { SchedulerStrip } from "./scheduler-strip";
import type { Course } from "@/types/database";

interface Props {
  courses: Pick<Course, "id" | "title" | "is_published">[];
}

export function ContentManagerClient({ courses }: Props) {
  return (
    <div className="flex h-[calc(100vh-65px)] -m-4 flex-col lg:-m-6">
      {/* Says whether dated lessons are actually being published. Renders
          nothing until it knows, so it never reserves space for a state it
          cannot report yet. */}
      <SchedulerStrip />

      <div className="flex min-h-0 flex-1">
        {/* Tree panel */}
        <div className="w-72 shrink-0 lg:w-80">
          <TreeView courses={courses} />
        </div>

        {/* Detail panel */}
        <div className="flex-1 border-l border-border bg-background">
          <DetailPanel />
        </div>
      </div>
    </div>
  );
}
