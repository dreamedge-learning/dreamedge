"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { ExportButton } from "@/components/admin/export-button";

interface CourseOption {
  id: string;
  title: string;
}

interface Props {
  courses: CourseOption[];
}

/**
 * Export filters for Progress & Analytics.
 *
 * The page's "Export progress" button used to pass no filters, so a click
 * walked the entire student_progress table -- fine with twenty students in
 * development, and the thing the panel refused to finish past 250,000 rows.
 * This bar gives the admin somewhere to narrow before the click; a bare
 * export is still allowed, but the Course and Status dropdowns are right
 * next to the button and the message under them says what a filtered
 * export is for.
 *
 * State lives in the URL so a shared link reproduces the same filters and
 * so the server renders the Suspense boundary consistently. The chart
 * aggregates on the page are intentionally not filtered yet -- adding
 * filtered charts is a separate feature, and the export is what the row
 * count was pressing against.
 */
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm " +
  "outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 " +
  "focus-visible:ring-ring/50";

export function ProgressExportControls({ courses }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  const courseId = search.get("courseId") ?? "all";
  const status = search.get("status") ?? "all";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(search.toString());
    if (value === "all" || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const query = next.toString();
    router.replace(query.length > 0 ? `?${query}` : "?", { scroll: false });
  }

  const filters = {
    courseId: courseId === "all" ? undefined : courseId,
    status: status === "all" ? undefined : status,
  };

  const narrowed = courseId !== "all" || status !== "all";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Course</span>
        <select
          value={courseId}
          onChange={(event) => setParam("courseId", event.target.value)}
          className={`${SELECT_CLASS} min-w-[200px]`}
        >
          <option value="all">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Status</span>
        <select
          value={status}
          onChange={(event) => setParam("status", event.target.value)}
          className={`${SELECT_CLASS} min-w-[160px]`}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-transparent">.</span>
        <ExportButton
          dataset="student-progress"
          filters={filters}
          label={narrowed ? "Export progress" : "Export all progress"}
        />
      </div>
      {!narrowed && (
        <p className="w-full text-xs text-muted-foreground">
          Narrow by course or status before exporting on busy accounts; an
          unfiltered export walks every progress row and can be slow enough
          to time out past a hundred thousand records.
        </p>
      )}
    </div>
  );
}
