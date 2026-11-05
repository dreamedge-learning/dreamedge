"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  MessageSquare,
  Search,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  fetchDoubtInbox,
  type DoubtInboxFilters,
  type DoubtInboxRow,
} from "@/app/admin/(panel)/doubts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOUBT_STATUS_STYLES, STAFF_STATUS_LABEL } from "@/lib/doubts";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: "open", label: "Unanswered" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

interface DoubtsInboxProps {
  initialRows: DoubtInboxRow[];
  initialCount: number;
  initialError: string | null;
  courses: { id: string; title: string }[];
}

/**
 * The staff queue. Cards rather than a table: a teacher answering on a phone
 * between classes needs the question text readable, and a table would hide
 * it behind a horizontal scroll at that width.
 */
export function DoubtsInbox({
  initialRows,
  initialCount,
  initialError,
  courses,
}: DoubtsInboxProps) {
  const [rows, setRows] = useState(initialRows);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState(initialError);
  const [status, setStatus] = useState<string>("open");
  const [courseId, setCourseId] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((filters: DoubtInboxFilters) => {
    // Only the newest request may write: a slow response for an old filter
    // must not overwrite the list the teacher is now looking at.
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      const result = await fetchDoubtInbox({ ...filters, pageSize: PAGE_SIZE });
      if (requestIdRef.current !== requestId) return;
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setError(null);
      setRows(result.data);
      setCount(result.count);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function applyFilters(next: { status?: string; courseId?: string; search?: string }) {
    const merged = {
      status: next.status ?? status,
      courseId: next.courseId ?? courseId,
      search: next.search ?? search,
    };
    setPage(1);
    load({ ...merged, page: 1 });
  }

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ search: value }), 350);
  }

  function goToPage(next: number) {
    setPage(next);
    load({ status, courseId, search, page: next });
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const courseItems: Record<string, string> = {
    all: "All courses",
    ...Object.fromEntries(courses.map((c) => [c.id, c.title])),
  };

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              applyFilters({ status: tab.value });
            }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              status === tab.value
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={status === tab.value}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Course and search */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          value={courseId}
          items={courseItems}
          onValueChange={(v) => {
            if (!v) return;
            setCourseId(v);
            applyFilters({ courseId: v });
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-[240px]">
            <SelectValue placeholder="Course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search question, student or lesson"
            className="h-9 pl-8"
            aria-label="Search doubts"
          />
        </div>
      </div>

      {/* List */}
      {error && rows.length === 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="font-medium text-destructive">Doubts could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      ) : isPending && rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">
            {status === "open" && !search && courseId === "all"
              ? "No unanswered doubts. Nice work."
              : "No doubts match these filters."}
          </p>
        </div>
      ) : (
        <ul className={cn("space-y-2 transition-opacity", isPending && "opacity-60")}>
          {rows.map((row) => (
            <li key={row.id}>
              <InboxCard row={row} />
            </li>
          ))}
        </ul>
      )}

      {/* Pager */}
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {count > 0 ? `${count} doubt${count === 1 ? "" : "s"}` : "No results"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => goToPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function InboxCard({ row }: { row: DoubtInboxRow }) {
  return (
    <Link
      href={`/admin/doubts/${row.id}`}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            DOUBT_STATUS_STYLES[row.status]
          )}
        >
          {STAFF_STATUS_LABEL[row.status]}
        </span>
        <span className="font-medium">{row.studentName}</span>
        {row.studentClass && (
          <span className="text-muted-foreground">Class {row.studentClass}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatRelativeTime(row.updatedAt)}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-foreground">{row.body}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {row.lessonTitle ?? "Lesson"}
          {row.courseTitle ? ` · ${row.courseTitle}` : ""}
        </span>
        {row.hasImage && (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5" />
            Photo
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" />
          {row.replyCount}
        </span>
        {row.assigneeName && (
          <span className="inline-flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5" />
            {row.assigneeName}
          </span>
        )}
      </div>
    </Link>
  );
}
