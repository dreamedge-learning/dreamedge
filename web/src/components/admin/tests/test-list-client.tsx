"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExportButton } from "@/components/admin/export-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { deleteTest, duplicateTest } from "@/app/admin/(panel)/content/tests/actions";
import { formatRelativeTime } from "@/lib/format";

interface TestRow {
  id: string;
  name: string;
  course: { id: string; title: string } | null;
  question_count: number;
  duration_minutes: number;
  status: string;
  max_attempts: number;
  created_at: string;
}

interface CourseOption {
  id: string;
  title: string;
}

interface TestListClientProps {
  tests: TestRow[];
  courses: CourseOption[];
}

const statusColors: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  archived: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

export function TestListClient({ tests, courses }: TestListClientProps) {
  const router = useRouter();
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [_isPending, startTransition] = useTransition();

  const filtered = tests.filter((t) => {
    if (courseFilter !== "all" && t.course?.id !== courseFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteTest(id);
      if (result.error) toast.error(result.error);
      else toast.success("Test deleted");
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateTest(id);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Test duplicated");
        router.push(`/admin/content/tests/${result.data?.id}/edit`);
      }
    });
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Test Series</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create and manage tests for your courses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            dataset="tests"
            filters={{ courseId: courseFilter, status: statusFilter }}
            size="default"
          />
          <Button
            render={<Link href="/admin/content/tests/new" />}
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Test
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-sm font-medium">No tests found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tests.length === 0
              ? "Create your first test to get started"
              : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test Name</TableHead>
                <TableHead className="hidden sm:table-cell">Course</TableHead>
                <TableHead className="text-center">Questions</TableHead>
                <TableHead className="hidden md:table-cell text-center">
                  Duration
                </TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="hidden lg:table-cell text-center">
                  Attempts
                </TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((test) => (
                <TableRow key={test.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/content/tests/${test.id}/edit`}
                      className="hover:text-brand-orange transition-colors"
                    >
                      {test.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {test.course?.title || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {test.question_count}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center text-muted-foreground">
                    {test.duration_minutes} min
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="secondary"
                      className={`text-[11px] ${statusColors[test.status] || ""}`}
                    >
                      {test.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center text-muted-foreground">
                    {test.max_attempts}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {formatRelativeTime(test.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-xs" />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/admin/content/tests/${test.id}/edit`
                            )
                          }
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(test.id)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleDelete(test.id, test.name)
                          }
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
