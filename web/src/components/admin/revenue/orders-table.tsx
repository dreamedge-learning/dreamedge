"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { fetchOrders, type OrderRow, type OrderFilters } from "@/app/admin/(panel)/revenue/actions";
import { formatINR } from "@/lib/format";
import { ExportButton } from "@/components/admin/export-button";
import { OrderDetailDrawer } from "./order-detail-drawer";
import { DateRangeFilter } from "./date-range-filter";

interface OrdersTableProps {
  initialData: OrderRow[];
  initialCount: number;
  courses: { id: string; name: string }[];
}

const ORDER_STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  refunded: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  razorpay: "Online (Razorpay)",
  manual_cash: "Cash",
  manual_upi: "UPI",
  manual_bank: "Bank Transfer",
};

const PAGE_SIZE = 20;

export function OrdersTable({ initialData, initialCount, courses }: OrdersTableProps) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [courseId, setCourseId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(
    (filters: OrderFilters) => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await fetchOrders(filters);
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

  const buildFilters = useCallback(
    (overrides: Partial<OrderFilters> = {}): OrderFilters => ({
      search,
      status,
      paymentMethod,
      courseId,
      dateFrom,
      dateTo,
      page,
      pageSize: PAGE_SIZE,
      ...overrides,
    }),
    [search, status, paymentMethod, courseId, dateFrom, dateTo, page]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadData(buildFilters({ page: 1 }));
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, status, paymentMethod, courseId, dateFrom, dateTo]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadData(buildFilters({ page: newPage }));
  }

  const exportFilters = {
    search,
    status,
    paymentMethod,
    courseId,
    dateFrom,
    dateTo,
  };

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const showFrom = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, count);

  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, order ID, payment ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentMethod} onValueChange={(v) => v && setPaymentMethod(v)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="razorpay">Online (Razorpay)</SelectItem>
            <SelectItem value="manual_cash">Cash</SelectItem>
            <SelectItem value="manual_upi">UPI</SelectItem>
            <SelectItem value="manual_bank">Bank Transfer</SelectItem>
          </SelectContent>
        </Select>
        {courses.length > 0 && (
          <Select value={courseId} onValueChange={(v) => v && setCourseId(v)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ExportButton dataset="orders" filters={exportFilters} />
      </div>

      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        presets={false}
      />

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Order ID</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[60px]" />
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
                  No orders found. Adjust your filters or wait for the first payment.
                </TableCell>
              </TableRow>
            ) : (
              data.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedOrder(order.id)}
                >
                  <TableCell className="font-mono text-xs">
                    {order.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="font-medium">
                    {order.student?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate">
                    {order.course?.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatINR(order.final_amount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[order.status] ?? ""}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dateFormatter.format(new Date(order.created_at))}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {count > 0 ? `Showing ${showFrom}–${showTo} of ${count}` : "No results"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Detail drawer */}
      <OrderDetailDrawer
        orderId={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
