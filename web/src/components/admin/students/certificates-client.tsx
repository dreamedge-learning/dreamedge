"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Award,
  Ban,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveCertificates,
  fetchCertificateCounts,
  fetchCertificates,
  rejectCertificate,
  revokeCertificate,
  type AdminCertificateRow,
  type CertificateCounts,
} from "@/app/admin/(panel)/students/certificates/actions";
import { ExportButton } from "@/components/admin/export-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  certificatePath,
  formatVerificationCode,
  type CertificateStatus,
} from "@/lib/certificates";

/**
 * The certificate queue and its records.
 *
 * One table whose columns change with the tab, rather than four tables: the
 * filters, the paging and the export are the same everywhere, and keeping them
 * in one place is what stops the four drifting apart.
 */

interface CertificatesClientProps {
  initialData: AdminCertificateRow[];
  initialCount: number;
  initialError: string | null;
  initialCounts: CertificateCounts;
  courses: { id: string; name: string }[];
  canDecide: boolean;
  canRevoke: boolean;
}

const PAGE_SIZE = 20;

const TABS: { value: CertificateStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "issued", label: "Issued" },
  { value: "rejected", label: "Rejected" },
  { value: "revoked", label: "Revoked" },
];

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function formatDate(iso: string | null): string {
  return iso ? dateFormatter.format(new Date(iso)) : "—";
}

/** The name as printed once issued; the live record before that. */
function studentLabel(row: AdminCertificateRow): string {
  return row.student_name ?? row.student?.full_name ?? "Unknown student";
}

function courseLabel(row: AdminCertificateRow): string {
  return row.course_title ?? row.course?.title ?? "Unknown course";
}

type ReasonTarget = { kind: "reject" | "revoke"; row: AdminCertificateRow };
type ApproveTarget = { ids: string[]; label: string };

