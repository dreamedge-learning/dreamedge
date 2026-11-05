"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CircleAlert,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Smartphone,
  TriangleAlert,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/admin/dashboard/empty-state";
import { ExportButton } from "@/components/admin/export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchFeedback,
  markFeedbackRead,
  resolveFeedback,
  saveFeedbackNote,
  type FeedbackRow,
} from "@/app/admin/(panel)/engage/feedback/actions";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/validations/feedback";

type StatusFilter = FeedbackStatus | "all";
type CategoryFilter = FeedbackCategory | "all";

interface Props {
  initialData: FeedbackRow[];
  loadError?: string;
}

function statusBadge(status: FeedbackStatus) {
  if (status === "resolved") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
        {FEEDBACK_STATUS_LABELS.resolved}
      </Badge>
    );
  }
  if (status === "read") {
    return <Badge variant="secondary">{FEEDBACK_STATUS_LABELS.read}</Badge>;
  }
  return (
    <Badge className="bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/20">
      {FEEDBACK_STATUS_LABELS.new}
    </Badge>
  );
}

function sourceLabel(source: "web" | "app", appVersion: string | null): string {
  if (source === "app") return appVersion ? `App v${appVersion}` : "App";
  return "Website";
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FeedbackClient({ initialData, loadError }: Props) {
  const [rows, setRows] = useState<FeedbackRow[]>(initialData);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(loadError);
  }, [loadError]);

  async function reload(next: {
    status?: StatusFilter;
    category?: CategoryFilter;
  }) {
    setLoading(true);
    const effective = {
      status: next.status ?? status,
      category: next.category ?? category,
    };
    const result = await fetchFeedback(effective);
    if (result.error) toast.error(result.error);
    setRows(result.data ?? []);
    setLoading(false);
  }

  function changeStatus(value: StatusFilter) {
    setStatus(value);
    void reload({ status: value });
  }

  function changeCategory(value: CategoryFilter) {
    setCategory(value);
    void reload({ category: value });
  }

  const selected = rows.find((row) => row.id === openId) ?? null;
  const counts = useMemo(() => countByStatus(rows), [rows]);

  const exportFilters = {
    status: status === "all" ? undefined : status,
    category: category === "all" ? undefined : category,
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Students write in from the website and the app. Mark a message read
            when you have seen it, resolved when it is done. Students see the
            status; notes stay internal.
          </p>
        </div>
        <ExportButton dataset="feedback" filters={exportFilters} />
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="New" value={counts.new} highlight="brand" />
        <StatTile label="Read" value={counts.read} highlight="muted" />
        <StatTile label="Resolved" value={counts.resolved} highlight="emerald" />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="feedback-filter-status">
              Status
            </Label>
            <Select
              value={status}
              onValueChange={(value) => changeStatus(value as StatusFilter)}
            >
              <SelectTrigger id="feedback-filter-status" className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {FEEDBACK_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {FEEDBACK_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs" htmlFor="feedback-filter-category">
              Category
            </Label>
            <Select
              value={category}
              onValueChange={(value) => changeCategory(value as CategoryFilter)}
            >
              <SelectTrigger id="feedback-filter-category" className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {FEEDBACK_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {FEEDBACK_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title="No feedback here"
              description={
                status === "all" && category === "all"
                  ? "No student has written in yet. Messages land here as soon as they arrive."
                  : "No messages match these filters. Try clearing one."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="hidden md:table-cell">Message</TableHead>
                  <TableHead className="hidden sm:table-cell">Source</TableHead>
                  <TableHead className="hidden lg:table-cell">Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <p className="font-medium">
                        {row.student?.full_name ?? "Unknown student"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.student?.student_code ?? "no code"}
                        {row.student?.class ? ` · Class ${row.student.class}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {FEEDBACK_CATEGORY_LABELS[row.category]}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">
                      {row.message}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      {sourceLabel(row.source, row.app_version)}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {formatTimestamp(row.created_at)}
                    </TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <FeedbackSheet
        row={selected}
        onClose={() => setOpenId(null)}
        onChanged={(updater) => {
          setRows((prev) => prev.map((row) => (row.id === updater.id ? updater : row)));
          setOpenId(null);
        }}
      />
    </div>
  );
}

function countByStatus(rows: FeedbackRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    { new: 0, read: 0, resolved: 0 } as Record<FeedbackStatus, number>,
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight: "brand" | "muted" | "emerald";
}) {
  const tone =
    highlight === "brand"
      ? "text-brand-orange"
      : highlight === "emerald"
        ? "text-emerald-500"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide-over
// ---------------------------------------------------------------------------

function FeedbackSheet({
  row,
  onClose,
  onChanged,
}: {
  row: FeedbackRow | null;
  onClose: () => void;
  onChanged: (next: FeedbackRow) => void;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {row && (
          <FeedbackDetail
            key={row.id}
            row={row}
            onChanged={onChanged}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function FeedbackDetail({
  row,
  onChanged,
}: {
  row: FeedbackRow;
  onChanged: (next: FeedbackRow) => void;
}) {
  const [note, setNote] = useState(row.admin_note ?? "");
  const [pending, startTransition] = useTransition();
  const noteChanged = note.trim() !== (row.admin_note ?? "");

  function noteForm() {
    const formData = new FormData();
    formData.set("admin_note", note.trim());
    return formData;
  }

  function apply(
    result: { error?: string; data?: FeedbackRow },
    success: string,
  ) {
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    // The action returns the row as the database now holds it, including the
    // handler and time the trigger stamped, so the table never shows a guess.
    if (result.data) onChanged({ ...result.data, student: result.data.student ?? row.student });
  }

  function handleRead() {
    startTransition(async () => {
      apply(await markFeedbackRead(row.id), "Marked as read.");
    });
  }

  function handleResolve() {
    startTransition(async () => {
      apply(await resolveFeedback(row.id, noteForm()), "Marked as resolved.");
    });
  }

  function handleSaveNote() {
    startTransition(async () => {
      apply(await saveFeedbackNote(row.id, noteForm()), "Note saved.");
    });
  }

  const student = row.student;
  const canMarkRead = row.status === "new";
  const canResolve = row.status !== "resolved";

  return (
    <div className="flex flex-col gap-5 p-6">
      <SheetHeader className="border-b border-border p-0 pb-4">
        <SheetTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-orange" />
          {FEEDBACK_CATEGORY_LABELS[row.category]}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          {statusBadge(row.status)}
          <span className="text-xs">
            {sourceLabel(row.source, row.app_version)} · {formatTimestamp(row.created_at)}
          </span>
        </SheetDescription>
      </SheetHeader>

      <section>
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>Student</span>
        </div>
        {student ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{student.full_name}</dd>

            {student.student_code && (
              <>
                <dt className="text-muted-foreground">Code</dt>
                <dd>{student.student_code}</dd>
              </>
            )}

            {(student.class || student.board) && (
              <>
                <dt className="text-muted-foreground">Class</dt>
                <dd>
                  {student.class ? `Class ${student.class}` : "—"}
                  {student.board ? ` · ${student.board}` : ""}
                </dd>
              </>
            )}

            {student.email && (
              <>
                <dt className="text-muted-foreground">
                  <Mail className="inline h-3.5 w-3.5" />
                </dt>
                <dd className="break-all">{student.email}</dd>
              </>
            )}

            {student.phone && (
              <>
                <dt className="text-muted-foreground">
                  <Phone className="inline h-3.5 w-3.5" />
                </dt>
                <dd>{student.phone}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <TriangleAlert className="h-4 w-4" />
            Student record has been removed.
          </p>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm text-muted-foreground">Message</p>
        <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
          {row.message}
        </p>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <div className="space-y-1.5">
          <Label htmlFor="admin-note" className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            Internal note
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="admin-note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What happened, what was done. For the team's record."
          />
          <p className="text-xs text-muted-foreground">
            Only the team sees this. The student sees the status of their
            message, never this note. To reply, contact them directly.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {canMarkRead && (
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={handleRead}
            >
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Mark read
            </Button>
          )}
          {canResolve ? (
            <Button
              className="flex-1"
              disabled={pending}
              onClick={handleResolve}
            >
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {noteChanged && note.trim() ? "Save note and resolve" : "Resolve"}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending || !noteChanged}
              onClick={handleSaveNote}
            >
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save note
            </Button>
          )}
        </div>
      </section>

      {row.status === "resolved" && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Resolved
            {row.handled_at ? ` on ${formatTimestamp(row.handled_at)}` : ""}.
            The student sees this message as resolved on their dashboard.
          </p>
        </div>
      )}

      {row.source === "app" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" />
          Sent from the mobile app.
        </p>
      )}
    </div>
  );
}
