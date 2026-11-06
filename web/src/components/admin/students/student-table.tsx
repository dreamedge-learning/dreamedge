"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ExportButton } from "@/components/admin/export-button";
import { registrationSourceLabel } from "@/lib/students/identity";
import { StudentDetail } from "./student-detail";
import { fetchStudents, bulkUpdateStudentStatus } from "@/app/admin/(panel)/students/actions";
import type { StudentWithEnrollments } from "@/types/database";

interface StudentTableProps {
  initialData: StudentWithEnrollments[];
  initialCount: number;
  courses: { id: string; name: string }[];
}

const sourceColors: Record<string, string> = {
  self_online: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  admin_offline: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  admin_import: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  inactive: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blocked: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function StudentTable({ initialData, initialCount, courses }: StudentTableProps) {
  const [data, setData] = useState(initialData);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The global search palette links here with ?student=<id> to open a single
  // profile straight away. The detail sheet fetches its own row by id, so it
  // does not matter whether that student is on the page currently loaded.
  const searchParams = useSearchParams();
  useEffect(() => {
    const focused = searchParams.get("student");
    if (focused) setSelectedStudent(focused);
  }, [searchParams]);

  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  const requestIdRef = useRef(0);

  const loadData = useCallback(
    (overrides: Record<string, unknown> = {}) => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await fetchStudents({
          search: (overrides.search as string) ?? search,
          status: (overrides.status as string) ?? statusFilter,
          source: (overrides.source as string) ?? sourceFilter,
          city: (overrides.city as string) ?? cityFilter,
          courseId: ((overrides.courseId as string) ?? courseFilter) === "all"
            ? undefined
            : ((overrides.courseId as string) ?? courseFilter),
          page: (overrides.page as number) ?? page,
          pageSize,
        });
        if (requestId !== requestIdRef.current) return;
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setData(result.data as unknown as StudentWithEnrollments[]);
        setTotalCount(result.count ?? 0);
      });
    },
    [search, statusFilter, sourceFilter, cityFilter, courseFilter, page]
  );

  const exportFilters = {
    search,
    status: statusFilter,
    source: sourceFilter,
    city: cityFilter,
    courseId: courseFilter,
  };

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setPage(1);
        loadData({ search: value, page: 1 });
      }, 350);
    },
    [loadData]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      if (key === "status") setStatusFilter(value);
      if (key === "source") setSourceFilter(value);
      if (key === "city") setCityFilter(value);
      if (key === "courseId") setCourseFilter(value);
      setPage(1);
      loadData({ [key]: value, page: 1 });
    },
    [loadData]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      loadData({ page: newPage });
    },
    [loadData]
  );

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map((s) => s.id)));
    }
  };

  const handleBulkStatus = (status: "active" | "inactive" | "blocked") => {
    const ids = Array.from(selectedRows);
    startTransition(async () => {
      const result = await bulkUpdateStudentStatus(ids, status);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Updated ${ids.length} students`);
        setSelectedRows(new Set());
        loadData();
      }
    });
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            aria-label="Search students"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
          </Button>
          <ExportButton dataset="students" filters={exportFilters} />
          <ExportButton
            dataset="students-full"
            filters={exportFilters}
            label="Full export"
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-brand-orange/5 border border-brand-orange/20 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedRows.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("active")}>
              Set Active
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("blocked")}>
              Block
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRows(new Set())}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border p-4">
          <Select value={statusFilter} onValueChange={(v) => v && handleFilterChange("status", v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={(v) => v && handleFilterChange("source", v)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Registered via" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="self_online">Online</SelectItem>
              <SelectItem value="admin_offline">Offline centre</SelectItem>
              <SelectItem value="admin_import">Imported</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Filter by city..."
            value={cityFilter}
            onChange={(e) => handleFilterChange("city", e.target.value)}
            className="w-[160px]"
          />

          <Select value={courseFilter} onValueChange={(v) => v && handleFilterChange("courseId", v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setSourceFilter("all");
              setCityFilter("");
              setCourseFilter("all");
              setPage(1);
              loadData({
                status: "all",
                source: "all",
                city: "",
                courseId: "all",
                page: 1,
              });
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
       <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  checked={data.length > 0 && selectedRows.size === data.length}
                  onChange={toggleAll}
                  className="rounded border-border"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">City</TableHead>
              <TableHead>Registered via</TableHead>
              <TableHead>Courses</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No students found
                </TableCell>
              </TableRow>
            ) : (
              data.map((student) => (
                <TableRow
                  key={student.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => setSelectedStudent(student.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedRows.has(student.id)}
                      onChange={() => toggleRow(student.id)}
                      className="rounded border-border"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-blue text-white text-xs font-medium shrink-0">
                        {student.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{student.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {student.student_code
                            ? `${student.student_code} · ${student.email || "No email"}`
                            : student.email || "No email"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {student.phone || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {student.city || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={sourceColors[student.registration_source] ?? ""}
                      >
                        {registrationSourceLabel(student.registration_source)}
                      </Badge>
                      {!student.profile_completed && (
                        <Badge
                          variant="secondary"
                          className="bg-red-500/10 text-red-600 dark:text-red-400"
                          title="This student has not finished the profile form yet"
                        >
                          Incomplete
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{student.enrollment_count}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={statusColors[student.status] ?? ""}
                      variant="secondary"
                    >
                      {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {formatDate(student.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
       </div>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of{" "}
            {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Student Detail Sheet */}
      <StudentDetail
        studentId={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onStatusChange={() => loadData()}
      />
    </div>
  );
}