export function CertificatesClient({
  initialData,
  initialCount,
  initialError,
  initialCounts,
  courses,
  canDecide,
  canRevoke,
}: CertificatesClientProps) {
  const [tab, setTab] = useState<CertificateStatus>("pending");
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [counts, setCounts] = useState(initialCounts);
  const [loadError, setLoadError] = useState(initialError);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [courseId, setCourseId] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, startLoading] = useTransition();
  const [isActing, startActing] = useTransition();
  const [approveTarget, setApproveTarget] = useState<ApproveTarget | null>(null);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [reason, setReason] = useState("");
  const requestIdRef = useRef(0);
  const isFirstLoad = useRef(true);

  const load = useCallback(
    (next: { tab: CertificateStatus; page: number; search: string; courseId: string }) => {
      const requestId = ++requestIdRef.current;
      startLoading(async () => {
        const [result, freshCounts] = await Promise.all([
          fetchCertificates({
            status: next.tab,
            page: next.page,
            pageSize: PAGE_SIZE,
            search: next.search || undefined,
            courseId: next.courseId === "all" ? undefined : next.courseId,
          }),
          fetchCertificateCounts(),
        ]);
        // A slower earlier request must not overwrite a newer tab's rows.
        if (requestIdRef.current !== requestId) return;
        setData(result.data);
        setCount(result.count);
        setLoadError(result.error);
        setCounts(freshCounts);
        setSelected(new Set());
      });
    },
    []
  );

  // The first render already has the pending tab from the server.
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    load({ tab, page: 1, search: appliedSearch, courseId });
    startLoading(() => setPage(1));
  }, [tab, appliedSearch, courseId, load]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  function reload(nextPage = page) {
    load({ tab, page: nextPage, search: appliedSearch, courseId });
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    reload(nextPage);
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === data.length ? new Set() : new Set(data.map((row) => row.id))
    );
  }

  function confirmApprove() {
    if (!approveTarget) return;
    const { ids } = approveTarget;

    startActing(async () => {
      const result = await approveCertificates(ids);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const issued = result.issued ?? 0;
      const skipped = result.skipped ?? 0;
      toast.success(
        issued === 1
          ? "Certificate issued. The student has been notified."
          : `${issued} certificates issued. The students have been notified.`
      );
      if (skipped > 0) {
        toast.info(
          `${skipped} ${skipped === 1 ? "was" : "were"} already decided by someone else and left as they were.`
        );
      }
      setApproveTarget(null);
      reload();
    });
  }

  function confirmReason() {
    if (!reasonTarget) return;
    const text = reason.trim();
    if (text.length < 3) {
      toast.error("Give a reason of at least a few words.");
      return;
    }

    const { kind, row } = reasonTarget;
    startActing(async () => {
      const result =
        kind === "reject"
          ? await rejectCertificate(row.id, text)
          : await revokeCertificate(row.id, text);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(kind === "reject" ? "Request rejected." : "Certificate revoked.");
      setReasonTarget(null);
      setReason("");
      reload();
    });
  }

  async function copyLink(row: AdminCertificateRow) {
    const url = `${window.location.origin}${certificatePath(row.verification_code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Certificate link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const showFrom = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, count);
  const selectable = tab === "pending" && canDecide;
  const columnCount = (selectable ? 1 : 0) + 5;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as CertificateStatus)}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {counts[t.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name or ID"
            className="h-9 pl-8"
            aria-label="Search certificates"
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
                {course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          {selectable && selected.size > 0 && (
            <Button
              size="sm"
              className="h-9"
              disabled={isActing}
              onClick={() =>
                setApproveTarget({
                  ids: [...selected],
                  label: `${selected.size} selected request${selected.size === 1 ? "" : "s"}`,
                })
              }
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Approve selected ({selected.size})
            </Button>
          )}
          <ExportButton
            dataset="certificates"
            filters={{ status: tab, search: appliedSearch, courseId }}
            size="default"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={data.length > 0 && selected.size === data.length}
                    onChange={toggleAll}
                    className="rounded border-border"
                  />
                </TableHead>
              )}
              <TableHead>Student</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>{tab === "pending" ? "Completed" : "Certificate"}</TableHead>
              <TableHead>
                {tab === "pending"
                  ? "Waiting"
                  : tab === "issued"
                    ? "Issued"
                    : tab === "rejected"
                      ? "Reason"
                      : "Revoked"}
              </TableHead>
              <TableHead className="w-[1%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-40 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-40 text-center text-sm text-destructive">
                  {loadError}
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-40 text-center text-muted-foreground">
                  <EmptyMessage tab={tab} filtered={!!appliedSearch || courseId !== "all"} />
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} className={isLoading ? "opacity-60" : undefined}>
                  {selectable && (
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${studentLabel(row)}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className="rounded border-border"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <p className="font-medium">{studentLabel(row)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        row.student?.student_code,
                        row.student?.class ? `Class ${row.student.class}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <p className="truncate">{courseLabel(row)}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {tab === "pending" ? (
                      <span className="text-muted-foreground">{formatDate(row.requested_at)}</span>
                    ) : row.certificate_number ? (
                      <span className="font-mono text-xs">{row.certificate_number}</span>
                    ) : (
                      <span className="text-muted-foreground">Not issued</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                    <SecondaryCell row={row} tab={tab} />
                  </TableCell>
                  <TableCell>
                    <RowActions
                      row={row}
                      tab={tab}
                      canDecide={canDecide}
                      canRevoke={canRevoke}
                      disabled={isActing}
                      onApprove={() =>
                        setApproveTarget({ ids: [row.id], label: studentLabel(row) })
                      }
                      onReject={() => {
                        setReason("");
                        setReasonTarget({ kind: "reject", row });
                      }}
                      onRevoke={() => {
                        setReason("");
                        setReasonTarget({ kind: "revoke", row });
                      }}
                      onCopy={() => void copyLink(row)}
                    />
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

      <AlertDialog
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open && !isActing) setApproveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue certificate?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget?.ids.length === 1
                ? `This issues a numbered certificate to ${approveTarget.label} and notifies them.`
                : `This issues certificates for ${approveTarget?.label} and notifies each student.`}{" "}
              The name, course and signatory are fixed at this moment and will
              not change later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApprove} disabled={isActing}>
              {isActing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!reasonTarget}
        onOpenChange={(open) => {
          if (!open && !isActing) setReasonTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonTarget?.kind === "reject" ? "Reject request" : "Revoke certificate"}
            </DialogTitle>
            <DialogDescription>
              {reasonTarget?.kind === "reject"
                ? `${reasonTarget ? studentLabel(reasonTarget.row) : ""} will see this reason on their certificates page. You can still approve the request later from the Rejected tab.`
                : `Certificate ${reasonTarget?.row.certificate_number ?? ""} will show as revoked to anyone who opens or verifies it. This cannot be undone. The reason is kept for the record and not shown publicly.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="certificate-reason">Reason</Label>
            <Textarea
              id="certificate-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                reasonTarget?.kind === "reject"
                  ? "For example: please finish the chapter tests first."
                  : "For example: issued to the wrong student."
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonTarget(null)} disabled={isActing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReason} disabled={isActing}>
              {isActing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {reasonTarget?.kind === "reject" ? "Reject" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecondaryCell({ row, tab }: { row: AdminCertificateRow; tab: CertificateStatus }) {
  if (tab === "pending") {
    const days = row.waiting_days;
    return (
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" />
        {days <= 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
      </span>
    );
  }

  if (tab === "issued") {
    return (
      <span>
        {formatDate(row.issued_at)}
        {row.issued_by_name && (
          <span className="block text-xs">by {row.issued_by_name}</span>
        )}
      </span>
    );
  }

  if (tab === "rejected") {
    return (
      <span className="line-clamp-2" title={row.rejected_reason ?? undefined}>
        {row.rejected_reason}
        <span className="block text-xs">{formatDate(row.rejected_at)}</span>
      </span>
    );
  }

  return (
    <span className="line-clamp-2" title={row.revoked_reason ?? undefined}>
      {formatDate(row.revoked_at)}
      {row.revoked_reason && <span className="block text-xs">{row.revoked_reason}</span>}
    </span>
  );
}

function RowActions({
  row,
  tab,
  canDecide,
  canRevoke,
  disabled,
  onApprove,
  onReject,
  onRevoke,
  onCopy,
}: {
  row: AdminCertificateRow;
  tab: CertificateStatus;
  canDecide: boolean;
  canRevoke: boolean;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRevoke: () => void;
  onCopy: () => void;
}) {
  const view = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2"
      title={`Open certificate ${formatVerificationCode(row.verification_code)}`}
      render={
        <a href={certificatePath(row.verification_code)} target="_blank" rel="noopener noreferrer" />
      }
    >
      <ExternalLink className="h-4 w-4" />
      <span className="sr-only">View</span>
    </Button>
  );

  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      {tab === "pending" && canDecide && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            disabled={disabled}
            onClick={onApprove}
          >
            <Award className="mr-1 h-4 w-4" />
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-red-600 hover:text-red-700 dark:text-red-400"
            disabled={disabled}
            onClick={onReject}
          >
            <XCircle className="mr-1 h-4 w-4" />
            Reject
          </Button>
        </>
      )}

      {tab === "rejected" && canDecide && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={disabled}
          onClick={onApprove}
        >
          <Award className="mr-1 h-4 w-4" />
          Approve anyway
        </Button>
      )}

      {(tab === "issued" || tab === "revoked") && (
        <>
          {view}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            title="Copy certificate link"
            onClick={onCopy}
          >
            <Link2 className="h-4 w-4" />
            <span className="sr-only">Copy link</span>
          </Button>
        </>
      )}

      {tab === "issued" && canRevoke && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-red-600 hover:text-red-700 dark:text-red-400"
          disabled={disabled}
          onClick={onRevoke}
        >
          <Ban className="mr-1 h-4 w-4" />
          Revoke
        </Button>
      )}
    </div>
  );
}

function EmptyMessage({ tab, filtered }: { tab: CertificateStatus; filtered: boolean }) {
  if (filtered) return <>No certificates match these filters.</>;

  switch (tab) {
    case "pending":
      return <>Nothing waiting. A request appears here when a student completes a course.</>;
    case "issued":
      return <>No certificates issued yet.</>;
    case "rejected":
      return <>No rejected requests.</>;
    default:
      return <>No revoked certificates.</>;
  }
}
