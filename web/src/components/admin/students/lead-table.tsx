"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Plus,
  UserPlus,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ExportButton } from "@/components/admin/export-button";
import { LeadFormDialog } from "./lead-form";
import {
  fetchLeads,
  updateLead,
  deleteLead,
  convertLeadToStudent,
} from "@/app/admin/(panel)/students/actions";
import type { Lead } from "@/types/database";

const statusColors: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  contacted: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  interested: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  converted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  lost: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const sourceLabels: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  ad: "Ad",
  walk_in: "Walk-in",
  other: "Other",
};

interface LeadTableProps {
  initialData: Lead[];
}

export function LeadTable({ initialData }: LeadTableProps) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingRemarks, setEditingRemarks] = useState<string | null>(null);
  const [remarksValue, setRemarksValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadData = useCallback(
    (overrides: Record<string, string> = {}) => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await fetchLeads({
          search: overrides.search ?? search,
          status: overrides.status ?? statusFilter,
          source: overrides.source ?? sourceFilter,
        });
        if (requestId !== requestIdRef.current) return;
        if (!result.error) {
          setData(result.data as Lead[]);
        }
      });
    },
    [search, statusFilter, sourceFilter]
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadData({ search: value });
      }, 350);
    },
    [loadData]
  );

  const handleStatusUpdate = (id: string, status: string) => {
    startTransition(async () => {
      const result = await updateLead(id, { status });
      if (result.error) {
        toast.error(result.error);
      } else {
        loadData();
      }
    });
  };

  const handleRemarksUpdate = (id: string) => {
    startTransition(async () => {
      const result = await updateLead(id, { remarks: remarksValue });
      if (result.error) {
        toast.error(result.error);
      } else {
        setEditingRemarks(null);
        loadData();
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteLead(id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Lead deleted");
        loadData();
      }
    });
  };

  const handleConvert = (id: string) => {
    startTransition(async () => {
      const result = await convertLeadToStudent(id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message ?? "Lead marked as converted");
        loadData();
      }
    });
  };

  const isStale = (createdAt: string, status: string) => {
    if (status !== "new") return false;
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return diffHours >= 48;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { if (!v) return; setStatusFilter(v); loadData({ status: v }); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="interested">Interested</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={(v) => { if (!v) return; setSourceFilter(v); loadData({ source: v }); }}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="ad">Ad</SelectItem>
              <SelectItem value="walk_in">Walk-in</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <ExportButton
            dataset="leads"
            filters={{ search, status: statusFilter, source: sourceFilter }}
            size="default"
          />

          <Button
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No leads found
                </TableCell>
              </TableRow>
            ) : (
              data.map((lead) => (
                <TableRow
                  key={lead.id}
                  className={isStale(lead.created_at, lead.status)
                    ? "bg-red-500/5 border-l-2 border-l-red-500"
                    : ""
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isStale(lead.created_at, lead.status) && (
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <span className="font-medium">{lead.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-0.5">
                      {lead.phone && <p>{lead.phone}</p>}
                      {lead.email && <p className="text-muted-foreground">{lead.email}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {sourceLabels[lead.source] ?? lead.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lead.status}
                      onValueChange={(v) => v && handleStatusUpdate(lead.id, v)}
                    >
                      <SelectTrigger className="h-7 w-[110px]">
                        <Badge className={`${statusColors[lead.status]} text-xs`} variant="secondary">
                          {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="interested">Interested</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {editingRemarks === lead.id ? (
                      <div className="flex items-center gap-1">
                        <Textarea
                          value={remarksValue}
                          onChange={(e) => setRemarksValue(e.target.value)}
                          rows={2}
                          className="text-xs"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemarksUpdate(lead.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingRemarks(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <p
                        className="text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setEditingRemarks(lead.id);
                          setRemarksValue(lead.remarks ?? "");
                        }}
                      >
                        {lead.remarks || "Click to add remarks..."}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {lead.status !== "converted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-emerald-600"
                          onClick={() => handleConvert(lead.id)}
                          title="Convert to student"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500"
                        onClick={() => handleDelete(lead.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LeadFormDialog open={showForm} onClose={() => { setShowForm(false); loadData(); }} />
    </div>
  );
}
