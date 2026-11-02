"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchRefunds, type RefundRow, type RefundFilters } from "@/app/admin/(panel)/revenue/actions";
import { formatINR } from "@/lib/format";
import { RefundProcessDialog } from "./refund-action-dialog";
import { DateRangeFilter } from "./date-range-filter";
import { ExportButton } from "@/components/admin/export-button";

interface RefundsTableProps {
  initialData: RefundRow[];
  initialCount: number;
}

const REFUND_STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  processed: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function RefundsTable({ initialData, initialCount }: RefundsTableProps) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isPending, startTransition] = useTransition();
  const [processDialog, setProcessDialog] = useState<{
    refundId: string;
    action: "approved" | "rejected";
  } | null>(null);
  const requestIdRef = useRef(0);

  const loadData = useCallback(
    (filters: RefundFilters) => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await fetchRefunds(filters);
        if (requestIdRef.current !== requestId) return;
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setData(result.data ?? []);
        setCount(result.count);
      });
    },
    []
  );

  useEffect(() => {
    loadData({ status, dateFrom, dateTo, page: 1, pageSize: PAGE_SIZE });
    startTransition(() => setPage(1));
  }, [status, dateFrom, dateTo, loadData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadData({ status, dateFrom, dateTo, page: newPage, pageSize: PAGE_SIZE });
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const showFrom = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          presets={false}
        />
        <div className="sm:ml-auto">
          <ExportButton dataset="refunds" filters={{ status, dateFrom, dateTo }} size="default" />
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Refund ID</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                  No refund requests found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell className="font-mono text-xs">
                    {refund.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="font-medium">
                    {refund.order?.student?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate">
                    {refund.order?.course?.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatINR(refund.amount)}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                    {refund.reason}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REFUND_STATUS_STYLES[refund.status] ?? ""}`}>
                      {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dateFormatter.format(new Date(refund.created_at))}
                  </TableCell>
                  <TableCell>
                    {refund.status === "requested" && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700"
                          title="Approve"
                          onClick={() => setProcessDialog({ refundId: refund.id, action: "approved" })}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          title="Reject"
                          onClick={() => setProcessDialog({ refundId: refund.id, action: "rejected" })}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">Page {page} of {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {processDialog && (
        <RefundProcessDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setProcessDialog(null);
              loadData({ status, dateFrom, dateTo, page, pageSize: PAGE_SIZE });
            }
          }}
          refundId={processDialog.refundId}
          action={processDialog.action}
        />
      )}
    </div>
  );
}
