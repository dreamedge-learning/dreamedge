"use client";

import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import {
  Search, ChevronLeft, ChevronRight, ChevronDown,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "@/components/admin/revenue/date-range-filter";
import { ExportButton } from "@/components/admin/export-button";
import { formatRelativeTime } from "@/lib/format";
import { getAuditLog } from "@/app/admin/(panel)/settings/actions";
import type { AuditLogRow, AdminUserLite } from "@/app/admin/(panel)/settings/actions";

const PAGE_SIZE = 20;

const ENTITY_TYPES = [
  "all", "course", "student", "order", "admin_user", "content_item",
  "test", "refund", "referral_code", "enrollment", "live_class", "role",
];

interface AuditLogTableProps {
  initialData: AuditLogRow[];
  initialCount: number;
  adminUsers: AdminUserLite[];
}

export function AuditLogTable({ initialData, initialCount, adminUsers }: AuditLogTableProps) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requestIdRef = useRef(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of adminUsers) {
      map[u.user_id] = u.full_name;
    }
    return map;
  }, [adminUsers]);

  const loadData = useCallback((filters: {
    page: number;
    search: string;
    entityType: string;
    dateFrom: string;
    dateTo: string;
    userId: string;
  }) => {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      const result = await getAuditLog({
        page: filters.page,
        pageSize: PAGE_SIZE,
        search: filters.search,
        entityType: filters.entityType,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        userId: filters.userId,
      });
      if (requestIdRef.current !== requestId) return;
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setData(result.data ?? []);
      setCount(result.count);
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadData({ page: 1, search, entityType, dateFrom, dateTo, userId });
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, entityType, dateFrom, dateTo, userId, loadData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadData({ page: newPage, search, entityType, dateFrom, dateTo, userId });
  }

  const exportFilters = { search, entityType, userId, dateFrom, dateTo };

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={entityType} onValueChange={(v) => { if (v) setEntityType(v); }}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Entity Type" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "all" ? "All Types" : t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userId} onValueChange={(v) => { if (v) setUserId(v); }}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {adminUsers.map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          presets={false}
        />

        <ExportButton dataset="audit-log" filters={exportFilters} size="default" />
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead className="hidden md:table-cell">Entity ID</TableHead>
              <TableHead className="hidden lg:table-cell">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && data.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No audit log entries found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const isExpanded = expandedId === row.id;
                const hasDetail = row.old_data || row.new_data || row.metadata;
                return (
                  <TableRow
                    key={row.id}
                    className={`${isPending ? "opacity-50" : ""} ${hasDetail ? "cursor-pointer" : ""}`}
                    onClick={() => hasDetail && setExpandedId(isExpanded ? null : row.id)}
                  >
                    <TableCell className="w-8 px-2">
                      {hasDetail && (
                        isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatRelativeTime(row.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {userMap[row.user_id ?? ""] ?? "System"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-mono">
                        {row.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.entity_type}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono truncate max-w-[120px]">
                      {row.entity_id ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {row.ip_address ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {expandedId && (() => {
          const row = data.find((r) => r.id === expandedId);
          if (!row) return null;
          return (
            <div className="border-t bg-muted/30 px-4 py-3 text-sm space-y-2">
              {row.old_data && (
                <div>
                  <span className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Old Data</span>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(row.old_data, null, 2)}
                  </pre>
                </div>
              )}
              {row.new_data && (
                <div>
                  <span className="font-medium text-xs text-muted-foreground uppercase tracking-wider">New Data</span>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(row.new_data, null, 2)}
                  </pre>
                </div>
              )}
              {row.metadata && (
                <div>
                  <span className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Metadata</span>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
