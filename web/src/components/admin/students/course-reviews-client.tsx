"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  fetchCourseRatings,
  setReviewHidden,
  type AdminRatingRow,
} from "@/app/admin/(panel)/students/reviews/actions";
import { ExportButton } from "@/components/admin/export-button";
import { StarDisplay } from "@/components/ratings/star-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { HIDE_REASON_MAX, HIDE_REASON_MIN } from "@/lib/ratings";

interface CourseReviewsClientProps {
  initialData: AdminRatingRow[];
  initialCount: number;
  initialError: string | null;
  courses: { id: string; title: string }[];
}

const PAGE_SIZE = 20;

type StatusFilter = "all" | "visible" | "hidden";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function formatDate(iso: string | null): string {
  return iso ? dateFormatter.format(new Date(iso)) : "—";
}

/**
 * Every student rating, with hide and restore.
 *
 * Hiding takes a reason because the student sees it next to their review;
 * restoring does not. Both go through one database function that records the
 * change in the audit log, so the history does not depend on this screen.
 */
export function CourseReviewsClient({
  initialData,
  initialCount,
  initialError,
  courses,
}: CourseReviewsClientProps) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [loadError, setLoadError] = useState(initialError);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [courseId, setCourseId] = useState("all");
  const [stars, setStars] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [isLoading, startLoading] = useTransition();
  const [isActing, startActing] = useTransition();
  const [hideTarget, setHideTarget] = useState<AdminRatingRow | null>(null);
  const [reason, setReason] = useState("");
  const requestIdRef = useRef(0);
  const isFirstLoad = useRef(true);

  const load = useCallback(
    (next: { page: number; status: StatusFilter; courseId: string; stars: string; search: string }) => {
      const requestId = ++requestIdRef.current;
      startLoading(async () => {
        const result = await fetchCourseRatings({
          status: next.status,
          courseId: next.courseId,
          stars: next.stars === "all" ? null : Number(next.stars),
          search: next.search,
          page: next.page,
          pageSize: PAGE_SIZE,
        });
        // A slower earlier request must not overwrite newer filters' rows.
        if (requestIdRef.current !== requestId) return;
        setData(result.data);
        setCount(result.count);
        setLoadError(result.error ?? null);
      });
    },
    []
  );

  // The first render already has the unfiltered first page from the server.
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    load({ page: 1, status, courseId, stars, search: appliedSearch });
    startLoading(() => setPage(1));
  }, [status, courseId, stars, appliedSearch, load]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  function reload(nextPage = page) {
    load({ page: nextPage, status, courseId, stars, search: appliedSearch });
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    reload(nextPage);
  }

  function confirmHide() {
    if (!hideTarget) return;
    const text = reason.trim();
    if (text.length < HIDE_REASON_MIN) {
      toast.error("Give a reason the student will understand.");
      return;
    }

    const target = hideTarget;
    startActing(async () => {
      const result = await setReviewHidden({ ratingId: target.id, hidden: true, reason: text });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Review hidden. It no longer counts towards the course rating.");
      setHideTarget(null);
      setReason("");
      reload();
    });
  }

  function restore(row: AdminRatingRow) {
    startActing(async () => {
      const result = await setReviewHidden({ ratingId: row.id, hidden: false });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Review restored.");
      reload();
    });
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const showFrom = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, count);
  const filtered = !!appliedSearch || status !== "all" || courseId !== "all" || stars !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search review, student or course"
            className="h-9 pl-8"
            aria-label="Search reviews"
          />
        </div>
        <Select value={courseId} onValueChange={(value) => value && setCourseId(value)}>
          <SelectTrigger className="h-9 w-full sm:w-[220px]">
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
        <Select value={stars} onValueChange={(value) => value && setStars(value)}>
          <SelectTrigger className="h-9 w-full sm:w-[140px]">
            <SelectValue placeholder="Stars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stars</SelectItem>
            {["5", "4", "3", "2", "1"].map((n) => (
              <SelectItem key={n} value={n}>
                {n === "1" ? "1 star" : `${n} stars`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => value && setStatus(value as StatusFilter)}>
          <SelectTrigger className="h-9 w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="visible">Visible</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
        <div className="sm:ml-auto">
          <ExportButton
            dataset="course-reviews"
            filters={{ status, courseId, stars, search: appliedSearch }}
            size="default"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Rating and review</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[1%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center text-sm text-destructive">
                  {loadError}
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                  {filtered ? "No ratings match these filters." : "No student has rated a course yet."}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} className={isLoading ? "opacity-60" : undefined}>
                  <TableCell className="align-top">
                    <p className="font-medium">{row.studentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[row.studentCode, row.studentClass ? `Class ${row.studentClass}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[200px] align-top">
                    <p className="truncate">{row.courseTitle ?? "Unknown course"}</p>
                  </TableCell>
                  <TableCell className="min-w-[260px] max-w-[420px] align-top">
                    <div className="flex items-center gap-2">
                      <StarDisplay value={row.stars} starClassName="h-3.5 w-3.5" />
                      {row.isHidden && (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                          Hidden
                        </Badge>
                      )}
                    </div>
                    {row.review ? (
                      <p className="mt-1 whitespace-pre-line break-words text-sm">{row.review}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Stars only</p>
                    )}
                    {row.isHidden && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hidden {formatDate(row.hiddenAt)}
                        {row.hiddenByName ? ` by ${row.hiddenByName}` : ""}
                        {row.hiddenReason ? `: ${row.hiddenReason}` : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">
                    {formatDate(row.updatedAt)}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {row.isHidden ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isActing}
                        onClick={() => restore(row)}
                      >
                        <Eye className="mr-1.5 h-4 w-4" />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isActing}
                        onClick={() => {
                          setReason("");
                          setHideTarget(row);
                        }}
                      >
                        <EyeOff className="mr-1.5 h-4 w-4" />
                        Hide
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {count > 0 ? `Showing ${showFrom}–${showTo} of ${count}` : "No results"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={page <= 1 || isLoading}
            onClick={() => changePage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={page >= totalPages || isLoading}
            onClick={() => changePage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={!!hideTarget}
        onOpenChange={(open) => {
          if (!open && !isActing) setHideTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hide this review</DialogTitle>
            <DialogDescription>
              It comes off the course page and stops counting towards the
              course&apos;s rating. {hideTarget?.studentName ?? "The student"} still
              sees it, marked as hidden, with the reason you give here. You can
              restore it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="hide-reason">Reason</Label>
            <Textarea
              id="hide-reason"
              rows={3}
              maxLength={HIDE_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: personal remarks about a teacher are not allowed in reviews."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHideTarget(null)} disabled={isActing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmHide} disabled={isActing}>
              {isActing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Hide review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
