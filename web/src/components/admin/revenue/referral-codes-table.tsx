"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Plus, ChevronLeft, ChevronRight, Loader2,
  ToggleLeft, ToggleRight, Pencil, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchReferralCodes,
  toggleReferralCode,
  deleteReferralCode,
  type ReferralCodeRow,
} from "@/app/admin/(panel)/revenue/actions";
import { formatINR } from "@/lib/format";
import { ReferralCodeForm } from "./referral-code-form";
import { ExportButton } from "@/components/admin/export-button";

interface ReferralCodesTableProps {
  initialData: ReferralCodeRow[];
  initialCount: number;
}

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ReferralCodesTable({ initialData, initialCount }: ReferralCodesTableProps) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<ReferralCodeRow | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(
    (filters: { search?: string; status?: string; page?: number }) => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await fetchReferralCodes({
          search: filters.search,
          status: filters.status,
          page: filters.page,
          pageSize: PAGE_SIZE,
        });
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadData({ search, status: statusFilter, page: 1 });
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, statusFilter, loadData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadData({ search, status: statusFilter, page: newPage });
  }

  async function handleToggle(id: string) {
    const result = await toggleReferralCode(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Referral code updated.");
    loadData({ search, status: statusFilter, page });
  }

  async function handleDelete(id: string, code: string) {
    if (!confirm(`Delete referral code "${code}"? This cannot be undone.`)) return;
    const result = await deleteReferralCode(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Referral code deleted.");
    loadData({ search, status: statusFilter, page });
  }

  function isExpired(row: ReferralCodeRow): boolean {
    if (!row.valid_until) return false;
    return new Date(row.valid_until) < new Date();
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const showFrom = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <ExportButton
          dataset="referral-codes"
          filters={{
            search,
            active: statusFilter === "all" ? "all" : String(statusFilter === "active"),
          }}
          size="default"
        />
        <Button size="sm" className="h-9" onClick={() => { setEditingCode(null); setShowForm(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Code
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                  No referral codes yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const expired = isExpired(row);
                const atCapacity = row.max_uses !== null && row.usage_count >= row.max_uses;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono font-medium">{row.code}</TableCell>
                    <TableCell>
                      {row.discount_type === "percentage"
                        ? `${row.discount_value}%`
                        : formatINR(row.discount_value)}
                    </TableCell>
                    <TableCell>
                      {row.usage_count}
                      {row.max_uses !== null ? ` / ${row.max_uses}` : ""}
                    </TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="secondary" className="text-xs">Expired</Badge>
                      ) : atCapacity ? (
                        <Badge variant="secondary" className="text-xs">Maxed</Badge>
                      ) : row.is_active ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
                          Disabled
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.valid_until
                        ? dateFormatter.format(new Date(row.valid_until))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dateFormatter.format(new Date(row.created_at))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={row.is_active ? "Disable" : "Enable"}
                          onClick={() => handleToggle(row.id)}
                        >
                          {row.is_active
                            ? <ToggleRight className="h-4 w-4 text-emerald-600" />
                            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Edit"
                          onClick={() => { setEditingCode(row); setShowForm(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          title="Delete"
                          onClick={() => handleDelete(row.id, row.code)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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

      <ReferralCodeForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setEditingCode(null);
            loadData({ search, status: statusFilter, page });
          }
        }}
        editingCode={editingCode}
      />
    </div>
  );
}
