"use client";

import { useState, useCallback, useRef, useTransition, useEffect } from "react";
import {
  Search, MoreHorizontal, UserPlus, ChevronLeft, ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import {
  getAdminTeam, toggleAdminActive, deleteAdmin,
} from "@/app/admin/(panel)/settings/actions";
import type { AdminTeamRow, RoleRow } from "@/app/admin/(panel)/settings/actions";
import { ExportButton } from "@/components/admin/export-button";
import { InviteAdminDialog } from "./invite-admin-dialog";
import { EditAdminDialog } from "./edit-admin-dialog";

const PAGE_SIZE = 10;

interface AdminTeamTableProps {
  initialData: AdminTeamRow[];
  initialCount: number;
  roles: RoleRow[];
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  content_creator: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  teacher: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  accountant: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  support_staff: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  technical: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
};

function formatRoleName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AdminTeamTable({ initialData, initialCount, roles }: AdminTeamTableProps) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminTeamRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AdminTeamRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTeamRow | null>(null);
  const [actionPending, startActionTransition] = useTransition();

  const requestIdRef = useRef(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback((filters: { page: number; search: string }) => {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      const result = await getAdminTeam({
        page: filters.page,
        pageSize: PAGE_SIZE,
        search: filters.search,
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
      loadData({ page: 1, search });
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, loadData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadData({ page: newPage, search });
  }

  function reload() {
    loadData({ page, search });
  }

  function handleToggle() {
    if (!toggleTarget) return;
    startActionTransition(async () => {
      const result = await toggleAdminActive(toggleTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          toggleTarget.is_active
            ? "Admin deactivated"
            : "Admin activated"
        );
        reload();
      }
      setToggleTarget(null);
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startActionTransition(async () => {
      const result = await deleteAdmin(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Admin deleted");
        reload();
      }
      setDeleteTarget(null);
    });
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <ExportButton dataset="admin-team" filters={{ search }} />
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite Admin
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Last Login</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && data.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No admin users found.
                  <Button variant="link" className="ml-1" onClick={() => setInviteOpen(true)}>
                    Invite one?
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} className={isPending ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{row.full_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{row.email}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {row.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${ROLE_COLORS[row.roles?.name ?? ""] ?? ""}`}
                    >
                      {formatRoleName(row.roles?.name ?? "unknown")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "default" : "outline"} className="text-xs">
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {row.last_login_at ? formatRelativeTime(row.last_login_at) : "Never"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatRelativeTime(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(row)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setToggleTarget(row)}>
                          {row.is_active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(row)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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

      <InviteAdminDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles}
        onSuccess={reload}
      />

      {editTarget && (
        <EditAdminDialog
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          admin={editTarget}
          roles={roles}
          onSuccess={reload}
        />
      )}

      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => { if (!open) setToggleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? "Deactivate Admin" : "Activate Admin"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `Deactivating "${toggleTarget?.full_name}" will revoke their admin access. They won't be able to log in until reactivated.`
                : `Reactivating "${toggleTarget?.full_name}" will restore their admin access.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggle}
              disabled={actionPending}
              variant={toggleTarget?.is_active ? "destructive" : "default"}
            >
              {actionPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {toggleTarget?.is_active ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Admin</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{deleteTarget?.full_name}&quot; from the admin team. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionPending}
              variant="destructive"
            >
              {actionPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
